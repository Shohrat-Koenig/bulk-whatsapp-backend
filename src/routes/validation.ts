import { Router } from "express";
import { normalizePhones } from "../services/PhoneService.js";
import { whatsappService } from "../services/WhatsAppService.js";
import type { ValidationResult } from "../types/index.js";

const router = Router();

// Validate and check WhatsApp registration for a list of phone numbers
router.post("/validate-numbers", async (req, res) => {
  const { phones, defaultCountryCode } = req.body as {
    phones: { rawPhone: string; rowIndex: number; country?: string | null }[];
    defaultCountryCode: string;
  };

  if (!phones || !Array.isArray(phones) || !defaultCountryCode) {
    res.status(400).json({ error: "Missing phones or defaultCountryCode" });
    return;
  }

  // Step 1: Normalize all phone numbers
  const normalized = normalizePhones(phones, defaultCountryCode);

  // Step 2: Check WhatsApp registration for valid numbers
  const results: ValidationResult[] = [];

  for (const entry of normalized) {
    if (!entry.isValid || !entry.chatId) {
      results.push({ ...entry, isOnWhatsApp: null });
      continue;
    }

    try {
      const isRegistered = await whatsappService.isRegisteredUser(entry.chatId);
      results.push({ ...entry, isOnWhatsApp: isRegistered });
    } catch (err) {
      results.push({
        ...entry,
        isOnWhatsApp: null,
        error: err instanceof Error ? err.message : "Check failed",
      });
    }
  }

  // Summary
  const valid = results.filter((r) => r.isValid && r.isOnWhatsApp === true).length;
  const notOnWhatsApp = results.filter((r) => r.isValid && r.isOnWhatsApp === false).length;
  const invalid = results.filter((r) => !r.isValid).length;
  const checkFailed = results.filter((r) => r.isValid && r.isOnWhatsApp === null).length;

  res.json({
    results,
    summary: {
      total: results.length,
      valid,
      notOnWhatsApp,
      invalid,
      checkFailed,
    },
  });
});

export default router;
