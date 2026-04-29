import { PrismaService } from "./prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { UsersService } from "../users/users.service";

jest.setTimeout(120_000);

describe("Tenant isolation (integration)", () => {
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Create two tenants
    const t1 = await prisma.tenant.create({ data: { name: "Tenant A", slug: "tenant-a-" + Date.now() } });
    const t2 = await prisma.tenant.create({ data: { name: "Tenant B", slug: "tenant-b-" + Date.now() } });
    tenantA = t1.id;
    tenantB = t2.id;

    // Create users for each tenant
    const hash = "$argon2id$v=19$m=65536,t=3,p=4$placeholder";
    await prisma.user.create({
      data: { tenantId: tenantA, email: "a@tenant-a.com", passwordHash: hash, fullName: "User A", role: "OWNER" }
    });
    await prisma.user.create({
      data: { tenantId: tenantB, email: "b@tenant-b.com", passwordHash: hash, fullName: "User B", role: "OWNER" }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only tenant A's users when in tenant A context", async () => {
    const tenantService = new TenantService();
    const usersService = new UsersService(prisma as any, tenantService);
    await tenantService.set(tenantA);

    const users = await usersService.findAll();

    expect(users).toHaveLength(1);
    expect((users[0] as { email: string }).email).toBe("a@tenant-a.com");
  });

  it("returns only tenant B's users when in tenant B context", async () => {
    const tenantService = new TenantService();
    const usersService = new UsersService(prisma as any, tenantService);
    await tenantService.set(tenantB);

    const users = await usersService.findAll();

    expect(users).toHaveLength(1);
    expect((users[0] as { email: string }).email).toBe("b@tenant-b.com");
  });

  it("throws when accessing tenant context without being set", async () => {
    const tenantService = new TenantService();
    const usersService = new UsersService(prisma as any, tenantService);
    // tenantService has no context set, so findAll should throw
    await expect(usersService.findAll()).rejects.toThrow("No tenant context");
  });
});
