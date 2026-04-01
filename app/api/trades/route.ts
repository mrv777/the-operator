import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import { getRecentTrades } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const trades = getRecentTrades(db, limit);
    return Response.json({ trades });
  } finally {
    db.close();
  }
}
