import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { whatsappSessions } from "../services/WhatsAppSessionManager.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// All admin routes require auth + admin role
router.use("/admin", requireAuth, requireAdmin);

// GET /api/admin/sessions — active WhatsApp sessions + memory stats
router.get("/admin/sessions", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ...whatsappSessions.getStats(),
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
    },
  });
});

// GET /api/admin/campaigns — list all campaigns (newest first)
router.get("/admin/campaigns", async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }

  const userEmail = req.query.user_email as string | undefined;

  let query = supabase
    .from("campaigns")
    .select("id, user_email, message_template, status, total_contacts, sent_count, failed_count, skipped_count, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(500);

  if (userEmail) {
    query = query.eq("user_email", userEmail);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ campaigns: data });
});

// GET /api/admin/campaign/:id — single campaign with all contacts
router.get("/admin/campaign/:id", async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }

  const { id } = req.params;
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json({ campaign: data });
});

export default router;
