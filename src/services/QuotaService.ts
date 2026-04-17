import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Hard-coded safety limits — protect against WhatsApp account restrictions
export const DAILY_LIMIT = 50;
export const MONTHLY_LIMIT = 200;

export interface UsageInfo {
  daily: number;
  monthly: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  dailyLimit: number;
  monthlyLimit: number;
}

/**
 * Sum sent messages for a user within a time window.
 * Uses the campaigns table (sent_count aggregated per campaign).
 */
async function sumSentSince(userEmail: string, sinceIso: string): Promise<number> {
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("campaigns")
    .select("sent_count")
    .eq("user_email", userEmail)
    .gte("started_at", sinceIso);

  if (error || !data) {
    console.error("[Quota] query failed:", error?.message);
    return 0;
  }

  return data.reduce((sum, row) => sum + (row.sent_count || 0), 0);
}

/**
 * Get current usage for a user.
 */
export async function getUsage(userEmail: string): Promise<UsageInfo> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [daily, monthly] = await Promise.all([
    sumSentSince(userEmail, dayAgo),
    sumSentSince(userEmail, monthAgo),
  ]);

  return {
    daily,
    monthly,
    dailyLimit: DAILY_LIMIT,
    monthlyLimit: MONTHLY_LIMIT,
    dailyRemaining: Math.max(0, DAILY_LIMIT - daily),
    monthlyRemaining: Math.max(0, MONTHLY_LIMIT - monthly),
  };
}

/**
 * Check if sending `requestedCount` more messages would exceed limits.
 * Returns the allowed count (may be less than requested).
 */
export async function checkAllowed(userEmail: string, requestedCount: number): Promise<{
  allowed: boolean;
  allowedCount: number;
  reason?: string;
  usage: UsageInfo;
}> {
  const usage = await getUsage(userEmail);

  const maxAllowed = Math.min(usage.dailyRemaining, usage.monthlyRemaining);

  if (maxAllowed <= 0) {
    const reason = usage.dailyRemaining <= 0
      ? `Daily limit reached (${DAILY_LIMIT}/day). Try again tomorrow.`
      : `Monthly limit reached (${MONTHLY_LIMIT}/30 days). Try again later.`;
    return { allowed: false, allowedCount: 0, reason, usage };
  }

  if (requestedCount > maxAllowed) {
    const reason = usage.dailyRemaining < usage.monthlyRemaining
      ? `Daily limit: only ${usage.dailyRemaining} messages remaining today (${DAILY_LIMIT}/day cap).`
      : `Monthly limit: only ${usage.monthlyRemaining} messages remaining this month (${MONTHLY_LIMIT}/30 days cap).`;
    return { allowed: false, allowedCount: maxAllowed, reason, usage };
  }

  return { allowed: true, allowedCount: requestedCount, usage };
}
