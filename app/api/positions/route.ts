import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import { getOpenPositions, getAllPositions } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const all = req.nextUrl.searchParams.get("all") === "true";
    const positions = all ? getAllPositions(db) : getOpenPositions(db);
    return Response.json({ positions });
  } finally {
    db.close();
  }
}
