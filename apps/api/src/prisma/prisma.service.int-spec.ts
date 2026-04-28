import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaService } from "./prisma.service";

jest.setTimeout(120_000);

describe("PrismaService (integration)", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService;
  let connectionUri: string;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) {
      connectionUri = process.env.DATABASE_URL;
    } else {
      container = await new PostgreSqlContainer("postgres:16-alpine")
        .withDatabase("pos")
        .withUsername("pos")
        .withPassword("pos")
        .start();
      connectionUri = container.getConnectionUri();
      process.env.DATABASE_URL = connectionUri;
    }
    execSync("pnpm prisma migrate deploy", {
      cwd: __dirname + "/../..",
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: "inherit"
    });
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (container) await container.stop();
  });

  it("can create and read a Tenant row", async () => {
    const slug = `cafe-${Date.now()}`;
    const created = await prisma.tenant.create({ data: { name: "Cafe Pilot", slug } });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(created.currency).toBe("VND");

    const found = await prisma.tenant.findUnique({ where: { slug } });
    expect(found?.name).toBe("Cafe Pilot");
  });
});
