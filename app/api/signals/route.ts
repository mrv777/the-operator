import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import { getRecentSignals } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const status = req.nextUrl.searchParams.get("status");

    let signals;
    if (status) {
      signals = db
        .prepare("SELECT * FROM signals WHERE status = ? ORDER BY detected_at DESC LIMIT ?")
        .all(status, limit);
    } else {
      signals = getRecentSignals(db, limit);
    }

    return Response.json({ signals });
  } finally {
    db.close();
  }
}
