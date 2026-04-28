import { NextResponse } from "next/server";
import type { HealthResponse } from "@pos/contracts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<HealthResponse>> {
  return NextResponse.json({
    status: "ok",
    service: "@pos/web",
    version: "0.0.0",
    uptimeSeconds: Math.floor(process.uptime())
  });
}
