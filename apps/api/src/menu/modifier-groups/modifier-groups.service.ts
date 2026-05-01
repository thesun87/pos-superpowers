import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantService } from "../../tenant/tenant.service";
import { ModifierGroupsRepository } from "./modifier-groups.repository";
import type {
  CreateModifierGroupRequest,
  UpdateModifierGroupRequest
} from "@pos/contracts";

@Injectable()
export class ModifierGroupsService {
  constructor(
    private readonly repo: ModifierGroupsRepository,
    private readonly tenant: TenantService
  ) {}

  async findAll() {
    const tenantId = this.tenant.getTenantId();
    return this.repo.findAllByTenant(tenantId);
  }

  async create(input: CreateModifierGroupRequest) {
    const tenantId = this.tenant.getTenantId();
    return this.repo.createForTenant(tenantId, input);
  }

  async update(id: string, input: UpdateModifierGroupRequest) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByIdForTenant(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Modifier group not found");
    }
    return this.repo.updateForTenant(id, tenantId, input);
  }

  async remove(id: string) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.repo.findByIdForTenant(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Modifier group not found");
    }
    const attached = await this.repo.countItemAttachments(id, tenantId);
    if (attached > 0) {
      throw new ConflictException(
        "Modifier group is attached to one or more menu items; detach first"
      );
    }
    await this.repo.deleteByIdForTenant(id, tenantId);
  }
}