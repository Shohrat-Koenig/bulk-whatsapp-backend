import { Router } from "express";
import { whatsappSessions } from "../services/WhatsAppSessionManager.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Get current session status + QR (polling endpoint, also creates session lazily)
router.get("/qr-poll", requireAuth, (req, res) => {
  const userId = req.userId!;
  const session = whatsappSessions.getOrCreateSession(userId);
  res.json({
    status: session.status,
    phoneNumber: session.phoneNumber,
    profileName: session.profileName,
    qrDataUrl: session.qrDataUrl,
  });
});

// Get current session status (no QR — for header display)
router.get("/session/status", requireAuth, (req, res) => {
  const userId = req.userId!;
  const session = whatsappSessions.getSession(userId);
  if (!session) {
    res.json({ status: "disconnected", phoneNumber: null, profileName: null });
    return;
  }
  res.json({
    status: session.status,
    phoneNumber: session.phoneNumber,
    profileName: session.profileName,
  });
});

// Logout / disconnect WhatsApp session for this user
router.post("/session/logout", requireAuth, async (req, res) => {
  const userId = req.userId!;
  try {
    await whatsappSessions.logout(userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Logout failed",
    });
  }
});

export default router;
