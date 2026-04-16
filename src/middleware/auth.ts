import type { Request, Response, NextFunction } from "express";

// Augment Express Request type to carry userId/userEmail
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Simple email-based auth for internal Koenig tool.
 * Validates X-User-Email header is a @koenig-solutions.com address.
 * Uses the email as the user identifier.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const email = (req.headers["x-user-email"] as string || "").toLowerCase().trim();

  if (!email) {
    res.status(401).json({ error: "Missing authentication — please log in" });
    return;
  }

  if (!email.endsWith("@koenig-solutions.com")) {
    res.status(403).json({ error: "Only @koenig-solutions.com emails are allowed" });
    return;
  }

  req.userId = email;
  req.userEmail = email;
  next();
}
