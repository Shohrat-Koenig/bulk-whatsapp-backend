import { Router } from "express";
import { normalizePhones } from "../services/PhoneService.js";
import { whatsappSessions } from "../services/WhatsAppSessionManager.js";
import { requireAuth } from "../middleware/auth.js";
import type { ValidationResult } from "../types/index.js";

const router = Router();

// Validate and check WhatsApp registration for a list of phone numbers (per user)
router.post("/validate-numbers", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { phones, defaultCountryCode } = req.body as {
    phones: { rawPhone: string; rowIndex: number; country?: string | null }[];
    defaultCountryCode?: string;
  };

  if (!phones || !Array.isArray(phones)) {
    res.status(400).json({ error: "Missing phones" });
    return;
  }

  // defaultCountryCode is optional — if absent, numbers without country or + prefix
  // will be marked invalid
  const normalized = normalizePhones(phones, defaultCountryCode);
  const results: ValidationResult[] = [];

  for (const entry of normalized) {
    if (!entry.isValid || !entry.chatId) {
      results.push({ ...entry, isOnWhatsApp: null });
      continue;
    }

    try {
      const isRegistered = await whatsappSessions.isRegisteredUser(userId, entry.chatId);
      results.push({ ...entry, isOnWhatsApp: isRegistered });
    } catch (err) {
      results.push({
        ...entry,
        isOnWhatsApp: null,
        error: err instanceof Error ? err.message : "Check failed",
      });
    }
  }

  const valid = results.filter((r) => r.isValid && r.isOnWhatsApp === true).length;
  const notOnWhatsApp = results.filter((r) => r.isValid && r.isOnWhatsApp === false).length;
  const invalid = results.filter((r) => !r.isValid).length;
  const checkFailed = results.filter((r) => r.isValid && r.isOnWhatsApp === null).length;

  res.json({
    results,
    summary: { total: results.length, valid, notOnWhatsApp, invalid, checkFailed },
  });
});

export default router;
