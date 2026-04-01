import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import {
  getPortfolioSnapshots,
  getLatestSnapshot,
  getPortfolioMetrics,
  getOpenPositions,
  getAgentState,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const snapshots = getPortfolioSnapshots(db, 500);
    const latest = getLatestSnapshot(db);
    const metrics = getPortfolioMetrics(db);
    const openPositions = getOpenPositions(db);
    const cashBalance = Number(getAgentState(db, "cash_balance_usd") ?? "0");

    let peak = 0;
    let maxDrawdown = 0;
    for (const s of [...snapshots].reverse()) {
      if (s.total_value_usd > peak) peak = s.total_value_usd;
      const dd = peak > 0 ? ((peak - s.total_value_usd) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return Response.json({
      snapshots: [...snapshots].reverse(),
      latest,
      metrics: {
        ...metrics,
        maxDrawdown,
        cashBalance,
        openPositionCount: openPositions.length,
      },
    });
  } finally {
    db.close();
  }
}
