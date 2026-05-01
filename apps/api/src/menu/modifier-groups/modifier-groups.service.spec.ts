import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ModifierGroupsService } from "./modifier-groups.service";
import { TenantService } from "../../tenant/tenant.service";
import { ModifierGroupsRepository } from "./modifier-groups.repository";

describe("ModifierGroupsService", () => {
  let service: ModifierGroupsService;
  let repo: {
    findAllByTenant: jest.Mock;
    createForTenant: jest.Mock;
    findByIdForTenant: jest.Mock;
    updateForTenant: jest.Mock;
    countItemAttachments: jest.Mock;
    deleteByIdForTenant: jest.Mock;
  };
  let tenant: { getTenantId: jest.Mock };

  beforeEach(async () => {
    repo = {
      findAllByTenant: jest.fn(),
      createForTenant: jest.fn(),
      findByIdForTenant: jest.fn(),
      updateForTenant: jest.fn(),
      countItemAttachments: jest.fn(),
      deleteByIdForTenant: jest.fn()
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ModifierGroupsService,
        { provide: ModifierGroupsRepository, useValue: repo },
        { provide: TenantService, useValue: tenant }
      ]
    }).compile();
    service = moduleRef.get(ModifierGroupsService);
  });

  it("findAll returns groups including options ordered by sortOrder", async () => {
    repo.findAllByTenant.mockResolvedValue([{ id: "g1", options: [] }]);
    const result = await service.findAll();
    expect(repo.findAllByTenant).toHaveBeenCalledWith("tenant-a");
    expect(result).toEqual([{ id: "g1", options: [] }]);
  });

  it("create writes group + options in a transaction with tenantId on each", async () => {
    repo.createForTenant.mockResolvedValue({
      id: "g2",
      tenantId: "tenant-a",
      options: [{ id: "o1", name: "S" }]
    });
    const input = {
      name: "Size",
      selectionType: "SINGLE" as const,
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [
        { name: "S", priceDelta: 0, isDefault: true, sortOrder: 0 },
        { name: "L", priceDelta: 5000, isDefault: false, sortOrder: 1 }
      ]
    };
    const result = await service.create(input);
    expect(repo.createForTenant).toHaveBeenCalledWith("tenant-a", input);
    expect(result.id).toBe("g2");
  });

  it("update replaces options atomically when options provided", async () => {
    repo.findByIdForTenant.mockResolvedValue({ id: "g3" });
    repo.updateForTenant.mockResolvedValue({ id: "g3", options: [] });
    const input = {
      name: "Đường",
      options: [{ name: "Ngọt", priceDelta: 0, isDefault: false, sortOrder: 0 }]
    };
    await service.update("g3", input);
    expect(repo.findByIdForTenant).toHaveBeenCalledWith("g3", "tenant-a");
    expect(repo.updateForTenant).toHaveBeenCalledWith("g3", "tenant-a", input);
  });

  it("update throws NotFoundException for cross-tenant id", async () => {
    repo.findByIdForTenant.mockResolvedValue(null);
    await expect(service.update("g-other", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("delete throws ConflictException when group is attached to a menu item", async () => {
    repo.findByIdForTenant.mockResolvedValue({ id: "g4" });
    repo.countItemAttachments.mockResolvedValue(2);
    await expect(service.remove("g4")).rejects.toBeInstanceOf(ConflictException);
    expect(repo.deleteByIdForTenant).not.toHaveBeenCalled();
  });

  it("delete removes group when not attached", async () => {
    repo.findByIdForTenant.mockResolvedValue({ id: "g5" });
    repo.countItemAttachments.mockResolvedValue(0);
    await service.remove("g5");
    expect(repo.deleteByIdForTenant).toHaveBeenCalledWith("g5", "tenant-a");
  });
});