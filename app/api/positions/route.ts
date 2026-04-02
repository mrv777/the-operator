import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import { getOpenPositions, getAllPositions, type PositionRow } from "@/lib/db/queries";
import { getJupiterPrices } from "@/lib/prices/jupiter";

export const dynamic = "force-dynamic";

interface PositionWithPrice extends PositionRow {
  current_price: number | null;
  current_value_usd: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const all = req.nextUrl.searchParams.get("all") === "true";
    const positions = all ? getAllPositions(db) : getOpenPositions(db);

    // Fetch live prices for open positions
    const openPositions = positions.filter(
      (p) => p.status === "OPEN" || p.status === "PARTIALLY_CLOSED",
    );
    const mints = openPositions.map((p) => p.token_address);
    let prices: Record<string, number> = {};
    if (mints.length > 0) {
      try {
        prices = await getJupiterPrices(mints);
      } catch { /* prices stay empty */ }
    }

    const enriched: PositionWithPrice[] = positions.map((p) => {
      const currentPrice = prices[p.token_address] ?? null;
      const currentValue = currentPrice != null && p.current_amount_token
        ? currentPrice * p.current_amount_token
        : null;
      const unrealizedPnl = currentValue != null
        ? currentValue - p.entry_amount_usd + p.realized_pnl
        : null;
      const unrealizedPnlPct = unrealizedPnl != null && p.entry_amount_usd > 0
        ? (unrealizedPnl / p.entry_amount_usd) * 100
        : null;

      return {
        ...p,
        current_price: currentPrice,
        current_value_usd: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
      };
    });

    return Response.json({ positions: enriched });
  } finally {
    db.close();
  }
}
