import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { AdminService } from "./admin.service";
import type { CreateTenantRequest } from "./admin.dto";
import { CreateTenantRequestSchema } from "./admin.dto";

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post("tenants")
  async createTenant(
    @Body() body: CreateTenantRequest,
    @Headers("x-admin-key") adminKey: string | undefined
  ) {
    if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
      throw new UnauthorizedException("Admin key required");
    }
    const parsed = CreateTenantRequestSchema.parse(body);
    return this.admin.createTenantWithOwner(parsed);
  }
}
