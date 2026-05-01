import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { TenantService } from "../../tenant/tenant.service";
import { CategoriesRepository } from "./categories.repository";

describe("CategoriesService", () => {
  let service: CategoriesService;
  let repo: {
    findAllByTenant: jest.Mock;
    createForTenant: jest.Mock;
    findByIdForTenant: jest.Mock;
    updateByIdForTenant: jest.Mock;
    softDeleteByIdForTenant: jest.Mock;
  };
  let tenant: { getTenantId: jest.Mock };

  beforeEach(async () => {
    repo = {
      findAllByTenant: jest.fn(),
      createForTenant: jest.fn(),
      findByIdForTenant: jest.fn(),
      updateByIdForTenant: jest.fn(),
      softDeleteByIdForTenant: jest.fn()
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoriesRepository, useValue: repo },
        { provide: TenantService, useValue: tenant }
      ]
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  it("findAll filters by tenant and returns active-first ordered by sortOrder", async () => {
    repo.findAllByTenant.mockResolvedValue([{ id: "c1" }]);
    const result = await service.findAll();
    expect(repo.findAllByTenant).toHaveBeenCalledWith("tenant-a");
    expect(result).toEqual([{ id: "c1" }]);
  });

  it("create injects tenantId from context", async () => {
    repo.createForTenant.mockResolvedValue({ id: "c2", name: "Trà sữa" });
    const result = await service.create({ name: "Trà sữa", sortOrder: 0 });
    expect(repo.createForTenant).toHaveBeenCalledWith("tenant-a", {
      name: "Trà sữa",
      sortOrder: 0
    });
    expect(result.name).toBe("Trà sữa");
  });

  it("update guards by tenantId in where", async () => {
    repo.findByIdForTenant.mockResolvedValue({ id: "c3" });
    repo.updateByIdForTenant.mockResolvedValue({ count: 1 });
    repo.findByIdForTenant
      .mockResolvedValueOnce({ id: "c3" })
      .mockResolvedValueOnce({ id: "c3", name: "Cafe" });
    await service.update("c3", { name: "Cafe" });
    expect(repo.findByIdForTenant).toHaveBeenCalledWith("c3", "tenant-a");
    expect(repo.updateByIdForTenant).toHaveBeenCalledWith("c3", "tenant-a", {
      name: "Cafe"
    });
  });

  it("update throws NotFoundException when category belongs to another tenant", async () => {
    repo.findByIdForTenant.mockResolvedValue(null);
    await expect(service.update("c-other", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.updateByIdForTenant).not.toHaveBeenCalled();
  });

  it("softDelete sets isActive=false scoped by tenantId", async () => {
    repo.softDeleteByIdForTenant.mockResolvedValue({ count: 1 });
    await service.softDelete("c4");
    expect(repo.softDeleteByIdForTenant).toHaveBeenCalledWith("c4", "tenant-a");
  });

  it("softDelete throws NotFoundException when count is 0", async () => {
    repo.softDeleteByIdForTenant.mockResolvedValue({ count: 0 });
    await expect(service.softDelete("c-none")).rejects.toBeInstanceOf(NotFoundException);
  });
});