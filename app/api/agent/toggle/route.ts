import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/schema";
import { getAgentState, setAgentState } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const db = getDb();
  try {
    const currentlyPaused = getAgentState(db, "paused") === "true";
    setAgentState(db, "paused", currentlyPaused ? "false" : "true");
    return Response.json({ paused: !currentlyPaused });
  } finally {
    db.close();
  }
}
