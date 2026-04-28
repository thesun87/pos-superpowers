# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty pnpm monorepo with NestJS API + Next.js PWA scaffolds, an initial Prisma migration, Sentry wired on both sides, GitHub Actions CI, and a working deploy pipeline (Neon + Render + Vercel) — so every later plan can ship code into a known-good baseline.

**Architecture:** pnpm workspace at the repo root. Two apps (`apps/api`, `apps/web`) and three shared packages (`packages/contracts`, `packages/domain`, `packages/ui`). Prisma lives in `apps/api/prisma`. Health check endpoints on both apps prove the deploy pipeline. Tests are TDD-first using Vitest (FE/packages) and Jest (BE) with a Testcontainers Postgres for integration.

**Tech Stack:** Node 20 LTS, pnpm 9, TypeScript 5.4, NestJS 10, Next.js 15 (App Router), Prisma 5, Postgres 16, Vitest, Jest, Testcontainers, Sentry, GitHub Actions, Render, Vercel, Neon.

---

## File Structure

After this plan completes, the repo will look like:

```
pos-superpowers/
├── .github/workflows/ci.yml
├── .nvmrc
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── apps/
│   ├── api/
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── jest.config.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── sentry.ts
│   │   │   ├── health/
│   │   │   │   ├── health.module.ts
│   │   │   │   ├── health.controller.ts
│   │   │   │   └── health.controller.spec.ts
│   │   │   └── prisma/
│   │   │       ├── prisma.module.ts
│   │   │       ├── prisma.service.ts
│   │   │       └── prisma.service.int-spec.ts
│   │   └── test/
│   │       └── jest-e2e.json
│   └── web/
│       ├── next.config.mjs
│       ├── package.json
│       ├── tsconfig.json
│       ├── postcss.config.mjs
│       ├── tailwind.config.ts
│       ├── vitest.config.ts
│       ├── public/
│       │   └── robots.txt
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx
│           │   ├── globals.css
│           │   └── api/health/route.ts
│           ├── lib/
│           │   ├── env.ts
│           │   └── env.spec.ts
│           ├── instrumentation.ts
│           ├── sentry.client.config.ts
│           └── sentry.server.config.ts
└── packages/
    ├── contracts/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── health.ts
    ├── domain/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   └── src/
    │       ├── index.ts
    │       └── version.spec.ts
    └── ui/
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── index.ts
```

**Responsibility per file:**
- `apps/api` — NestJS REST API. Owns Prisma + DB.
- `apps/web` — Next.js PWA. Owns user-facing UI, calls `apps/api` over HTTPS.
- `packages/contracts` — Zod schemas + DTO types shared by FE & BE. No runtime deps on Nest/Next.
- `packages/domain` — Pure TypeScript domain logic (will host Money, OrderCalc later). Zero framework deps.
- `packages/ui` — shadcn/ui components shared by FE (placeholder in this plan; populated in Plan 4).

---

## Task 1: pnpm workspace skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Verify Node + pnpm versions**

Run:
```bash
node --version   # expect v20.x
pnpm --version   # expect 9.x; if missing, run `corepack enable && corepack prepare pnpm@9.12.0 --activate`
```

If Node is not 20, install via nvm-windows or nvm: `nvm install 20 && nvm use 20`.

- [ ] **Step 2: Create `.nvmrc`**

Write `.nvmrc`:
```
20
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

Write `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create root `package.json`**

Write `package.json`:
```json
{
  "name": "pos-superpowers",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "pnpm -r --filter='./apps/*' --filter='./packages/*' build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev:api": "pnpm --filter @pos/api start:dev",
    "dev:web": "pnpm --filter @pos/web dev"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "@types/node": "20.12.7"
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

Write `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "incremental": true
  }
}
```

- [ ] **Step 6: Create `.env.example`**

Write `.env.example`:
```
# Database (Neon connection string in cloud, local docker for dev)
DATABASE_URL=postgresql://pos:pos@localhost:5432/pos?schema=public

# Web -> API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Sentry
SENTRY_DSN_API=
SENTRY_DSN_WEB=

# Super-admin secret (used in Plan 2 for tenant onboarding endpoint)
ADMIN_KEY=change-me-locally
```

- [ ] **Step 7: Create minimal `README.md`**

Write `README.md`:
```markdown
# pos-superpowers

POS F&B SaaS MVP. See `docs/superpowers/specs/2026-04-27-pos-fnb-saas-mvp-design.md` for the design.

## Quickstart

```bash
nvm use
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env
pnpm dev:api   # http://localhost:3001/health
pnpm dev:web   # http://localhost:3000
```

## Workspace

- `apps/api` — NestJS REST API
- `apps/web` — Next.js PWA
- `packages/contracts` — shared Zod DTOs
- `packages/domain` — pure-TS domain logic
- `packages/ui` — shared UI components
```

- [ ] **Step 8: Install root dev deps**

Run:
```bash
pnpm install
```

Expected: `Done in Xs` with no errors. `node_modules/` and `pnpm-lock.yaml` appear at root.

- [ ] **Step 9: Commit**

```bash
git add .nvmrc pnpm-workspace.yaml package.json tsconfig.base.json .env.example README.md pnpm-lock.yaml
git commit -m "chore: pnpm monorepo skeleton"
```

---

## Task 2: Shared packages (domain, contracts, ui)

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/version.spec.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/health.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test for `packages/domain`**

Write `packages/domain/src/version.spec.ts`:
```ts
import { describe, expect, it } from "vitest";
import { domainVersion } from "./index";

describe("domain package", () => {
  it("exposes a semver-shaped version string", () => {
    expect(domainVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Create `packages/domain/package.json`**

Write `packages/domain/package.json`:
```json
{
  "name": "@pos/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "echo 'lint configured in plan 2'",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "vitest": "1.6.0"
  }
}
```

- [ ] **Step 3: Create `packages/domain/tsconfig.json`**

Write `packages/domain/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/domain/vitest.config.ts`**

Write `packages/domain/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 }
    }
  }
});
```

- [ ] **Step 5: Run test, confirm it fails**

Run:
```bash
pnpm --filter @pos/domain install
pnpm --filter @pos/domain test
```

Expected: FAIL with `Cannot find module './index'` or `domainVersion is not exported`.

- [ ] **Step 6: Implement minimal `packages/domain/src/index.ts`**

Write `packages/domain/src/index.ts`:
```ts
export const domainVersion = "0.0.0";
```

- [ ] **Step 7: Run test, confirm it passes**

Run:
```bash
pnpm --filter @pos/domain test
```

Expected: PASS, `1 passed`.

- [ ] **Step 8: Create `packages/contracts/package.json`**

Write `packages/contracts/package.json`:
```json
{
  "name": "@pos/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "echo 'no tests yet'",
    "lint": "echo 'lint configured in plan 2'",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.4.5"
  }
}
```

- [ ] **Step 9: Create `packages/contracts/tsconfig.json`**

Write `packages/contracts/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 10: Create `packages/contracts/src/health.ts`**

Write `packages/contracts/src/health.ts`:
```ts
import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
```

- [ ] **Step 11: Create `packages/contracts/src/index.ts`**

Write `packages/contracts/src/index.ts`:
```ts
export * from "./health";
```

- [ ] **Step 12: Create `packages/ui/package.json`**

Write `packages/ui/package.json`:
```json
{
  "name": "@pos/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "echo 'no tests yet'",
    "lint": "echo 'lint configured in plan 2'",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "5.4.5"
  }
}
```

- [ ] **Step 13: Create `packages/ui/tsconfig.json`**

Write `packages/ui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "preserve"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 14: Create `packages/ui/src/index.ts`**

Write `packages/ui/src/index.ts`:
```ts
export const uiPackageMarker = "@pos/ui placeholder — populated in plan 4";
```

- [ ] **Step 15: Install all packages**

Run:
```bash
pnpm install
```

Expected: workspace links resolve, no peer-dep warnings.

- [ ] **Step 16: Verify typecheck across packages**

Run:
```bash
pnpm -r --filter='./packages/*' typecheck
```

Expected: all three packages report `0 errors`.

- [ ] **Step 17: Commit**

```bash
git add packages/ pnpm-lock.yaml
git commit -m "chore: scaffold shared packages (domain, contracts, ui)"
```

---

## Task 3: NestJS API + health endpoint (TDD)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/jest.config.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

Write `apps/api/package.json`:
```json
{
  "name": "@pos/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "test": "jest",
    "test:int": "jest --config jest.config.ts --testPathPattern=int-spec",
    "lint": "echo 'lint configured in plan 2'",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@nestjs/common": "10.3.9",
    "@nestjs/core": "10.3.9",
    "@nestjs/platform-express": "10.3.9",
    "@pos/contracts": "workspace:*",
    "@pos/domain": "workspace:*",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "10.3.2",
    "@nestjs/schematics": "10.1.1",
    "@nestjs/testing": "10.3.9",
    "@types/express": "4.17.21",
    "@types/jest": "29.5.12",
    "@types/node": "20.12.7",
    "@types/supertest": "6.0.2",
    "jest": "29.7.0",
    "supertest": "7.0.0",
    "ts-jest": "29.1.2",
    "ts-loader": "9.5.1",
    "ts-node": "10.9.2",
    "tsconfig-paths": "4.2.0",
    "typescript": "5.4.5"
  }
}
```

- [ ] **Step 2: Create `apps/api/nest-cli.json`**

Write `apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.json`**

Write `apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "paths": {
      "@pos/contracts": ["../../packages/contracts/src"],
      "@pos/domain": ["../../packages/domain/src"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `apps/api/tsconfig.build.json`**

Write `apps/api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 5: Create `apps/api/jest.config.ts`**

Write `apps/api/jest.config.ts`:
```ts
import type { Config } from "jest";

const config: Config = {
  rootDir: ".",
  testEnvironment: "node",
  moduleFileExtensions: ["js", "json", "ts"],
  testRegex: ".*\\.(spec|int-spec)\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.json" }]
  },
  moduleNameMapper: {
    "^@pos/contracts$": "<rootDir>/../../packages/contracts/src",
    "^@pos/domain$": "<rootDir>/../../packages/domain/src"
  },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coverageDirectory: "./coverage"
};

export default config;
```

- [ ] **Step 6: Install api deps**

Run:
```bash
pnpm install
```

Expected: `@pos/api` resolved, `node_modules` populated under `apps/api`.

- [ ] **Step 7: Write the failing health controller test**

Write `apps/api/src/health/health.controller.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it("returns ok with service name and non-negative uptime", () => {
    const res = controller.get();
    expect(res.status).toBe("ok");
    expect(res.service).toBe("@pos/api");
    expect(res.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 8: Run test, confirm it fails**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=health.controller.spec
```

Expected: FAIL with `Cannot find module './health.controller'`.

- [ ] **Step 9: Implement `apps/api/src/health/health.controller.ts`**

Write `apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@pos/contracts";

@Controller("health")
export class HealthController {
  @Get()
  get(): HealthResponse {
    return {
      status: "ok",
      service: "@pos/api",
      version: "0.0.0",
      uptimeSeconds: Math.floor(process.uptime())
    };
  }
}
```

- [ ] **Step 10: Implement `apps/api/src/health/health.module.ts`**

Write `apps/api/src/health/health.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController]
})
export class HealthModule {}
```

- [ ] **Step 11: Implement `apps/api/src/app.module.ts`**

Write `apps/api/src/app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [HealthModule]
})
export class AppModule {}
```

- [ ] **Step 12: Implement `apps/api/src/main.ts`**

Write `apps/api/src/main.ts`:
```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start API", err);
  process.exit(1);
});
```

- [ ] **Step 13: Run test, confirm it passes**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=health.controller.spec
```

Expected: PASS, `Tests: 1 passed`.

- [ ] **Step 14: Smoke-test the running server**

Run in one terminal:
```bash
pnpm dev:api
```

In another terminal:
```bash
curl -s http://localhost:3001/health
```

Expected output (uptime varies):
```
{"status":"ok","service":"@pos/api","version":"0.0.0","uptimeSeconds":3}
```

Stop the dev server with Ctrl+C.

- [ ] **Step 15: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): nestjs scaffold with /health endpoint"
```

---

## Task 4: Prisma setup + initial Tenant migration

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.service.int-spec.ts`
- Modify: `apps/api/package.json` (add prisma deps)
- Modify: `apps/api/src/app.module.ts` (import PrismaModule)

> **Note:** The integration test uses Testcontainers to spin up a real Postgres in Docker. You need Docker Desktop running for this task. If Docker is unavailable, skip Steps 6–8 and run `prisma migrate dev` against a local Postgres instead — but you must come back and run the test before merging.

- [ ] **Step 1: Add Prisma + Testcontainers deps to `apps/api/package.json`**

Edit `apps/api/package.json` — add to `dependencies`:
```json
"@prisma/client": "5.15.0",
```

Add to `devDependencies`:
```json
"prisma": "5.15.0",
"@testcontainers/postgresql": "10.10.0",
"testcontainers": "10.10.0"
```

Then run:
```bash
pnpm install
```

- [ ] **Step 2: Create `apps/api/prisma/schema.prisma`**

Write `apps/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  timezone      String   @default("Asia/Ho_Chi_Minh")
  currency      String   @default("VND")
  address       String?
  phone         String?
  receiptFooter String?
  wifiQrPayload String?
  createdAt     DateTime @default(now())

  @@map("tenants")
}
```

> Only `Tenant` is in this plan. `User`, menu, orders, etc. are added by their respective plans.

- [ ] **Step 3: Create `apps/api/src/prisma/prisma.service.ts`**

Write `apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Create `apps/api/src/prisma/prisma.module.ts`**

Write `apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
```

- [ ] **Step 5: Wire PrismaModule into `apps/api/src/app.module.ts`**

Replace `apps/api/src/app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, HealthModule]
})
export class AppModule {}
```

- [ ] **Step 6: Write the failing integration test**

Write `apps/api/src/prisma/prisma.service.int-spec.ts`:
```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaService } from "./prisma.service";

jest.setTimeout(120_000);

describe("PrismaService (integration)", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("pos")
      .withUsername("pos")
      .withPassword("pos")
      .start();
    process.env.DATABASE_URL = container.getConnectionUri();
    execSync("pnpm prisma migrate deploy", {
      cwd: __dirname + "/../..",
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: "inherit"
    });
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("can create and read a Tenant row", async () => {
    const created = await prisma.tenant.create({
      data: { name: "Cafe Pilot", slug: "cafe-pilot" }
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(created.currency).toBe("VND");

    const found = await prisma.tenant.findUnique({ where: { slug: "cafe-pilot" } });
    expect(found?.name).toBe("Cafe Pilot");
  });
});
```

- [ ] **Step 7: Run the test — confirm it fails**

Run:
```bash
pnpm --filter @pos/api test:int
```

Expected: FAIL with either `Cannot find module '@prisma/client'` (no client generated yet) or migration error (no migrations folder yet).

- [ ] **Step 8: Generate Prisma client + first migration**

Make sure Postgres is reachable. The simplest local option is Docker — start a one-off container:
```bash
docker run --rm -d --name pos-pg-dev -e POSTGRES_USER=pos -e POSTGRES_PASSWORD=pos -e POSTGRES_DB=pos -p 5432:5432 postgres:16-alpine
```

Then run:
```bash
cd apps/api
DATABASE_URL=postgresql://pos:pos@localhost:5432/pos?schema=public pnpm prisma migrate dev --name init
DATABASE_URL=postgresql://pos:pos@localhost:5432/pos?schema=public pnpm prisma generate
cd ../..
```

Expected: `prisma/migrations/<timestamp>_init/migration.sql` is created and Prisma client is generated under `node_modules/.prisma/client`.

Then stop the local container:
```bash
docker stop pos-pg-dev
```

- [ ] **Step 9: Run the integration test — confirm it passes**

Run:
```bash
pnpm --filter @pos/api test:int
```

Expected: PASS, `Tests: 1 passed`. Test takes ~30–60s on first run while Testcontainers pulls the Postgres image.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/package.json apps/api/src/app.module.ts pnpm-lock.yaml
git commit -m "feat(api): prisma setup with initial Tenant migration"
```

---

## Task 5: Next.js web scaffold + health page

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/public/robots.txt`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/lib/env.ts`
- Create: `apps/web/src/lib/env.spec.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

Write `apps/web/package.json`:
```json
{
  "name": "@pos/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pos/contracts": "workspace:*",
    "@pos/domain": "workspace:*",
    "@pos/ui": "workspace:*",
    "next": "15.0.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.12.7",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "10.4.19",
    "eslint": "8.57.0",
    "eslint-config-next": "15.0.3",
    "postcss": "8.4.38",
    "tailwindcss": "3.4.4",
    "typescript": "5.4.5",
    "vitest": "1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

Write `apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@pos/contracts": ["../../packages/contracts/src"],
      "@pos/domain": ["../../packages/domain/src"],
      "@pos/ui": ["../../packages/ui/src"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.mjs`**

Write `apps/web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pos/contracts", "@pos/domain", "@pos/ui"],
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
```

- [ ] **Step 4: Create Tailwind + PostCSS config**

Write `apps/web/postcss.config.mjs`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

Write `apps/web/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: { extend: {} },
  plugins: []
};

export default config;
```

- [ ] **Step 5: Create `apps/web/vitest.config.ts`**

Write `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"]
  }
});
```

- [ ] **Step 6: Create `apps/web/public/robots.txt`**

Write `apps/web/public/robots.txt`:
```
User-agent: *
Disallow: /
```

- [ ] **Step 7: Write the failing env test**

Write `apps/web/src/lib/env.spec.ts`:
```ts
import { describe, expect, it } from "vitest";
import { loadPublicEnv } from "./env";

describe("loadPublicEnv", () => {
  it("parses a valid API URL", () => {
    const env = loadPublicEnv({ NEXT_PUBLIC_API_URL: "http://localhost:3001" });
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3001");
  });

  it("throws when API URL is missing", () => {
    expect(() => loadPublicEnv({})).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});
```

- [ ] **Step 8: Run test, confirm it fails**

Run:
```bash
pnpm install
pnpm --filter @pos/web test
```

Expected: FAIL with `Cannot find module './env'`.

- [ ] **Step 9: Implement `apps/web/src/lib/env.ts`**

Write `apps/web/src/lib/env.ts`:
```ts
import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url()
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export function loadPublicEnv(raw: Record<string, string | undefined> = process.env): PublicEnv {
  const parsed = PublicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.errors.map((e) => e.path.join(".")).join(", ");
    throw new Error(`Invalid public env: ${missing}`);
  }
  return parsed.data;
}
```

- [ ] **Step 10: Run test, confirm it passes**

Run:
```bash
pnpm --filter @pos/web test
```

Expected: PASS, `2 passed`.

- [ ] **Step 11: Create `apps/web/src/app/globals.css`**

Write `apps/web/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  height: 100%;
}

body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Step 12: Create `apps/web/src/app/layout.tsx`**

Write `apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POS Superpowers",
  description: "POS F&B SaaS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 13: Create `apps/web/src/app/page.tsx`**

Write `apps/web/src/app/page.tsx`:
```tsx
import { HealthResponseSchema } from "@pos/contracts";
import { loadPublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

async function fetchApiHealth(): Promise<{ ok: boolean; raw: string }> {
  const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
  try {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/health`, { cache: "no-store" });
    const json = await res.json();
    HealthResponseSchema.parse(json);
    return { ok: true, raw: JSON.stringify(json) };
  } catch (err) {
    return { ok: false, raw: String(err) };
  }
}

export default async function Home() {
  const apiHealth = await fetchApiHealth();
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold">POS Superpowers</h1>
      <p>Web app is up.</p>
      <p>
        API health:{" "}
        <span className={apiHealth.ok ? "text-green-600" : "text-red-600"}>
          {apiHealth.ok ? "ok" : "unreachable"}
        </span>
      </p>
      <pre className="rounded bg-gray-100 p-4 text-sm">{apiHealth.raw}</pre>
    </main>
  );
}
```

- [ ] **Step 14: Create `apps/web/src/app/api/health/route.ts`**

Write `apps/web/src/app/api/health/route.ts`:
```ts
import { NextResponse } from "next/server";
import type { HealthResponse } from "@pos/contracts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<HealthResponse>> {
  return NextResponse.json({
    status: "ok",
    service: "@pos/web",
    version: "0.0.0",
    uptimeSeconds: Math.floor(process.uptime())
  });
}
```

- [ ] **Step 15: Smoke test the dev server**

In one terminal:
```bash
pnpm dev:api
```

In another terminal:
```bash
pnpm dev:web
```

Open `http://localhost:3000` in a browser. Expected: page renders heading "POS Superpowers" and "API health: ok".

Then:
```bash
curl -s http://localhost:3000/api/health
```

Expected output: `{"status":"ok","service":"@pos/web","version":"0.0.0","uptimeSeconds":...}`.

Stop both dev servers.

- [ ] **Step 16: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): nextjs scaffold with health page calling api"
```

---

## Task 6: Sentry wiring (BE + FE)

**Files:**
- Modify: `apps/api/package.json` (add @sentry/node)
- Create: `apps/api/src/sentry.ts`
- Modify: `apps/api/src/main.ts` (initialize Sentry)
- Modify: `apps/api/src/health/health.controller.ts` (add /debug-sentry route)
- Modify: `apps/api/src/health/health.controller.spec.ts` (add test for debug route)
- Modify: `apps/web/package.json` (add @sentry/nextjs)
- Create: `apps/web/src/instrumentation.ts`
- Create: `apps/web/src/sentry.client.config.ts`
- Create: `apps/web/src/sentry.server.config.ts`
- Modify: `apps/web/next.config.mjs` (wrap with Sentry)
- Modify: `.env.example` (already has SENTRY_DSN_API/WEB)

> **Manual cloud step (do once now):** create a Sentry account at https://sentry.io. Create two projects (`pos-api` Node, `pos-web` Next.js). Copy each project's DSN into your local `.env` file as `SENTRY_DSN_API` and `SENTRY_DSN_WEB`. If you skip Sentry signup, the code below still compiles — Sentry init becomes a no-op when DSN is empty — but you must come back and fill DSNs before the deploy task.

- [ ] **Step 1: Add Sentry to `apps/api/package.json`**

Edit `apps/api/package.json` — add to `dependencies`:
```json
"@sentry/node": "8.13.0"
```

Then:
```bash
pnpm install
```

- [ ] **Step 2: Create `apps/api/src/sentry.ts`**

Write `apps/api/src/sentry.ts`:
```ts
import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN_API;
  if (!dsn) return; // intentional no-op when missing — local dev runs without Sentry
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1
  });
  initialized = true;
}

export { Sentry };
```

- [ ] **Step 3: Wire Sentry in `apps/api/src/main.ts`**

Replace `apps/api/src/main.ts`:
```ts
import "reflect-metadata";
import { initSentry, Sentry } from "./sentry";
initSentry();

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

bootstrap().catch((err) => {
  Sentry.captureException(err);
  // eslint-disable-next-line no-console
  console.error("Failed to start API", err);
  process.exit(1);
});
```

- [ ] **Step 4: Add a test for the new `/debug-sentry` endpoint**

Update `apps/api/src/health/health.controller.spec.ts` — append:
```ts
describe("HealthController debug-sentry", () => {
  it("throws so Sentry can capture in deployed environments", async () => {
    const moduleRef = await (await import("@nestjs/testing")).Test.createTestingModule({
      controllers: [(await import("./health.controller")).HealthController]
    }).compile();
    const ctrl = moduleRef.get((await import("./health.controller")).HealthController);
    expect(() => ctrl.debugSentry()).toThrow("Sentry debug error");
  });
});
```

- [ ] **Step 5: Run the test — confirm it fails**

Run:
```bash
pnpm --filter @pos/api test
```

Expected: FAIL with `ctrl.debugSentry is not a function`.

- [ ] **Step 6: Implement `debugSentry()` in `apps/api/src/health/health.controller.ts`**

Replace `apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@pos/contracts";

@Controller()
export class HealthController {
  @Get("health")
  get(): HealthResponse {
    return {
      status: "ok",
      service: "@pos/api",
      version: "0.0.0",
      uptimeSeconds: Math.floor(process.uptime())
    };
  }

  @Get("debug-sentry")
  debugSentry(): never {
    throw new Error("Sentry debug error");
  }
}
```

- [ ] **Step 7: Run the test — confirm it passes**

Run:
```bash
pnpm --filter @pos/api test
```

Expected: PASS, `2 passed` total.

- [ ] **Step 8: Add Sentry to `apps/web/package.json`**

Edit `apps/web/package.json` — add to `dependencies`:
```json
"@sentry/nextjs": "8.13.0"
```

Then:
```bash
pnpm install
```

- [ ] **Step 9: Create `apps/web/src/sentry.client.config.ts`**

Write `apps/web/src/sentry.client.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0
  });
}
```

- [ ] **Step 10: Create `apps/web/src/sentry.server.config.ts`**

Write `apps/web/src/sentry.server.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN_WEB;
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
}
```

- [ ] **Step 11: Create `apps/web/src/instrumentation.ts`**

Write `apps/web/src/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}
```

- [ ] **Step 12: Wrap `apps/web/next.config.mjs` with Sentry**

Replace `apps/web/next.config.mjs`:
```js
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pos/contracts", "@pos/domain", "@pos/ui"],
  experimental: {
    typedRoutes: true,
    instrumentationHook: true
  }
};

export default withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
  disableLogger: true
});
```

- [ ] **Step 13: Add `NEXT_PUBLIC_SENTRY_DSN` to `.env.example`**

Edit `.env.example` — add after `SENTRY_DSN_WEB=`:
```
NEXT_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 14: Smoke test Sentry locally**

Set DSNs in your local `.env` (copy from Sentry dashboard). Then in one terminal:
```bash
pnpm dev:api
```

Trigger an error:
```bash
curl -s http://localhost:3001/debug-sentry || true
```

Open Sentry dashboard for `pos-api` — within ~30s the error "Sentry debug error" should appear. If empty DSN, this is expected to do nothing — that's fine for now.

Stop the dev server.

- [ ] **Step 15: Commit**

```bash
git add apps/api apps/web .env.example pnpm-lock.yaml
git commit -m "feat: wire sentry on api and web with debug endpoints"
```

---

## Task 7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

Write `.github/workflows/ci.yml`:
```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit:
    name: typecheck + unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @pos/api prisma generate
      - run: pnpm typecheck
      - run: pnpm --filter @pos/domain test
      - run: pnpm --filter @pos/api test --testPathPattern=spec.ts
      - run: pnpm --filter @pos/web test

  integration:
    name: api integration tests (postgres)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: pos
          POSTGRES_PASSWORD: pos
          POSTGRES_DB: pos
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://pos:pos@localhost:5432/pos?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @pos/api prisma migrate deploy
      - run: pnpm --filter @pos/api prisma generate
      - run: pnpm --filter @pos/api test --testPathPattern=int-spec.ts

  build:
    name: production build
    runs-on: ubuntu-latest
    needs: [unit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @pos/api prisma generate
      - run: pnpm --filter @pos/api build
      - env:
          NEXT_PUBLIC_API_URL: http://localhost:3001
        run: pnpm --filter @pos/web build
```

> **Note:** the `integration` job uses the GitHub-services Postgres rather than Testcontainers because Testcontainers-on-CI requires Docker-in-Docker. The integration test in Task 4 reads `DATABASE_URL` if set, so we need to update it slightly to skip starting its own container when one is provided. Step 2 does this.

- [ ] **Step 2: Make the integration test reuse a provided Postgres**

Replace `apps/api/src/prisma/prisma.service.int-spec.ts` with the CI-aware version:
```ts
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
```

- [ ] **Step 3: Re-run integration test locally with Docker to verify still green**

Run:
```bash
pnpm --filter @pos/api test:int
```

Expected: PASS.

- [ ] **Step 4: Push branch and verify CI is green**

```bash
git checkout -b plan/foundation
git add .github apps/api/src/prisma/prisma.service.int-spec.ts
git commit -m "ci: add github actions workflow"
git push -u origin plan/foundation
```

Open the PR on GitHub. Expected: all three jobs (`unit`, `integration`, `build`) finish green within ~5 minutes. Fix any red job before continuing.

- [ ] **Step 5: Merge to main once green**

After review:
```bash
gh pr merge plan/foundation --squash --delete-branch
git checkout main
git pull
```

---

## Task 8: Deploy pipeline (Neon + Render + Vercel)

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `render.yaml` (repo root)
- Modify: `README.md` (add live URLs after deploy)

> This task involves manual cloud setup. Each cloud step is annotated. After each cloud step, you must come back and verify the next code-side step works.

- [ ] **Step 1: Provision Neon Postgres (manual cloud step)**

1. Sign up / log in at https://neon.tech.
2. Create project `pos-superpowers` in region closest to Vietnam (e.g., Singapore).
3. Copy the **Pooled** connection string from the dashboard. It looks like `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/pos?sslmode=require`.
4. Save it locally as `NEON_DATABASE_URL` in a scratch note (do **not** commit). You'll paste it into Render env in Step 4.

- [ ] **Step 2: Run the initial migration against Neon**

Run from your laptop, replacing `<NEON_URL>`:
```bash
DATABASE_URL=<NEON_URL> pnpm --filter @pos/api prisma migrate deploy
```

Expected: `1 migration applied`. Verify on Neon dashboard → Tables — you should see `tenants` and `_prisma_migrations`.

- [ ] **Step 3: Create `apps/api/Dockerfile`**

Write `apps/api/Dockerfile`:
```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @pos/api prisma generate
RUN pnpm --filter @pos/api build

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @pos/api prisma migrate deploy && node apps/api/dist/main.js"]
```

- [ ] **Step 4: Create `render.yaml`**

Write `render.yaml`:
```yaml
services:
  - type: web
    name: pos-api
    runtime: docker
    dockerfilePath: ./apps/api/Dockerfile
    plan: starter
    region: singapore
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: DATABASE_URL
        sync: false
      - key: SENTRY_DSN_API
        sync: false
      - key: ADMIN_KEY
        sync: false
```

- [ ] **Step 5: Connect Render (manual cloud step)**

1. Sign up / log in at https://render.com.
2. New → Blueprint → connect this GitHub repo. Render reads `render.yaml`.
3. When prompted, paste values for `DATABASE_URL` (Neon URL from Step 1), `SENTRY_DSN_API` (from Sentry), `ADMIN_KEY` (any 32-char random string — keep this for Plan 2).
4. Click Apply. Wait ~3–5 min for first build.
5. When deploy succeeds, copy the public URL (e.g., `https://pos-api.onrender.com`).

- [ ] **Step 6: Verify deployed API health**

Run:
```bash
curl -s https://pos-api.onrender.com/health
```

Expected: `{"status":"ok","service":"@pos/api","version":"0.0.0","uptimeSeconds":...}`. If 502/timeout, check Render logs — most common cause is missing `DATABASE_URL`.

- [ ] **Step 7: Connect Vercel (manual cloud step)**

1. Sign up / log in at https://vercel.com.
2. Import the GitHub repo.
3. Project settings → Root Directory: `apps/web`. Framework: Next.js (auto-detected).
4. Build & Output:
   - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
   - Build Command: `cd ../.. && pnpm --filter @pos/api prisma generate && pnpm --filter @pos/web build`
   - Output Directory: `.next`
5. Environment Variables:
   - `NEXT_PUBLIC_API_URL` = `https://pos-api.onrender.com`
   - `NEXT_PUBLIC_SENTRY_DSN` = your web Sentry DSN
   - `SENTRY_DSN_WEB` = same as above
6. Deploy. Wait ~2–3 min.
7. Copy the production URL (e.g., `https://pos-superpowers.vercel.app`).

- [ ] **Step 8: Verify deployed web**

Open the Vercel URL in a browser. Expected: heading "POS Superpowers" + "API health: ok" + JSON pre block.

Run:
```bash
curl -s https://pos-superpowers.vercel.app/api/health
```

Expected: `{"status":"ok","service":"@pos/web",...}`.

- [ ] **Step 9: Trigger Sentry from production to confirm it captures**

```bash
curl -s https://pos-api.onrender.com/debug-sentry || true
```

Wait ~30s, open Sentry → `pos-api` project. Expected: 1 new issue "Sentry debug error" with environment `production`.

- [ ] **Step 10: Update README with live URLs**

Edit `README.md` — append a new section after Quickstart:
```markdown
## Live environments

| | URL |
|---|---|
| Web (production) | https://pos-superpowers.vercel.app |
| API (production) | https://pos-api.onrender.com |
| API health       | https://pos-api.onrender.com/health |
| Database         | Neon `pos-superpowers` (Singapore) |
| Errors           | Sentry projects `pos-api`, `pos-web` |
```

Replace placeholder URLs with your actual ones.

- [ ] **Step 11: Commit**

```bash
git add apps/api/Dockerfile render.yaml README.md
git commit -m "chore: deploy pipeline (neon + render + vercel)"
git push
```

Wait for Render + Vercel to redeploy automatically (~3 min). Re-run the curl checks from Steps 6 and 8 to confirm the redeploy is healthy.

---

## Done check

After all 8 tasks, you should be able to demonstrate:

- [ ] `pnpm install` from a fresh clone succeeds
- [ ] `pnpm dev:api` serves http://localhost:3001/health → 200 ok
- [ ] `pnpm dev:web` serves http://localhost:3000 → page shows "API health: ok"
- [ ] `pnpm test` passes on every package + app
- [ ] `pnpm --filter @pos/api test:int` passes against Testcontainers Postgres
- [ ] CI is green on `main` (3 jobs)
- [ ] Production API + Web URLs both return 200
- [ ] Sentry receives an event from `/debug-sentry` in production
- [ ] Neon shows the `tenants` table

If all 9 boxes tick, the foundation is shipped. Plan 2 (`auth-and-tenancy`) starts here.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
