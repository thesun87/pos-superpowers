import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateMenuItemRequest, UpdateMenuItemRequest } from "@pos/contracts";

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByTenant(tenantId: string, filter: { categoryId?: string }) {
    return this.prisma.menuItem.findMany({
      where: {
        tenantId,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {})
      },
      include: { modifierGroups: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
  }

  findCategoryByIdForTenant(categoryId: string, tenantId: string) {
    return this.prisma.menuCategory.findFirst({ where: { id: categoryId, tenantId } });
  }

  findModifierGroupsByIdsForTenant(ids: string[], tenantId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true }
    });
  }

  createForTenant(tenantId: string, input: CreateMenuItemRequest) {
    return this.prisma.menuItem.create({
      data: {
        tenantId,
        categoryId: input.categoryId,
        name: input.name,
        basePrice: input.basePrice,
        imageUrl: input.imageUrl ?? null,
        sortOrder: input.sortOrder,
        modifierGroups: {
          create: input.modifierGroupIds.map((modifierGroupId, idx) => ({
            tenantId,
            modifierGroupId,
            sortOrder: idx
          }))
        }
      },
      include: { modifierGroups: { orderBy: { sortOrder: "asc" } } }
    });
  }

  findByIdForTenant(id: string, tenantId: string) {
    return this.prisma.menuItem.findFirst({ where: { id, tenantId } });
  }

  updateForTenant(id: string, tenantId: string, input: UpdateMenuItemRequest) {
    const { modifierGroupIds, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      if (modifierGroupIds !== undefined) {
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: id, tenantId } });
        await tx.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((modifierGroupId, idx) => ({
            menuItemId: id,
            modifierGroupId,
            tenantId,
            sortOrder: idx
          }))
        });
      }
      const updated = await tx.menuItem.updateMany({
        where: { id, tenantId },
        data: rest
      });
      if (updated.count === 0) return null;
      return tx.menuItem.findFirst({
        where: { id, tenantId },
        include: { modifierGroups: { orderBy: { sortOrder: "asc" } } }
      });
    });
  }

  softDeleteByIdForTenant(id: string, tenantId: string) {
    return this.prisma.menuItem.updateMany({ where: { id, tenantId }, data: { isActive: false } });
  }
}
