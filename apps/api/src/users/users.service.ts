import { BadRequestException, Injectable } from "@nestjs/common";
import { TenantService } from "../tenant/tenant.service";

type UserCreateInput = {
  email: string;
  passwordHash: string;
  fullName: string;
  role: "OWNER" | "CASHIER";
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: { user: { findMany: Function; findUnique: Function; findFirst: Function; create: Function; updateMany: Function } },
    private readonly tenantService: TenantService
  ) {}

  async findAll(): Promise<unknown[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.prisma.user.findMany({ where: { tenantId } });
  }

  async findById(id: string): Promise<unknown | null> {
    const tenantId = this.tenantService.getTenantId();
    return this.prisma.user.findFirst({ where: { id, tenantId } });
  }

  async create(input: UserCreateInput): Promise<unknown> {
    const tenantId = this.tenantService.getTenantId();
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: input.email } }
    });
    if (existing) {
      throw new BadRequestException("Email already exists");
    }
    return this.prisma.user.create({
      data: { ...input, tenantId }
    });
  }

  async deactivate(id: string): Promise<unknown> {
    const tenantId = this.tenantService.getTenantId();
    return this.prisma.user.updateMany({
      where: { id, tenantId },
      data: { isActive: false }
    });
  }
}
