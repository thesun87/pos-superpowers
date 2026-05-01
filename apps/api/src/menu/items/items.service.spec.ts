import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ItemsService } from "./items.service";
import { TenantService } from "../../tenant/tenant.service";
import { ItemsRepository } from "./items.repository";

describe("ItemsService", () => {
  let service: ItemsService;
  let repo: {
    findAllByTenant: jest.Mock;
    findCategoryByIdForTenant: jest.Mock;
    findModifierGroupsByIdsForTenant: jest.Mock;
    createForTenant: jest.Mock;
    findByIdForTenant: jest.Mock;
    updateForTenant: jest.Mock;
    softDeleteByIdForTenant: jest.Mock;
  };
  let tenant: { getTenantId: jest.Mock };

  const sampleItemRow = (overrides: Record<string, unknown> = {}) => ({
    id: "i1",
    tenantId: "tenant-a",
    categoryId: "c1",
    name: "Trà đào",
    basePrice: 45000,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    modifierGroups: [{ modifierGroupId: "g1", sortOrder: 0 }],
    ...overrides
  });

  beforeEach(async () => {
    repo = {
      findAllByTenant: jest.fn(),
      findCategoryByIdForTenant: jest.fn(),
      findModifierGroupsByIdsForTenant: jest.fn(),
      createForTenant: jest.fn(),
      findByIdForTenant: jest.fn(),
      updateForTenant: jest.fn(),
      softDeleteByIdForTenant: jest.fn()
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: ItemsRepository, useValue: repo },
        { provide: TenantService, useValue: tenant }
      ]
    }).compile();
    service = moduleRef.get(ItemsService);
  });

  it("findAll filters by tenant and optional categoryId", async () => {
    repo.findAllByTenant.mockResolvedValue([sampleItemRow()]);
    await service.findAll({ categoryId: "c1" });
    expect(repo.findAllByTenant).toHaveBeenCalledWith("tenant-a", { categoryId: "c1" });
  });

  it("create rejects when category belongs to another tenant", async () => {
    repo.findCategoryByIdForTenant.mockResolvedValue(null);
    await expect(
      service.create({
        categoryId: "c-other",
        name: "x",
        basePrice: 1000,
        sortOrder: 0,
        modifierGroupIds: []
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createForTenant).not.toHaveBeenCalled();
  });

  it("create rejects when modifier group belongs to another tenant", async () => {
    repo.findCategoryByIdForTenant.mockResolvedValue({ id: "c1" });
    repo.findModifierGroupsByIdsForTenant.mockResolvedValue([{ id: "g1" }]);
    await expect(
      service.create({
        categoryId: "c1",
        name: "x",
        basePrice: 1000,
        sortOrder: 0,
        modifierGroupIds: ["g1", "g-other"]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("create writes item + modifier-group joins in a transaction", async () => {
    repo.findCategoryByIdForTenant.mockResolvedValue({ id: "c1" });
    repo.findModifierGroupsByIdsForTenant.mockResolvedValue([{ id: "g1" }, { id: "g2" }]);
    repo.createForTenant.mockResolvedValue(sampleItemRow({ id: "i2" }));
    const input = {
      categoryId: "c1",
      name: "Cafe sữa",
      basePrice: 30000,
      sortOrder: 0,
      modifierGroupIds: ["g1", "g2"]
    };
    await service.create(input);
    expect(repo.createForTenant).toHaveBeenCalledWith("tenant-a", input);
  });

  it("update replaces modifierGroup joins when modifierGroupIds is provided", async () => {
    repo.findByIdForTenant.mockResolvedValue(sampleItemRow());
    repo.findModifierGroupsByIdsForTenant.mockResolvedValue([{ id: "g3" }]);
    repo.updateForTenant.mockResolvedValue(sampleItemRow());
    await service.update("i1", { modifierGroupIds: ["g3"] });
    expect(repo.updateForTenant).toHaveBeenCalledWith("i1", "tenant-a", {
      modifierGroupIds: ["g3"]
    });
  });

  it("update throws NotFoundException for cross-tenant item", async () => {
    repo.findByIdForTenant.mockResolvedValue(null);
    await expect(service.update("i-other", { name: "x" })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("softDelete sets isActive=false scoped by tenant", async () => {
    repo.softDeleteByIdForTenant.mockResolvedValue({ count: 1 });
    await service.softDelete("i1");
    expect(repo.softDeleteByIdForTenant).toHaveBeenCalledWith("i1", "tenant-a");
  });

  it("softDelete throws NotFoundException when count is 0", async () => {
    repo.softDeleteByIdForTenant.mockResolvedValue({ count: 0 });
    await expect(service.softDelete("i-none")).rejects.toBeInstanceOf(NotFoundException);
  });
});