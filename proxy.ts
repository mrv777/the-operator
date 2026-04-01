// TODO: Bearer token auth proxy for API routes (Next.js 16 proxy convention)
import { NextRequest, NextResponse } from "next/server";

export default function proxy(request: NextRequest) {
  // Placeholder — will add bearer token auth for /api/* routes
  return NextResponse.next();
}
