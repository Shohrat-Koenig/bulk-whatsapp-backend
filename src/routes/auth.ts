import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * POST /api/auth/signup
 * Creates a Koenig user with auto-confirmed email via a Postgres function.
 * No service role key needed — the function runs with SECURITY DEFINER.
 * No confirmation email sent — bypasses Supabase email rate limits entirely.
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
    // Call the Postgres function that creates the user directly
    // This function runs with SECURITY DEFINER so it has full auth schema access
    const { data, error } = await supabase.rpc("create_koenig_user", {
      p_email: email.toLowerCase().trim(),
      p_password: password,
    });

    if (error) {
      console.error("[Auth] RPC signup error:", error.message);
      res.status(400).json({ error: error.message });
      return;
    }

    // The function returns { success: bool, error?: string, user_id?: string }
    if (data && typeof data === "object" && "success" in data) {
      if (data.success) {
        console.log(`[Auth] Created user: ${email} (${data.user_id})`);
        res.json({ success: true, message: "Account created. You can now sign in." });
      } else {
        const statusCode = data.error?.includes("already exists") ? 409 : 400;
        res.status(statusCode).json({ error: data.error || "Sign-up failed" });
      }
    } else {
      res.status(500).json({ error: "Unexpected response from signup function" });
    }
  } catch (err) {
    console.error("[Auth] Signup exception:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Sign-up failed",
    });
  }
});

export default router;
