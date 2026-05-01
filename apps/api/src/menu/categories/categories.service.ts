import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantService } from "../../tenant/tenant.service";
import { CategoriesRepository } from "./categories.repository";
import type {
  CreateMenuCategoryRequest,
  UpdateMenuCategoryRequest
} from "@pos/contracts";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly repo: CategoriesRepository,
    private readonly tenant: TenantService
  ) {}

  async findAll() {
    const tenantId = this.tenant.getTenantId();
    return this.repo.findAllByTenant(tenantId);
  }

  async create(input: CreateMenuCategoryRequest) {
    const tenantId = this.tenant.getTenantId();
    return this.repo.createForTenant(tenantId, input);
  }

  async update(id: string, input: UpdateMenuCategoryRequest) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByIdForTenant(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Category not found");
    }
    await this.repo.updateByIdForTenant(id, tenantId, input);
    return this.repo.findByIdForTenant(id, tenantId);
  }

  async softDelete(id: string) {
    const tenantId = this.tenant.getTenantId();
    const result = await this.repo.softDeleteByIdForTenant(id, tenantId);
    if (result.count === 0) {
      throw new NotFoundException("Category not found");
    }
  }
}