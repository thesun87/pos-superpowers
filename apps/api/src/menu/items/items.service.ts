import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { TenantService } from "../../tenant/tenant.service";
import { ItemsRepository } from "./items.repository";
import type {
  CreateMenuItemRequest,
  UpdateMenuItemRequest
} from "@pos/contracts";

@Injectable()
export class ItemsService {
  constructor(
    private readonly repo: ItemsRepository,
    private readonly tenant: TenantService
  ) {}

  async findAll(filter: { categoryId?: string }) {
    const tenantId = this.tenant.getTenantId();
    return this.repo.findAllByTenant(tenantId, filter);
  }

  async create(input: CreateMenuItemRequest) {
    const tenantId = this.tenant.getTenantId();
    await this.assertCategoryBelongsToTenant(input.categoryId, tenantId);
    await this.assertModifierGroupsBelongToTenant(input.modifierGroupIds, tenantId);

    return this.repo.createForTenant(tenantId, input);
  }

  async update(id: string, input: UpdateMenuItemRequest) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByIdForTenant(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Menu item not found");
    }

    if (input.categoryId) {
      await this.assertCategoryBelongsToTenant(input.categoryId, tenantId);
    }
    if (input.modifierGroupIds !== undefined) {
      await this.assertModifierGroupsBelongToTenant(input.modifierGroupIds, tenantId);
    }

    return this.repo.updateForTenant(id, tenantId, input);
  }

  async softDelete(id: string) {
    const tenantId = this.tenant.getTenantId();
    const result = await this.repo.softDeleteByIdForTenant(id, tenantId);
    if (result.count === 0) {
      throw new NotFoundException("Menu item not found");
    }
  }

  private async assertCategoryBelongsToTenant(categoryId: string, tenantId: string) {
    const category = await this.repo.findCategoryByIdForTenant(categoryId, tenantId);
    if (!category) {
      throw new BadRequestException("categoryId does not belong to this tenant");
    }
  }

  private async assertModifierGroupsBelongToTenant(ids: string[], tenantId: string) {
    if (ids.length === 0) return;
    const found = await this.repo.findModifierGroupsByIdsForTenant(ids, tenantId);
    if (found.length !== ids.length) {
      throw new BadRequestException(
        "One or more modifierGroupIds do not belong to this tenant"
      );
    }
  }
}
