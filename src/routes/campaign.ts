import { Router } from "express";
import { campaignService } from "../services/CampaignService.js";
import type { CampaignRequest } from "../types/index.js";

const router = Router();

// Start a new campaign
router.post("/send-campaign", (req, res) => {
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

  const campaignId = campaignService.startCampaign({ contacts, messageTemplate });
  res.json({ campaignId });
});

// SSE stream for campaign progress
router.get("/campaign/:id/progress", (req, res) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  campaignService.subscribeToCampaign(id, res);
});

// Pause campaign
router.post("/campaign/:id/pause", (req, res) => {
  const success = campaignService.pauseCampaign(req.params.id);
  res.json({ success });
});

// Resume campaign
router.post("/campaign/:id/resume", (req, res) => {
  const success = campaignService.resumeCampaign(req.params.id);
  res.json({ success });
});

// Stop campaign
router.post("/campaign/:id/stop", (req, res) => {
  const success = campaignService.stopCampaign(req.params.id);
  res.json({ success });
});

// Get campaign state
router.get("/campaign/:id", (req, res) => {
  const state = campaignService.getProgress(req.params.id);
  if (!state) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(state);
});

export default router;
