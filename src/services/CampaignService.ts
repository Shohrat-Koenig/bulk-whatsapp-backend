import { v4 as uuidv4 } from "uuid";
import { whatsappService } from "./WhatsAppService.js";
import type {
  CampaignState,
  CampaignContact,
  CampaignRequest,
  SSESubscriber,
} from "../types/index.js";

function interpolateTemplate(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = data[key.trim()];
    return value !== undefined && value !== null && value !== "" ? value : `{${key.trim()}}`;
  });
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CampaignService {
  private campaigns: Map<string, CampaignState> = new Map();
  private abortFlags: Map<string, boolean> = new Map();
  private pauseFlags: Map<string, boolean> = new Map();
  private pauseResolvers: Map<string, () => void> = new Map();
  private sseSubscribers: Map<string, Set<SSESubscriber>> = new Map();

  startCampaign(request: CampaignRequest): string {
    const id = uuidv4();

    const contacts: CampaignContact[] = request.contacts.map((c) => ({
      rowIndex: c.rowIndex,
      chatId: c.chatId,
      phone: c.phone,
      data: c.data,
      status: "pending",
    }));

    const state: CampaignState = {
      id,
      status: "running",
      contacts,
      currentIndex: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      startedAt: new Date().toISOString(),
    };

    this.campaigns.set(id, state);
    this.abortFlags.set(id, false);
    this.pauseFlags.set(id, false);
    this.sseSubscribers.set(id, new Set());

    // Run the send loop asynchronously
    this.runSendLoop(id, request.messageTemplate);

    return id;
  }

  private async runSendLoop(campaignId: string, messageTemplate: string): Promise<void> {
    const state = this.campaigns.get(campaignId);
    if (!state) return;

    for (let i = 0; i < state.contacts.length; i++) {
      // Check abort
      if (this.abortFlags.get(campaignId)) {
        state.status = "stopped";
        this.broadcastProgress(campaignId, {
          type: "stopped",
          campaignId,
          ...this.getSummary(campaignId),
        });
        break;
      }

      // Check pause
      if (this.pauseFlags.get(campaignId)) {
        state.status = "paused";
        this.broadcastProgress(campaignId, {
          type: "paused",
          campaignId,
          currentIndex: i,
          ...this.getSummary(campaignId),
        });
        // Wait until resumed
        await new Promise<void>((resolve) => {
          this.pauseResolvers.set(campaignId, resolve);
        });
        state.status = "running";
        this.broadcastProgress(campaignId, {
          type: "resumed",
          campaignId,
          currentIndex: i,
          ...this.getSummary(campaignId),
        });
      }

      // Check abort again after resume
      if (this.abortFlags.get(campaignId)) {
        state.status = "stopped";
        this.broadcastProgress(campaignId, {
          type: "stopped",
          campaignId,
          ...this.getSummary(campaignId),
        });
        break;
      }

      const contact = state.contacts[i];
      state.currentIndex = i;
      contact.status = "sending";

      this.broadcastProgress(campaignId, {
        type: "sending",
        campaignId,
        rowIndex: contact.rowIndex,
        phone: contact.phone,
        currentIndex: i,
        total: state.contacts.length,
      });

      try {
        const message = interpolateTemplate(messageTemplate, contact.data);
        await whatsappService.sendMessage(contact.chatId, message);
        contact.status = "sent";
        contact.sentAt = new Date().toISOString();
        state.sentCount++;

        this.broadcastProgress(campaignId, {
          type: "contact_result",
          campaignId,
          rowIndex: contact.rowIndex,
          phone: contact.phone,
          status: "sent",
          currentIndex: i,
          ...this.getSummary(campaignId),
        });
      } catch (err) {
        contact.status = "failed";
        contact.error = err instanceof Error ? err.message : "Unknown error";
        state.failedCount++;

        this.broadcastProgress(campaignId, {
          type: "contact_result",
          campaignId,
          rowIndex: contact.rowIndex,
          phone: contact.phone,
          status: "failed",
          error: contact.error,
          currentIndex: i,
          ...this.getSummary(campaignId),
        });
      }

      // Random delay between 8-20 seconds (except after last contact)
      if (i < state.contacts.length - 1 && !this.abortFlags.get(campaignId)) {
        await randomDelay(8000, 20000);
      }
    }

    // Mark completed if not stopped
    if (state.status === "running") {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      this.broadcastProgress(campaignId, {
        type: "completed",
        campaignId,
        ...this.getSummary(campaignId),
      });
    }
  }

  pauseCampaign(campaignId: string): boolean {
    const state = this.campaigns.get(campaignId);
    if (!state || state.status !== "running") return false;
    this.pauseFlags.set(campaignId, true);
    return true;
  }

  resumeCampaign(campaignId: string): boolean {
    const state = this.campaigns.get(campaignId);
    if (!state || state.status !== "paused") return false;
    this.pauseFlags.set(campaignId, false);
    const resolver = this.pauseResolvers.get(campaignId);
    if (resolver) {
      resolver();
      this.pauseResolvers.delete(campaignId);
    }
    return true;
  }

  stopCampaign(campaignId: string): boolean {
    const state = this.campaigns.get(campaignId);
    if (!state || (state.status !== "running" && state.status !== "paused")) return false;
    this.abortFlags.set(campaignId, true);
    // If paused, also resume to let the loop exit
    if (state.status === "paused") {
      this.pauseFlags.set(campaignId, false);
      const resolver = this.pauseResolvers.get(campaignId);
      if (resolver) {
        resolver();
        this.pauseResolvers.delete(campaignId);
      }
    }
    return true;
  }

  getProgress(campaignId: string): CampaignState | null {
    return this.campaigns.get(campaignId) || null;
  }

  subscribeToCampaign(campaignId: string, res: SSESubscriber): void {
    const subs = this.sseSubscribers.get(campaignId);
    if (subs) {
      subs.add(res);
      res.on("close", () => subs.delete(res));
    }

    // Send current state
    const state = this.campaigns.get(campaignId);
    if (state) {
      res.write(
        `data: ${JSON.stringify({
          type: "state",
          campaignId,
          status: state.status,
          contacts: state.contacts,
          ...this.getSummary(campaignId),
        })}\n\n`
      );
    }
  }

  private getSummary(campaignId: string) {
    const state = this.campaigns.get(campaignId);
    if (!state) return {};
    return {
      sentCount: state.sentCount,
      failedCount: state.failedCount,
      skippedCount: state.skippedCount,
      total: state.contacts.length,
      currentIndex: state.currentIndex,
    };
  }

  private broadcastProgress(campaignId: string, data: Record<string, unknown>): void {
    const subs = this.sseSubscribers.get(campaignId);
    if (!subs) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const sub of subs) {
      try {
        sub.write(payload);
      } catch {
        subs.delete(sub);
      }
    }
  }
}

export const campaignService = new CampaignService();
