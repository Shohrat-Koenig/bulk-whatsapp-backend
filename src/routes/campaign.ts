import { Router } from "express";
import { campaignService } from "../services/CampaignService.js";
import { getUsage, checkAllowed } from "../services/QuotaService.js";
import { requireAuth } from "../middleware/auth.js";
import type { CampaignRequest } from "../types/index.js";

const router = Router();

// GET current user's quota usage
router.get("/quota", requireAuth, async (req, res) => {
  try {
    const usage = await getUsage(req.userId!);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch quota" });
  }
});

// Start a new campaign for the current user
router.post("/send-campaign", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { contacts, messageTemplate } = req.body as CampaignRequest;

  if (!contacts || !Array.isArray(contacts) || !messageTemplate) {
    res.status(400).json({ error: "Missing contacts or messageTemplate" });
    return;
  }

  if (contacts.length === 0) {
    res.status(400).json({ error: "No contacts to send to" });
    return;
  }

  if (contacts.length > 150) {
    res.status(400).json({ error: "Maximum 150 contacts per campaign" });
    return;
  }

  // Enforce quota limits (50/day, 200/month) before starting
  const check = await checkAllowed(userId, contacts.length);
  if (!check.allowed) {
    res.status(429).json({
      error: check.reason || "Quota exceeded",
      usage: check.usage,
    });
    return;
  }

  const campaignId = campaignService.startCampaign(userId, { contacts, messageTemplate });
  res.json({ campaignId });
});

// Pause campaign
router.post("/campaign/:id/pause", requireAuth, (req, res) => {
  const success = campaignService.pauseCampaign(String(req.params.id), req.userId!);
  res.json({ success });
});

// Resume campaign
router.post("/campaign/:id/resume", requireAuth, (req, res) => {
  const success = campaignService.resumeCampaign(String(req.params.id), req.userId!);
  res.json({ success });
});

// Stop campaign
router.post("/campaign/:id/stop", requireAuth, (req, res) => {
  const success = campaignService.stopCampaign(String(req.params.id), req.userId!);
  res.json({ success });
});

// Get campaign state
router.get("/campaign/:id", requireAuth, (req, res) => {
  const state = campaignService.getProgress(String(req.params.id), req.userId!);
  if (!state) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(state);
});

export default router;
