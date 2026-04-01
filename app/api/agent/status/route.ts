// TODO: GET agent status (running/paused, uptime, last scan)
export async function GET() {
  return Response.json({ status: "stopped" });
}
