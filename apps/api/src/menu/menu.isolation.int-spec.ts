import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { CategoriesRepository } from "./categories/categories.repository";
import { CategoriesService } from "./categories/categories.service";
import { ModifierGroupsRepository } from "./modifier-groups/modifier-groups.repository";
import { ModifierGroupsService } from "./modifier-groups/modifier-groups.service";
import { ItemsRepository } from "./items/items.repository";
import { ItemsService } from "./items/items.service";

jest.setTimeout(120_000);

describe("Menu tenant isolation (integration)", () => {
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;
  let categoryAId: string;
  let categoryBId: string;
  let modifierAId: string;
  let modifierBId: string;
  let itemAId: string;
  let itemBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const now = Date.now();
    const t1 = await prisma.tenant.create({
      data: { name: "Menu Tenant A", slug: `menu-tenant-a-${now}` }
    });
    const t2 = await prisma.tenant.create({
      data: { name: "Menu Tenant B", slug: `menu-tenant-b-${now}` }
    });
    tenantA = t1.id;
    tenantB = t2.id;

    const categoryA = await prisma.menuCategory.create({
      data: { tenantId: tenantA, name: "A Category", sortOrder: 0 }
    });
    const categoryB = await prisma.menuCategory.create({
      data: { tenantId: tenantB, name: "B Category", sortOrder: 0 }
    });
    categoryAId = categoryA.id;
    categoryBId = categoryB.id;

    const modifierA = await prisma.modifierGroup.create({
      data: {
        tenantId: tenantA,
        name: "A Size",
        selectionType: "SINGLE",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        options: {
          create: [{ tenantId: tenantA, name: "A M", priceDelta: 0, isDefault: true, sortOrder: 0 }]
        }
      }
    });
    const modifierB = await prisma.modifierGroup.create({
      data: {
        tenantId: tenantB,
        name: "B Size",
        selectionType: "SINGLE",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        options: {
          create: [{ tenantId: tenantB, name: "B M", priceDelta: 0, isDefault: true, sortOrder: 0 }]
        }
      }
    });
    modifierAId = modifierA.id;
    modifierBId = modifierB.id;

    const itemA = await prisma.menuItem.create({
      data: {
        tenantId: tenantA,
        categoryId: categoryAId,
        name: "A Item",
        basePrice: 10000,
        sortOrder: 0,
        modifierGroups: {
          create: [{ tenantId: tenantA, modifierGroupId: modifierAId, sortOrder: 0 }]
        }
      }
    });
    const itemB = await prisma.menuItem.create({
      data: {
        tenantId: tenantB,
        categoryId: categoryBId,
        name: "B Item",
        basePrice: 12000,
        sortOrder: 0,
        modifierGroups: {
          create: [{ tenantId: tenantB, modifierGroupId: modifierBId, sortOrder: 0 }]
        }
      }
    });
    itemAId = itemA.id;
    itemBId = itemB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only tenant A menu categories in tenant A context", async () => {
    const tenantService = new TenantService();
    const repo = new CategoriesRepository(prisma);
    const service = new CategoriesService(repo, tenantService);

    await tenantService.set(tenantA);
    const categories = await service.findAll();

    expect(categories).toHaveLength(1);
    expect(categories[0]?.name).toBe("A Category");
  });

  it("returns only tenant B menu categories in tenant B context", async () => {
    const tenantService = new TenantService();
    const repo = new CategoriesRepository(prisma);
    const service = new CategoriesService(repo, tenantService);

    await tenantService.set(tenantB);
    const categories = await service.findAll();

    expect(categories).toHaveLength(1);
    expect(categories[0]?.name).toBe("B Category");
  });

  it("returns only tenant A modifier groups in tenant A context", async () => {
    const tenantService = new TenantService();
    const repo = new ModifierGroupsRepository(prisma);
    const service = new ModifierGroupsService(repo, tenantService);

    await tenantService.set(tenantA);
    const groups = await service.findAll();

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("A Size");
  });

  it("blocks tenant A from mutating tenant B modifier group", async () => {
    const tenantService = new TenantService();
    const repo = new ModifierGroupsRepository(prisma);
    const service = new ModifierGroupsService(repo, tenantService);

    await tenantService.set(tenantA);
    await expect(service.update(modifierBId, { name: "x" })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("returns only tenant A items in tenant A context", async () => {
    const tenantService = new TenantService();
    const repo = new ItemsRepository(prisma);
    const service = new ItemsService(repo, tenantService);

    await tenantService.set(tenantA);
    const items = await service.findAll({});

    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("A Item");
  });

  it("blocks tenant A from mutating tenant B item", async () => {
    const tenantService = new TenantService();
    const repo = new ItemsRepository(prisma);
    const service = new ItemsService(repo, tenantService);

    await tenantService.set(tenantA);
    await expect(service.update(itemBId, { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });
});
