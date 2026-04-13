import { v4 as uuidv4 } from "uuid";
import { whatsappSessions } from "./WhatsAppSessionManager.js";
import type {
  CampaignState,
  CampaignContact,
  CampaignRequest,
} from "../types/index.js";

function interpolateTemplate(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const trimmedKey = key.trim();

    // 1. Exact match
    if (trimmedKey in data && data[trimmedKey] !== "") {
      return data[trimmedKey];
    }

    // 2. Case-insensitive exact match
    const ciMatch = Object.entries(data).find(
      ([k]) => k.trim().toLowerCase() === trimmedKey.toLowerCase()
    );
    if (ciMatch && ciMatch[1] !== "") return ciMatch[1];

    // 3. Fuzzy: column CONTAINS the placeholder (e.g. {Client} matches "Client Name")
    const containsMatch = Object.entries(data).find(
      ([k]) => k.trim().toLowerCase().includes(trimmedKey.toLowerCase())
    );
    if (containsMatch && containsMatch[1] !== "") return containsMatch[1];

    // 4. Fuzzy: placeholder CONTAINS the column name
    const reverseMatch = Object.entries(data).find(
      ([k]) => trimmedKey.toLowerCase().includes(k.trim().toLowerCase()) && k.trim().length > 2
    );
    if (reverseMatch && reverseMatch[1] !== "") return reverseMatch[1];

    return `{${trimmedKey}}`;
  });
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CampaignStateWithOwner extends CampaignState {
  ownerUserId: string;
}

class CampaignService {
  private campaigns: Map<string, CampaignStateWithOwner> = new Map();
  private abortFlags: Map<string, boolean> = new Map();
  private pauseFlags: Map<string, boolean> = new Map();
  private pauseResolvers: Map<string, () => void> = new Map();

  startCampaign(userId: string, request: CampaignRequest): string {
    const id = uuidv4();

    const contacts: CampaignContact[] = request.contacts.map((c) => ({
      rowIndex: c.rowIndex,
      chatId: c.chatId,
      phone: c.phone,
      data: c.data,
      status: "pending",
    }));

    const state: CampaignStateWithOwner = {
      id,
      ownerUserId: userId,
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

    // Run async
    this.runSendLoop(id, request.messageTemplate);

    return id;
  }

  private async runSendLoop(campaignId: string, messageTemplate: string): Promise<void> {
    const state = this.campaigns.get(campaignId);
    if (!state) return;

    for (let i = 0; i < state.contacts.length; i++) {
      if (this.abortFlags.get(campaignId)) {
        state.status = "stopped";
        break;
      }

      if (this.pauseFlags.get(campaignId)) {
        state.status = "paused";
        await new Promise<void>((resolve) => {
          this.pauseResolvers.set(campaignId, resolve);
        });
        state.status = "running";
      }

      if (this.abortFlags.get(campaignId)) {
        state.status = "stopped";
        break;
      }

      const contact = state.contacts[i];
      state.currentIndex = i;
      contact.status = "sending";

      try {
        const message = interpolateTemplate(messageTemplate, contact.data);
        await whatsappSessions.sendMessage(state.ownerUserId, contact.chatId, message);
        contact.status = "sent";
        contact.sentAt = new Date().toISOString();
        state.sentCount++;
      } catch (err) {
        contact.status = "failed";
        contact.error = err instanceof Error ? err.message : "Unknown error";
        state.failedCount++;
      }

      if (i < state.contacts.length - 1 && !this.abortFlags.get(campaignId)) {
        await randomDelay(8000, 20000);
      }
    }

    if (state.status === "running") {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
    }
  }

  /**
   * Returns the campaign only if it belongs to the given userId.
   */
  getProgress(campaignId: string, userId: string): CampaignState | null {
    const state = this.campaigns.get(campaignId);
    if (!state || state.ownerUserId !== userId) return null;
    return state;
  }

  pauseCampaign(campaignId: string, userId: string): boolean {
    const state = this.campaigns.get(campaignId);
    if (!state || state.ownerUserId !== userId || state.status !== "running") return false;
    this.pauseFlags.set(campaignId, true);
    return true;
  }

  resumeCampaign(campaignId: string, userId: string): boolean {
    const state = this.campaigns.get(campaignId);
    if (!state || state.ownerUserId !== userId || state.status !== "paused") return false;
    this.pauseFlags.set(campaignId, false);
    const resolver = this.pauseResolvers.get(campaignId);
    if (resolver) {
      resolver();
      this.pauseResolvers.delete(campaignId);
    }
    return true;
  }

  stopCampaign(campaignId: string, userId: string): boolean {
    const state = this.campaigns.get(campaignId);
    if (!state || state.ownerUserId !== userId) return false;
    if (state.status !== "running" && state.status !== "paused") return false;
    this.abortFlags.set(campaignId, true);
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
}

export const campaignService = new CampaignService();
