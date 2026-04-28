import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it("returns ok with service name and non-negative uptime", () => {
    const res = controller.get();
    expect(res.status).toBe("ok");
    expect(res.service).toBe("@pos/api");
    expect(res.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe("HealthController debug-sentry", () => {
  it("throws so Sentry can capture in deployed environments", async () => {
    const moduleRef = await (await import("@nestjs/testing")).Test.createTestingModule({
      controllers: [(await import("./health.controller")).HealthController]
    }).compile();
    const ctrl = moduleRef.get((await import("./health.controller")).HealthController);
    expect(() => ctrl.debugSentry()).toThrow("Sentry debug error");
  });
});
