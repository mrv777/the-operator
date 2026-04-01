import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/schema";
import { getAgentLogsSince, getRecentAgentLogs } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // SSE doesn't easily carry auth headers from EventSource, so we check a query param
  const token = req.nextUrl.searchParams.get("token");
  const envToken = process.env.DASHBOARD_TOKEN;
  if (envToken && token !== envToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cursor = Number(req.nextUrl.searchParams.get("cursor") ?? "0");

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastId = cursor;
      let intervalId: ReturnType<typeof setInterval>;

      function send(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      function poll() {
        try {
          const db = getDb();
          try {
            const events =
              lastId === 0
                ? getRecentAgentLogs(db, 50).reverse()
                : getAgentLogsSince(db, lastId, 50);

            if (events.length > 0) {
              lastId = events[events.length - 1].id;
              send(JSON.stringify({ events, cursor: lastId }));
            }
          } finally {
            db.close();
          }
        } catch {
          // DB might be busy, skip this tick
        }
      }

      // Initial batch
      poll();

      // Poll every 2.5 seconds
      intervalId = setInterval(poll, 2500);

      // Clean up on close
      req.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
