import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import fs from "fs/promises";
import path from "path";
import type { WhatsAppStatus } from "../types/index.js";

interface UserSession {
  userId: string;
  client: InstanceType<typeof Client> | null;
  status: WhatsAppStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  profileName: string | null;
  lastActivity: number;
  initializing: boolean;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SESSIONS || "10", 10);

class WhatsAppSessionManager {
  private sessions: Map<string, UserSession> = new Map();

  constructor() {
    // Background idle eviction
    setInterval(() => this.evictIdle(), EVICTION_INTERVAL_MS);
  }

  /**
   * Get an existing session for this user, or create a new one.
   * Updates lastActivity timestamp.
   */
  getOrCreateSession(userId: string): UserSession {
    let session = this.sessions.get(userId);

    if (!session) {
      // Enforce max concurrent — evict the most-idle session if at capacity
      if (this.sessions.size >= MAX_CONCURRENT) {
        this.evictMostIdle();
      }
      session = this.createSession(userId);
      this.sessions.set(userId, session);
    }

    session.lastActivity = Date.now();
    return session;
  }

  private createSession(userId: string): UserSession {
    console.log(`[WhatsApp ${userId}] Creating new session`);

    const session: UserSession = {
      userId,
      client: null,
      status: "disconnected",
      qrDataUrl: null,
      phoneNumber: null,
      profileName: null,
      lastActivity: Date.now(),
      initializing: true,
    };

    console.log(`[WhatsApp ${userId}] Configuring Puppeteer client...`);
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: userId }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        // NOTE: do NOT use --single-process or --no-zygote — they prevent Chromium
        // from properly flushing session state to disk, breaking LocalAuth persistence.
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-extensions",
        ],
      },
    });

    client.on("qr", async (qr: string) => {
      console.log(`[WhatsApp ${userId}] QR code received (${qr.length} chars)`);
      session.status = "qr_pending";
      try {
        session.qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      } catch (err) {
        console.error(`[WhatsApp ${userId}] QR render failed:`, err);
        session.qrDataUrl = null;
      }
    });

    client.on("loading_screen", (percent: number, message: string) => {
      console.log(`[WhatsApp ${userId}] Loading: ${percent}% — ${message}`);
      session.status = "connecting";
    });

    client.on("authenticated", () => {
      console.log(`[WhatsApp ${userId}] Authenticated`);
      session.status = "connecting";
    });

    client.on("ready", () => {
      session.status = "connected";
      session.initializing = false;
      try {
        const info = client.info;
        session.phoneNumber = info?.wid?.user || null;
        session.profileName = info?.pushname || null;
      } catch {
        session.phoneNumber = null;
        session.profileName = null;
      }
      console.log(`[WhatsApp ${userId}] Connected as ${session.profileName} (${session.phoneNumber})`);
    });

    client.on("auth_failure", (msg: string) => {
      console.error(`[WhatsApp ${userId}] Auth failure:`, msg);
      session.status = "failed";
      session.initializing = false;
      // Clean up failed session so next poll creates a fresh one with a new QR
      this.cleanupSessionFiles(userId).finally(() => {
        this.sessions.delete(userId);
        // Destroy client in background
        client.destroy().catch(() => {});
      });
    });

    client.on("disconnected", (reason: string) => {
      console.log(`[WhatsApp ${userId}] Disconnected:`, reason);
      session.status = "disconnected";
      session.phoneNumber = null;
      session.profileName = null;
      session.qrDataUrl = null;
    });

    session.client = client;

    console.log(`[WhatsApp ${userId}] Calling client.initialize()...`);
    const initStart = Date.now();

    // Safety timeout: if initialize doesn't fire any event within 2 minutes, mark failed
    const initTimeout = setTimeout(() => {
      if (session.initializing) {
        console.error(`[WhatsApp ${userId}] Initialize timed out after 2 min — marking failed`);
        session.status = "failed";
        session.initializing = false;
        this.cleanupSessionFiles(userId).finally(() => {
          this.sessions.delete(userId);
          client.destroy().catch(() => {});
        });
      }
    }, 2 * 60 * 1000);

    client.initialize()
      .then(() => {
        const elapsed = ((Date.now() - initStart) / 1000).toFixed(1);
        console.log(`[WhatsApp ${userId}] client.initialize() resolved after ${elapsed}s (status=${session.status})`);
        clearTimeout(initTimeout);
      })
      .catch((err: Error) => {
        console.error(`[WhatsApp ${userId}] Initialize failed:`, err.message);
        session.initializing = false;
        session.status = "failed";
        clearTimeout(initTimeout);
        this.cleanupSessionFiles(userId).finally(() => {
          this.sessions.delete(userId);
        });
      });

    return session;
  }

  /**
   * Get the session WITHOUT creating one. Returns null if not found.
   * Updates lastActivity if found.
   */
  getSession(userId: string): UserSession | null {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
      return session;
    }
    return null;
  }

  async destroySession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    console.log(`[WhatsApp ${userId}] Destroying session`);
    if (session.client) {
      try {
        await session.client.destroy();
      } catch {
        // Ignore destroy errors
      }
    }
    this.sessions.delete(userId);
  }

  /**
   * Wipe the on-disk LocalAuth files for a user — used after auth_failure to
   * ensure the next session attempt starts clean.
   */
  private async cleanupSessionFiles(userId: string): Promise<void> {
    // whatsapp-web.js LocalAuth stores sessions at .wwebjs_auth/session-<clientId>
    const sessionDir = path.resolve(process.cwd(), ".wwebjs_auth", `session-${userId}`);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`[WhatsApp ${userId}] Cleaned up session files`);
    } catch (err) {
      console.warn(`[WhatsApp ${userId}] Cleanup failed:`, err instanceof Error ? err.message : err);
    }
  }

  async logout(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    if (session.client) {
      try {
        await session.client.logout();
      } catch {
        // Ignore
      }
      try {
        await session.client.destroy();
      } catch {
        // Ignore
      }
    }
    this.sessions.delete(userId);
  }

  async isRegisteredUser(userId: string, chatId: string): Promise<boolean> {
    const session = this.getSession(userId);
    if (!session || !session.client || session.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    return session.client.isRegisteredUser(chatId);
  }

  async sendMessage(userId: string, chatId: string, message: string): Promise<void> {
    const session = this.getSession(userId);
    if (!session || !session.client || session.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    await session.client.sendMessage(chatId, message);
  }

  /**
   * Evict sessions that have been idle longer than IDLE_TIMEOUT_MS.
   */
  private evictIdle(): void {
    const now = Date.now();
    for (const [userId, session] of this.sessions) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[WhatsApp ${userId}] Evicting idle session (last activity ${Math.round((now - session.lastActivity) / 60000)} min ago)`);
        this.destroySession(userId).catch(console.error);
      }
    }
  }

  /**
   * Evict the most-idle session when at MAX_CONCURRENT capacity.
   */
  private evictMostIdle(): void {
    let oldestUserId: string | null = null;
    let oldestActivity = Date.now();
    for (const [userId, session] of this.sessions) {
      if (session.lastActivity < oldestActivity) {
        oldestActivity = session.lastActivity;
        oldestUserId = userId;
      }
    }
    if (oldestUserId) {
      console.log(`[WhatsApp] At capacity (${MAX_CONCURRENT}) — evicting oldest: ${oldestUserId}`);
      this.destroySession(oldestUserId).catch(console.error);
    }
  }

  async destroyAll(): Promise<void> {
    const userIds = Array.from(this.sessions.keys());
    await Promise.all(userIds.map((id) => this.destroySession(id)));
  }

  getStats() {
    return {
      activeSessions: this.sessions.size,
      maxConcurrent: MAX_CONCURRENT,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    };
  }
}

// Singleton
export const whatsappSessions = new WhatsAppSessionManager();
