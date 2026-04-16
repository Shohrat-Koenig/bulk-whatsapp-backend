import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Admin client using service role key — can create users with auto-confirmation
const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

/**
 * POST /api/auth/signup
 * Creates a Koenig user with auto-confirmed email (no confirmation email needed).
 * This bypasses Supabase's email rate limits entirely.
 */
router.post("/auth/signup", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  // Enforce Koenig-only emails
  if (!email.toLowerCase().endsWith("@koenig-solutions.com")) {
    res.status(403).json({ error: "Only @koenig-solutions.com emails can sign up" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  if (!supabaseAdmin) {
    // Fallback: if service role key isn't set, tell user to try later
    res.status(503).json({
      error: "Sign-up service unavailable. Please contact admin.",
    });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm — no verification email
    });

    if (error) {
      // Handle duplicate user gracefully
      if (error.message?.includes("already been registered") || error.message?.includes("already exists")) {
        res.status(409).json({ error: "An account with this email already exists. Please sign in." });
        return;
      }
      console.error("[Auth] Signup error:", error.message);
      res.status(400).json({ error: error.message });
      return;
    }

    console.log(`[Auth] Created user: ${data.user.email} (${data.user.id})`);
    res.json({ success: true, message: "Account created. You can now sign in." });
  } catch (err) {
    console.error("[Auth] Signup exception:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Sign-up failed",
    });
  }
});

export default router;
