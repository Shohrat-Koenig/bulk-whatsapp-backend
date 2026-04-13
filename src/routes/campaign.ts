import { Router } from "express";
import { campaignService } from "../services/CampaignService.js";
import { requireAuth } from "../middleware/auth.js";
import type { CampaignRequest } from "../types/index.js";

const router = Router();

// Start a new campaign for the current user
router.post("/send-campaign", requireAuth, (req, res) => {
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
