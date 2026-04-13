import { Router } from "express";
import { whatsappService } from "../services/WhatsAppService.js";

const router = Router();

// SSE stream for QR codes and auth status
router.get("/qr", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  whatsappService.subscribeToAuth(res);
});

// Polling fallback for QR (works through Cloudflare Tunnel and proxies that buffer SSE)
router.get("/qr-poll", (_req, res) => {
  const status = whatsappService.getStatus();
  const qr = whatsappService.getQrDataUrl();
  res.json({
    status: status.status,
    phoneNumber: status.phoneNumber,
    profileName: status.profileName,
    qrDataUrl: qr,
  });
});

// Get current session status
router.get("/session/status", (_req, res) => {
  const status = whatsappService.getStatus();
  res.json(status);
});

// Logout / disconnect WhatsApp session
router.post("/session/logout", async (_req, res) => {
  try {
    await whatsappService.logout();
    // Re-initialize to allow new QR scan
    whatsappService.initialize().catch(console.error);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Logout failed",
    });
  }
});

export default router;
