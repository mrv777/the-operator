// TODO: SSE endpoint — polls agent_log table with cursor
export async function GET() {
  return Response.json({ events: [] });
}
