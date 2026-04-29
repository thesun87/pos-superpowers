import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import type { CreateTenantRequest } from "./admin.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenantWithOwner(input: CreateTenantRequest): Promise<{ tenant: unknown; user: unknown }> {
    const passwordHash = await argon2.hash(input.ownerPassword);
    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`Slug "${input.slug}" đã được sử dụng. Vui lòng chọn slug khác.`);
      }
      throw error;
    }
  }
}
