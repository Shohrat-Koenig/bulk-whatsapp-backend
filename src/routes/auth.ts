import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * POST /api/auth/signup
 * 1. Uses native Supabase signUp (creates proper GoTrue records)
 * 2. Immediately auto-confirms email via RPC (no verification email needed)
 */
router.post("/auth/signup", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (!email.toLowerCase().endsWith("@koenig-solutions.com")) {
    res.status(403).json({ error: "Only @koenig-solutions.com emails can sign up" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    // Step 1: Native Supabase signUp (creates proper GoTrue-compatible records)
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      if (error.message?.includes("already")) {
        res.status(409).json({ error: "An account with this email already exists. Please sign in." });
        return;
      }
      console.error("[Auth] SignUp error:", error.message);
      res.status(400).json({ error: error.message });
      return;
    }

    // Step 2: Auto-confirm via RPC (bypasses email verification)
    if (data?.user) {
      const { error: confirmError } = await supabase.rpc("confirm_koenig_email", {
        p_email: email.toLowerCase().trim(),
      });
      if (confirmError) {
        console.warn("[Auth] Auto-confirm failed:", confirmError.message);
        // User was created but not confirmed — they'll need manual confirmation
      } else {
        console.log(`[Auth] Created & confirmed: ${email}`);
      }
    }

    res.json({ success: true, message: "Account created. You can now sign in." });
  } catch (err) {
    console.error("[Auth] Signup exception:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Sign-up failed",
    });
  }
});

export default router;
