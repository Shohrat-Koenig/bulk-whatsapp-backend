import type { Response } from "express";

export type WhatsAppStatus =
  | "disconnected"
  | "initializing"
  | "qr_pending"
  | "connecting"
  | "connected"
  | "failed";

export type ContactSendStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export type CampaignStatus =
  | "running"
  | "paused"
  | "stopped"
  | "completed";

export interface CampaignContact {
  rowIndex: number;
  chatId: string;
  phone: string;
  data: Record<string, string>;
  status: ContactSendStatus;
  error?: string;
  sentAt?: string;
}

export interface CampaignRequest {
  contacts: {
    rowIndex: number;
    chatId: string;
    phone: string;
    data: Record<string, string>;
  }[];
  messageTemplate: string;
}

export interface CampaignState {
  id: string;
  status: CampaignStatus;
  contacts: CampaignContact[];
  currentIndex: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  completedAt?: string;
}

export interface NormalizeResult {
  rawPhone: string;
  e164: string | null;
  chatId: string | null;
  isValid: boolean;
  error?: string;
}

export interface ValidationResult extends NormalizeResult {
  isOnWhatsApp: boolean | null;
  rowIndex: number;
}

export type SSESubscriber = Response;
