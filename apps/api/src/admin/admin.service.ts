import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as argon2 from "argon2";
import type { CreateTenantRequest } from "./admin.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenantWithOwner(input: CreateTenantRequest): Promise<{ tenant: unknown; user: unknown }> {
    const passwordHash = await argon2.hash(input.ownerPassword);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName, slug: input.slug }
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.ownerEmail,
          passwordHash,
          fullName: input.ownerFullName,
          role: "OWNER"
        }
      });
      return { tenant, user };
    });
  }
}
