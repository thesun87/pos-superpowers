import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  CreateModifierGroupRequest,
  UpdateModifierGroupRequest
} from "@pos/contracts";

@Injectable()
export class ModifierGroupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByTenant(tenantId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { tenantId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" }
    });
  }

  createForTenant(tenantId: string, input: CreateModifierGroupRequest) {
    return this.prisma.$transaction((tx) =>
      tx.modifierGroup.create({
        data: {
          tenantId,
          name: input.name,
          selectionType: input.selectionType,
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          isRequired: input.isRequired,
          options: {
            create: input.options.map((o) => ({
              tenantId,
              name: o.name,
              priceDelta: o.priceDelta,
              isDefault: o.isDefault,
              sortOrder: o.sortOrder
            }))
          }
        },
        include: { options: { orderBy: { sortOrder: "asc" } } }
      })
    );
  }

  findByIdForTenant(id: string, tenantId: string) {
    return this.prisma.modifierGroup.findFirst({ where: { id, tenantId } });
  }

  async updateForTenant(id: string, tenantId: string, input: UpdateModifierGroupRequest) {
    const { options, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      if (options !== undefined) {
        await tx.modifierOption.deleteMany({ where: { modifierGroupId: id, tenantId } });
        await tx.modifierOption.createMany({
          data: options.map((o) => ({
            modifierGroupId: id,
            tenantId,
            name: o.name,
            priceDelta: o.priceDelta,
            isDefault: o.isDefault,
            sortOrder: o.sortOrder
          }))
        });
      }
      const updated = await tx.modifierGroup.updateMany({
        where: { id, tenantId },
        data: rest
      });
      if (updated.count === 0) return null;
      return tx.modifierGroup.findFirst({
        where: { id, tenantId },
        include: { options: { orderBy: { sortOrder: "asc" } } }
      });
    });
  }

  countItemAttachments(id: string, tenantId: string) {
    return this.prisma.menuItemModifierGroup.count({ where: { modifierGroupId: id, tenantId } });
  }

  deleteByIdForTenant(id: string, tenantId: string) {
    return this.prisma.modifierGroup.deleteMany({ where: { id, tenantId } });
  }
}
