import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[Auth] SUPABASE_URL or SUPABASE_ANON_KEY missing — auth will reject all requests");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Augment Express Request type to carry userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Allow token in query param too (for SSE/EventSource which can't set headers)
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: "Missing authentication token" });
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.userId = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : "Auth verification failed",
    });
  }
}
