import { Test } from "@nestjs/testing";
import { TenantService } from "./tenant.service";

describe("Tenant isolation", () => {
  let tenantService: TenantService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TenantService]
    }).compile();
    tenantService = moduleRef.get(TenantService);
  });

  it("sets tenant ID and clears on context", async () => {
    const tenantId = "tenant-a";
    await tenantService.set(tenantId);
    expect(tenantService.get()).toBe(tenantId);
    await tenantService.clear();
    expect(tenantService.get()).toBeNull();
  });

  it("throws when accessed without tenant", () => {
    expect(() => tenantService.get()).toThrow("No tenant context");
  });
});
