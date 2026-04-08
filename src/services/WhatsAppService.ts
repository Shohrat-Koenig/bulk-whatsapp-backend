import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import type { Response } from "express";
import type { WhatsAppStatus, SSESubscriber } from "../types/index.js";

class WhatsAppService {
  private client: InstanceType<typeof Client> | null = null;
  private status: WhatsAppStatus = "disconnected";
  private qrDataUrl: string | null = null;
  private phoneNumber: string | null = null;
  private profileName: string | null = null;
  private authSubscribers: Set<SSESubscriber> = new Set();

  async initialize(): Promise<void> {
    if (this.client) return;

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--disable-gpu",
        ],
      },
    });

    this.client.on("qr", async (qr: string) => {
      this.status = "qr_pending";
      try {
        this.qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      } catch {
        this.qrDataUrl = null;
      }
      this.broadcastAuth({ type: "qr", qrDataUrl: this.qrDataUrl, status: this.status });
    });

    this.client.on("loading_screen", () => {
      this.status = "connecting";
      this.broadcastAuth({ type: "status", status: this.status });
    });

    this.client.on("authenticated", () => {
      this.status = "connecting";
      this.broadcastAuth({ type: "status", status: this.status });
    });

    this.client.on("ready", async () => {
      this.status = "connected";
      try {
        const info = this.client!.info;
        this.phoneNumber = info?.wid?.user || null;
        this.profileName = info?.pushname || null;
      } catch {
        this.phoneNumber = null;
        this.profileName = null;
      }
      this.broadcastAuth({
        type: "ready",
        status: this.status,
        phoneNumber: this.phoneNumber,
        profileName: this.profileName,
      });
    });

    this.client.on("auth_failure", (msg: string) => {
      this.status = "failed";
      this.broadcastAuth({ type: "auth_failure", status: this.status, error: msg });
    });

    this.client.on("disconnected", (reason: string) => {
      this.status = "disconnected";
      this.phoneNumber = null;
      this.profileName = null;
      this.qrDataUrl = null;
      this.broadcastAuth({ type: "disconnected", status: this.status, reason });
    });

    console.log("[WhatsApp] Initializing client...");
    await this.client.initialize();
  }

  private broadcastAuth(data: Record<string, unknown>): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const subscriber of this.authSubscribers) {
      try {
        subscriber.write(payload);
      } catch {
        this.authSubscribers.delete(subscriber);
      }
    }
  }

  subscribeToAuth(res: Response): void {
    this.authSubscribers.add(res);
    res.on("close", () => this.authSubscribers.delete(res));

    // Send current state immediately
    if (this.status === "connected") {
      res.write(
        `data: ${JSON.stringify({
          type: "ready",
          status: this.status,
          phoneNumber: this.phoneNumber,
          profileName: this.profileName,
        })}\n\n`
      );
    } else if (this.status === "qr_pending" && this.qrDataUrl) {
      res.write(
        `data: ${JSON.stringify({
          type: "qr",
          qrDataUrl: this.qrDataUrl,
          status: this.status,
        })}\n\n`
      );
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "status", status: this.status })}\n\n`
      );
    }
  }

  getStatus(): {
    status: WhatsAppStatus;
    phoneNumber: string | null;
    profileName: string | null;
  } {
    return {
      status: this.status,
      phoneNumber: this.phoneNumber,
      profileName: this.profileName,
    };
  }

  async isRegisteredUser(chatId: string): Promise<boolean> {
    if (!this.client || this.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    return this.client.isRegisteredUser(chatId);
  }

  async sendMessage(chatId: string, message: string): Promise<void> {
    if (!this.client || this.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    await this.client.sendMessage(chatId, message);
  }

  async logout(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors
      }
      try {
        await this.client.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.client = null;
    }
    this.status = "disconnected";
    this.phoneNumber = null;
    this.profileName = null;
    this.qrDataUrl = null;
    this.broadcastAuth({ type: "disconnected", status: this.status, reason: "user_logout" });
  }

  async destroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch {
        // Ignore
      }
      this.client = null;
    }
  }
}

// Singleton
export const whatsappService = new WhatsAppService();
