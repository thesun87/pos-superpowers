import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  CreateMenuCategoryRequest,
  UpdateMenuCategoryRequest
} from "@pos/contracts";

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByTenant(tenantId: string) {
    return this.prisma.menuCategory.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  createForTenant(tenantId: string, input: CreateMenuCategoryRequest) {
    return this.prisma.menuCategory.create({
      data: { tenantId, name: input.name, sortOrder: input.sortOrder }
    });
  }

  findByIdForTenant(id: string, tenantId: string) {
    return this.prisma.menuCategory.findFirst({ where: { id, tenantId } });
  }

  async updateByIdForTenant(id: string, tenantId: string, input: UpdateMenuCategoryRequest) {
    const result = await this.prisma.menuCategory.updateMany({
      where: { id, tenantId },
      data: input
    });
    return result;
  }

  softDeleteByIdForTenant(id: string, tenantId: string) {
    return this.prisma.menuCategory.updateMany({
      where: { id, tenantId },
      data: { isActive: false }
    });
  }
}
