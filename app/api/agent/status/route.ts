import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import {
  getAgentState,
  getOpenPositions,
  getLatestSnapshot,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const agentStartedAt = getAgentState(db, "agent_started_at");
    const lastScanAt = getAgentState(db, "last_scan_at");
    const totalScans = Number(getAgentState(db, "total_scans") ?? "0");
    const paused = getAgentState(db, "paused") === "true";
    const cashBalance = Number(getAgentState(db, "cash_balance_usd") ?? "0");
    const openPositions = getOpenPositions(db);
    const latestSnapshot = getLatestSnapshot(db);

    // Count signals today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const signalsToday = db
      .prepare("SELECT COUNT(*) as count FROM signals WHERE detected_at >= ?")
      .get(todayStart.toISOString()) as { count: number };

    // Determine running status based on last scan time
    const isRunning =
      !paused &&
      !!lastScanAt &&
      Date.now() - new Date(lastScanAt).getTime() < 20 * 60 * 1000; // consider alive if scanned in last 20 min

    const nansenCredits = getAgentState(db, "nansen_credits");
    const nansenPlan = getAgentState(db, "nansen_plan");

    return Response.json({
      status: paused ? "PAUSED" : isRunning ? "RUNNING" : "STOPPED",
      agentStartedAt,
      lastScanAt,
      totalScans,
      cashBalance,
      openPositionCount: openPositions.length,
      signalsToday: signalsToday.count,
      portfolioValue: latestSnapshot?.total_value_usd ?? cashBalance,
      totalPnl: latestSnapshot?.total_realized_pnl ?? 0,
      nansenCredits: nansenCredits != null ? Number(nansenCredits) : null,
      nansenPlan: nansenPlan ?? null,
    });
  } finally {
    db.close();
  }
}
