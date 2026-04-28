import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@pos/contracts";

@Controller()
export class HealthController {
  @Get("health")
  get(): HealthResponse {
    return {
      status: "ok",
      service: "@pos/api",
      version: "0.0.0",
      uptimeSeconds: Math.floor(process.uptime())
    };
  }

  @Get("debug-sentry")
  debugSentry(): never {
    throw new Error("Sentry debug error");
  }
}
