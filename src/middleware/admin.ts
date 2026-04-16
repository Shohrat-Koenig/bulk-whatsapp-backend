import type { Request, Response, NextFunction } from "express";

const ADMIN_EMAIL = "shohrat.dhupar@koenig-solutions.com";

/**
 * Admin-only middleware. Must run AFTER requireAuth.
 * Only allows the hardcoded admin email through.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userEmail !== ADMIN_EMAIL) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
