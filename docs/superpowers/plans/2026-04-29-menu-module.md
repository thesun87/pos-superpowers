# Menu Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the BE menu CRUD (categories, items, modifier groups + options), R2 presigned image upload, and the Admin UI tables/forms — so the OWNER of a tenant can manage the full menu through the web app.

**Architecture:** Three NestJS feature modules (`menu/categories`, `menu/items`, `menu/modifier-groups`) on top of Plan 2's `JwtAuthGuard` + `RolesGuard` + `TenantService`. Tenant scoping is enforced at every service method by reading `tenantService.getTenantId()` and adding it to every Prisma `where` / `data`. Image upload uses presigned PUT URLs to Cloudflare R2 (S3-compatible) — files never pass through the API. Admin UI lives at `/admin/menu/{categories,items,modifiers}` in the existing Next.js app, using shadcn/ui primitives, React Hook Form + Zod, and TanStack Query against an authenticated fetch wrapper.

**Tech Stack:** NestJS 10, Prisma 5, `@aws-sdk/client-s3` 3.621, `@aws-sdk/s3-request-presigner` 3.621, Next.js 15 App Router, TanStack Query 5, React Hook Form 7 + `@hookform/resolvers`, Zod 3, shadcn/ui (Radix), Tailwind 3, Sonner.

---

## Preconditions

Plan 2 (`auth-and-tenancy`) must be merged to `main` and its **Done check** fully ticked before starting this plan. In particular:

- `User` model exists with `Role` enum (`OWNER` | `CASHIER`).
- `apps/api/src/auth/guards/jwt-auth.guard.ts` and `roles.guard.ts` + `roles.decorator.ts` exist and work.
- `apps/api/src/tenant/tenant.service.ts` reliably stores tenantId in `AsyncLocalStorage` for the lifetime of a request (i.e., the middleware uses `als.run(ctx, () => next())`, not the no-op pattern).
- `POST /auth/login` returns `{ accessToken, user }` and sets `refreshToken` cookie.
- `POST /admin/tenants` creates a tenant + owner.
- CI is green.

If any of these are not true, fix them in Plan 2 first — do not patch in this plan.

---

## File Structure

After this plan completes, the repo adds:

```
apps/api/src/
├── menu/
│   ├── menu.module.ts
│   ├── categories/
│   │   ├── categories.controller.ts
│   │   ├── categories.controller.spec.ts
│   │   ├── categories.service.ts
│   │   └── categories.service.spec.ts
│   ├── items/
│   │   ├── items.controller.ts
│   │   ├── items.controller.spec.ts
│   │   ├── items.service.ts
│   │   └── items.service.spec.ts
│   ├── modifier-groups/
│   │   ├── modifier-groups.controller.ts
│   │   ├── modifier-groups.controller.spec.ts
│   │   ├── modifier-groups.service.ts
│   │   └── modifier-groups.service.spec.ts
│   └── uploads/
│       ├── uploads.controller.ts
│       ├── uploads.controller.spec.ts
│       ├── uploads.service.ts
│       └── uploads.service.spec.ts
└── menu/menu.isolation.int-spec.ts

packages/contracts/src/
├── index.ts                 # MODIFIED: re-export menu schemas
└── menu/
    ├── index.ts
    ├── category.ts
    ├── item.ts
    ├── modifier.ts
    └── upload.ts

apps/web/src/
├── components/ui/           # NEW: shadcn primitives (button, input, label, dialog, form, table, toast)
│   ├── button.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── dialog.tsx
│   ├── form.tsx
│   ├── table.tsx
│   └── toast.tsx
├── lib/
│   ├── api-client.ts        # NEW: fetch wrapper, JWT injection, Zod validation
│   ├── api-client.spec.ts
│   └── utils.ts             # NEW: `cn()` for shadcn
├── providers/
│   ├── query-provider.tsx   # NEW: TanStack Query
│   └── auth-provider.tsx    # NEW: stores access token in memory
├── features/menu/
│   ├── use-categories.ts
│   ├── use-items.ts
│   ├── use-modifier-groups.ts
│   └── use-upload-image.ts
└── app/(admin)/
    ├── layout.tsx           # NEW: RequireRole(OWNER) + nav
    └── admin/
        └── menu/
            ├── categories/page.tsx
            ├── modifiers/page.tsx
            └── items/page.tsx
```

**Responsibility per file:**

- `apps/api/src/menu/categories/*` — CRUD for `MenuCategory`. Tenant-scoped via `TenantService`. Soft-delete via `isActive=false`.
- `apps/api/src/menu/items/*` — CRUD for `MenuItem`, including attach/detach `ModifierGroup` via the join table.
- `apps/api/src/menu/modifier-groups/*` — CRUD for `ModifierGroup` and its `ModifierOption[]` (nested writes; PATCH replaces all options).
- `apps/api/src/menu/uploads/*` — Issues presigned PUT URLs against R2; never streams files itself.
- `apps/api/src/menu/menu.isolation.int-spec.ts` — End-to-end "tenant A cannot read/write tenant B's menu" against real Postgres.
- `packages/contracts/src/menu/*` — Zod request/response schemas; the source of truth for both BE controllers and FE forms.
- `apps/web/src/components/ui/*` — shadcn primitives, generated locally (no CLI in CI).
- `apps/web/src/lib/api-client.ts` — Single fetch wrapper that adds `Authorization`, throws on non-2xx, and Zod-parses the response body.
- `apps/web/src/providers/*` — Query client + auth context (access token in memory; refresh handled by Plan 2's cookie).
- `apps/web/src/features/menu/*` — TanStack Query hooks calling the api-client.
- `apps/web/src/app/(admin)/*` — Admin route group with `RequireRole('OWNER')`. Three pages: categories, modifiers, items.

---

## Task 1: Prisma — menu + modifier models + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Append menu/modifier models to `apps/api/prisma/schema.prisma`**

Edit `apps/api/prisma/schema.prisma` — append at the end of the file:

```prisma
model MenuCategory {
  id        String   @id @default(uuid())
  tenantId  String
  name      String
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  items  MenuItem[]

  @@index([tenantId, isActive, sortOrder])
  @@map("menu_categories")
}

model MenuItem {
  id          String   @id @default(uuid())
  tenantId    String
  categoryId  String
  name        String
  basePrice   Int
  imageUrl    String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant         Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  category       MenuCategory            @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  modifierGroups MenuItemModifierGroup[]

  @@index([tenantId, categoryId, isActive])
  @@map("menu_items")
}

model ModifierGroup {
  id            String        @id @default(uuid())
  tenantId      String
  name          String
  selectionType SelectionType
  minSelect     Int           @default(0)
  maxSelect     Int           @default(1)
  isRequired    Boolean       @default(false)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  tenant   Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  options  ModifierOption[]
  menuItems MenuItemModifierGroup[]

  @@index([tenantId])
  @@map("modifier_groups")
}

model ModifierOption {
  id              String   @id @default(uuid())
  tenantId        String
  modifierGroupId String
  name            String
  priceDelta      Int      @default(0)
  isDefault       Boolean  @default(false)
  sortOrder       Int      @default(0)

  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  modifierGroup ModifierGroup @relation(fields: [modifierGroupId], references: [id], onDelete: Cascade)

  @@index([tenantId, modifierGroupId, sortOrder])
  @@map("modifier_options")
}

model MenuItemModifierGroup {
  menuItemId      String
  modifierGroupId String
  tenantId        String
  sortOrder       Int    @default(0)

  menuItem      MenuItem      @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  modifierGroup ModifierGroup @relation(fields: [modifierGroupId], references: [id], onDelete: Cascade)

  @@id([menuItemId, modifierGroupId])
  @@index([tenantId])
  @@map("menu_item_modifier_groups")
}

enum SelectionType {
  SINGLE
  MULTIPLE
}
```

- [ ] **Step 2: Add the back-relations on `Tenant`**

Edit `apps/api/prisma/schema.prisma` — find the `Tenant` model and add these lines just before the closing `}`:

```prisma
  menuCategories  MenuCategory[]
  menuItems       MenuItem[]
  modifierGroups  ModifierGroup[]
  modifierOptions ModifierOption[]
```

- [ ] **Step 3: Start a local Postgres for the migration**

Run:
```bash
docker run --rm -d --name pos-pg-dev -e POSTGRES_USER=pos -e POSTGRES_PASSWORD=pos -e POSTGRES_DB=pos -p 5432:5432 postgres:16-alpine
```

Wait ~3s for the container to be ready (`docker logs pos-pg-dev` should show `database system is ready to accept connections`).

- [ ] **Step 4: Create the migration**

Run:
```bash
DATABASE_URL=postgresql://pos:pos@localhost:5432/pos?schema=public pnpm --filter @pos/api prisma migrate dev --name add_menu
```

Expected: a new directory `apps/api/prisma/migrations/<timestamp>_add_menu/` with `migration.sql`. Prisma client is regenerated automatically.

Verify the SQL contains all five new tables:
```bash
grep -E "CREATE TABLE \"menu_categories|menu_items|modifier_groups|modifier_options|menu_item_modifier_groups\"" apps/api/prisma/migrations/*_add_menu/migration.sql | wc -l
```

Expected: `5`.

- [ ] **Step 5: Stop local Postgres**

Run:
```bash
docker stop pos-pg-dev
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add menu + modifier prisma models"
```

---

## Task 2: Contracts — Zod schemas for menu DTOs

**Files:**
- Create: `packages/contracts/src/menu/category.ts`
- Create: `packages/contracts/src/menu/modifier.ts`
- Create: `packages/contracts/src/menu/item.ts`
- Create: `packages/contracts/src/menu/upload.ts`
- Create: `packages/contracts/src/menu/index.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/src/menu/category.ts`**

Write `packages/contracts/src/menu/category.ts`:
```ts
import { z } from "zod";

export const MenuCategorySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

export const CreateMenuCategoryRequestSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().nonnegative().default(0)
});
export type CreateMenuCategoryRequest = z.infer<typeof CreateMenuCategoryRequestSchema>;

export const UpdateMenuCategoryRequestSchema = CreateMenuCategoryRequestSchema.partial().extend({
  isActive: z.boolean().optional()
});
export type UpdateMenuCategoryRequest = z.infer<typeof UpdateMenuCategoryRequestSchema>;

export const MenuCategoryListResponseSchema = z.object({
  data: z.array(MenuCategorySchema)
});
export type MenuCategoryListResponse = z.infer<typeof MenuCategoryListResponseSchema>;
```

- [ ] **Step 2: Create `packages/contracts/src/menu/modifier.ts`**

Write `packages/contracts/src/menu/modifier.ts`:
```ts
import { z } from "zod";

export const SelectionTypeSchema = z.enum(["SINGLE", "MULTIPLE"]);
export type SelectionType = z.infer<typeof SelectionTypeSchema>;

export const ModifierOptionSchema = z.object({
  id: z.string().uuid(),
  modifierGroupId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(60),
  priceDelta: z.number().int(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});
export type ModifierOption = z.infer<typeof ModifierOptionSchema>;

export const ModifierGroupSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(60),
  selectionType: SelectionTypeSchema,
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().positive(),
  isRequired: z.boolean(),
  options: z.array(ModifierOptionSchema)
});
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

export const ModifierOptionInputSchema = z.object({
  name: z.string().min(1).max(60),
  priceDelta: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0)
});
export type ModifierOptionInput = z.infer<typeof ModifierOptionInputSchema>;

export const CreateModifierGroupRequestSchema = z.object({
  name: z.string().min(1).max(60),
  selectionType: SelectionTypeSchema,
  minSelect: z.number().int().nonnegative().default(0),
  maxSelect: z.number().int().positive().default(1),
  isRequired: z.boolean().default(false),
  options: z.array(ModifierOptionInputSchema).min(1).max(20)
}).refine((g) => g.maxSelect >= g.minSelect, {
  message: "maxSelect must be ≥ minSelect",
  path: ["maxSelect"]
});
export type CreateModifierGroupRequest = z.infer<typeof CreateModifierGroupRequestSchema>;

export const UpdateModifierGroupRequestSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  selectionType: SelectionTypeSchema.optional(),
  minSelect: z.number().int().nonnegative().optional(),
  maxSelect: z.number().int().positive().optional(),
  isRequired: z.boolean().optional(),
  options: z.array(ModifierOptionInputSchema).min(1).max(20).optional()
});
export type UpdateModifierGroupRequest = z.infer<typeof UpdateModifierGroupRequestSchema>;

export const ModifierGroupListResponseSchema = z.object({
  data: z.array(ModifierGroupSchema)
});
export type ModifierGroupListResponse = z.infer<typeof ModifierGroupListResponseSchema>;
```

- [ ] **Step 3: Create `packages/contracts/src/menu/item.ts`**

Write `packages/contracts/src/menu/item.ts`:
```ts
import { z } from "zod";

export const MenuItemModifierGroupRefSchema = z.object({
  modifierGroupId: z.string().uuid(),
  sortOrder: z.number().int().nonnegative()
});
export type MenuItemModifierGroupRef = z.infer<typeof MenuItemModifierGroupRefSchema>;

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(120),
  basePrice: z.number().int().nonnegative(),
  imageUrl: z.string().url().nullable(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  modifierGroupIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const CreateMenuItemRequestSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(120),
  basePrice: z.number().int().nonnegative(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  modifierGroupIds: z.array(z.string().uuid()).max(10).default([])
});
export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemRequestSchema>;

export const UpdateMenuItemRequestSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  basePrice: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  modifierGroupIds: z.array(z.string().uuid()).max(10).optional()
});
export type UpdateMenuItemRequest = z.infer<typeof UpdateMenuItemRequestSchema>;

export const MenuItemListResponseSchema = z.object({
  data: z.array(MenuItemSchema)
});
export type MenuItemListResponse = z.infer<typeof MenuItemListResponseSchema>;
```

- [ ] **Step 4: Create `packages/contracts/src/menu/upload.ts`**

Write `packages/contracts/src/menu/upload.ts`:
```ts
import { z } from "zod";

export const SignUploadRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  contentLength: z.number().int().positive().max(5 * 1024 * 1024) // 5 MB cap
});
export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>;

export const SignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  key: z.string().min(1),
  expiresInSeconds: z.number().int().positive()
});
export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;
```

- [ ] **Step 5: Create `packages/contracts/src/menu/index.ts`**

Write `packages/contracts/src/menu/index.ts`:
```ts
export * from "./category";
export * from "./modifier";
export * from "./item";
export * from "./upload";
```

- [ ] **Step 6: Re-export from contracts root**

Edit `packages/contracts/src/index.ts`:
```ts
export * from "./health";
export * from "./menu";
```

- [ ] **Step 7: Typecheck contracts**

Run:
```bash
pnpm --filter @pos/contracts typecheck
```

Expected: `0 errors`.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add menu/modifier/item/upload zod schemas"
```

---

## Task 3: BE — Categories module (TDD)

**Files:**
- Create: `apps/api/src/menu/categories/categories.service.ts`
- Create: `apps/api/src/menu/categories/categories.service.spec.ts`
- Create: `apps/api/src/menu/categories/categories.controller.ts`
- Create: `apps/api/src/menu/categories/categories.controller.spec.ts`
- Create: `apps/api/src/menu/menu.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing service spec**

Write `apps/api/src/menu/categories/categories.service.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantService } from "../../tenant/tenant.service";

describe("CategoriesService", () => {
  let service: CategoriesService;
  let prisma: { menuCategory: Record<string, jest.Mock> };
  let tenant: { getTenantId: jest.Mock };

  beforeEach(async () => {
    prisma = {
      menuCategory: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      }
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantService, useValue: tenant }
      ]
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  it("findAll filters by tenant and returns active-first ordered by sortOrder", async () => {
    prisma.menuCategory.findMany.mockResolvedValue([{ id: "c1" }]);
    const result = await service.findAll();
    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
    });
    expect(result).toEqual([{ id: "c1" }]);
  });

  it("create injects tenantId from context", async () => {
    prisma.menuCategory.create.mockResolvedValue({ id: "c2", name: "Trà sữa" });
    const result = await service.create({ name: "Trà sữa", sortOrder: 0 });
    expect(prisma.menuCategory.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-a", name: "Trà sữa", sortOrder: 0 }
    });
    expect(result.name).toBe("Trà sữa");
  });

  it("update guards by tenantId in where", async () => {
    prisma.menuCategory.findFirst.mockResolvedValue({ id: "c3" });
    prisma.menuCategory.update.mockResolvedValue({ id: "c3", name: "Cafe" });
    await service.update("c3", { name: "Cafe" });
    expect(prisma.menuCategory.findFirst).toHaveBeenCalledWith({
      where: { id: "c3", tenantId: "tenant-a" }
    });
    expect(prisma.menuCategory.update).toHaveBeenCalledWith({
      where: { id: "c3" },
      data: { name: "Cafe" }
    });
  });

  it("update throws NotFoundException when category belongs to another tenant", async () => {
    prisma.menuCategory.findFirst.mockResolvedValue(null);
    await expect(service.update("c-other", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.menuCategory.update).not.toHaveBeenCalled();
  });

  it("softDelete sets isActive=false scoped by tenantId", async () => {
    prisma.menuCategory.updateMany.mockResolvedValue({ count: 1 });
    await service.softDelete("c4");
    expect(prisma.menuCategory.updateMany).toHaveBeenCalledWith({
      where: { id: "c4", tenantId: "tenant-a" },
      data: { isActive: false }
    });
  });

  it("softDelete throws NotFoundException when count is 0", async () => {
    prisma.menuCategory.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.softDelete("c-none")).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=categories.service.spec
```

Expected: FAIL with `Cannot find module './categories.service'`.

- [ ] **Step 3: Implement `categories.service.ts`**

Write `apps/api/src/menu/categories/categories.service.ts`:
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantService } from "../../tenant/tenant.service";
import type {
  CreateMenuCategoryRequest,
  UpdateMenuCategoryRequest
} from "@pos/contracts";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService
  ) {}

  async findAll() {
    const tenantId = this.tenant.getTenantId();
    return this.prisma.menuCategory.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  async create(input: CreateMenuCategoryRequest) {
    const tenantId = this.tenant.getTenantId();
    return this.prisma.menuCategory.create({
      data: { tenantId, name: input.name, sortOrder: input.sortOrder }
    });
  }

  async update(id: string, input: UpdateMenuCategoryRequest) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.prisma.menuCategory.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      throw new NotFoundException("Category not found");
    }
    return this.prisma.menuCategory.update({
      where: { id },
      data: input
    });
  }

  async softDelete(id: string) {
    const tenantId = this.tenant.getTenantId();
    const result = await this.prisma.menuCategory.updateMany({
      where: { id, tenantId },
      data: { isActive: false }
    });
    if (result.count === 0) {
      throw new NotFoundException("Category not found");
    }
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=categories.service.spec
```

Expected: PASS, `6 passed`.

- [ ] **Step 5: Write the failing controller spec**

Write `apps/api/src/menu/categories/categories.controller.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

describe("CategoriesController", () => {
  let controller: CategoriesController;
  let service: { findAll: jest.Mock; create: jest.Mock; update: jest.Mock; softDelete: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }]
    }).compile();
    controller = moduleRef.get(CategoriesController);
  });

  it("GET / returns { data: rows }", async () => {
    service.findAll.mockResolvedValue([{ id: "c1" }]);
    const res = await controller.list();
    expect(res).toEqual({ data: [{ id: "c1" }] });
  });

  it("POST / validates body via Zod and creates", async () => {
    service.create.mockResolvedValue({ id: "c2", name: "Cafe" });
    const res = await controller.create({ name: "Cafe", sortOrder: 0 });
    expect(service.create).toHaveBeenCalledWith({ name: "Cafe", sortOrder: 0 });
    expect(res.name).toBe("Cafe");
  });

  it("POST / rejects empty name", async () => {
    await expect(controller.create({ name: "", sortOrder: 0 } as never)).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id forwards to service.update", async () => {
    service.update.mockResolvedValue({ id: "c3", name: "x" });
    await controller.update("c3", { name: "x" });
    expect(service.update).toHaveBeenCalledWith("c3", { name: "x" });
  });

  it("DELETE /:id calls softDelete", async () => {
    await controller.remove("c4");
    expect(service.softDelete).toHaveBeenCalledWith("c4");
  });
});
```

- [ ] **Step 6: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=categories.controller.spec
```

Expected: FAIL with `Cannot find module './categories.controller'`.

- [ ] **Step 7: Implement `categories.controller.ts`**

Write `apps/api/src/menu/categories/categories.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  CreateMenuCategoryRequestSchema,
  UpdateMenuCategoryRequestSchema,
  type CreateMenuCategoryRequest,
  type UpdateMenuCategoryRequest,
  type MenuCategoryListResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { CategoriesService } from "./categories.service";

@Controller("menu/categories")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles("OWNER", "CASHIER")
  async list(): Promise<MenuCategoryListResponse> {
    const data = await this.categories.findAll();
    return { data: data as MenuCategoryListResponse["data"] };
  }

  @Post()
  @Roles("OWNER")
  async create(@Body() body: CreateMenuCategoryRequest) {
    const parsed = CreateMenuCategoryRequestSchema.parse(body);
    return this.categories.create(parsed);
  }

  @Patch(":id")
  @Roles("OWNER")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMenuCategoryRequest
  ) {
    const parsed = UpdateMenuCategoryRequestSchema.parse(body);
    return this.categories.update(id, parsed);
  }

  @Delete(":id")
  @Roles("OWNER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.categories.softDelete(id);
  }
}
```

- [ ] **Step 8: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=categories.controller.spec
```

Expected: PASS, `5 passed`.

- [ ] **Step 9: Create `menu.module.ts` and wire categories**

Write `apps/api/src/menu/menu.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService]
})
export class MenuModule {}
```

- [ ] **Step 10: Register MenuModule in `app.module.ts`**

Edit `apps/api/src/app.module.ts` — add the import line at the top and include `MenuModule` in the `imports` array (do not change existing entries):
```ts
import { MenuModule } from "./menu/menu.module";
```

And add `MenuModule` to the `imports` array, after `AdminModule` (or after the last existing module).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/menu apps/api/src/app.module.ts
git commit -m "feat(api): add menu/categories CRUD"
```

---

## Task 4: BE — Modifier Groups module (TDD)

**Files:**
- Create: `apps/api/src/menu/modifier-groups/modifier-groups.service.ts`
- Create: `apps/api/src/menu/modifier-groups/modifier-groups.service.spec.ts`
- Create: `apps/api/src/menu/modifier-groups/modifier-groups.controller.ts`
- Create: `apps/api/src/menu/modifier-groups/modifier-groups.controller.spec.ts`
- Modify: `apps/api/src/menu/menu.module.ts`

- [ ] **Step 1: Write the failing service spec**

Write `apps/api/src/menu/modifier-groups/modifier-groups.service.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ModifierGroupsService } from "./modifier-groups.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantService } from "../../tenant/tenant.service";

describe("ModifierGroupsService", () => {
  let service: ModifierGroupsService;
  let prisma: {
    modifierGroup: Record<string, jest.Mock>;
    modifierOption: Record<string, jest.Mock>;
    menuItemModifierGroup: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let tenant: { getTenantId: jest.Mock };

  beforeEach(async () => {
    prisma = {
      modifierGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      },
      modifierOption: {
        deleteMany: jest.fn(),
        createMany: jest.fn()
      },
      menuItemModifierGroup: { count: jest.fn() },
      $transaction: jest.fn(async (cb) => cb(prisma))
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ModifierGroupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantService, useValue: tenant }
      ]
    }).compile();
    service = moduleRef.get(ModifierGroupsService);
  });

  it("findAll returns groups including options ordered by sortOrder", async () => {
    prisma.modifierGroup.findMany.mockResolvedValue([{ id: "g1", options: [] }]);
    const result = await service.findAll();
    expect(prisma.modifierGroup.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" }
    });
    expect(result).toEqual([{ id: "g1", options: [] }]);
  });

  it("create writes group + options in a transaction with tenantId on each", async () => {
    prisma.modifierGroup.create.mockResolvedValue({
      id: "g2",
      tenantId: "tenant-a",
      options: [{ id: "o1", name: "S" }]
    });
    const result = await service.create({
      name: "Size",
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [
        { name: "S", priceDelta: 0, isDefault: true, sortOrder: 0 },
        { name: "L", priceDelta: 5000, isDefault: false, sortOrder: 1 }
      ]
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.modifierGroup.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-a",
        name: "Size",
        selectionType: "SINGLE",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        options: {
          create: [
            { tenantId: "tenant-a", name: "S", priceDelta: 0, isDefault: true, sortOrder: 0 },
            { tenantId: "tenant-a", name: "L", priceDelta: 5000, isDefault: false, sortOrder: 1 }
          ]
        }
      },
      include: { options: { orderBy: { sortOrder: "asc" } } }
    });
    expect(result.id).toBe("g2");
  });

  it("update replaces options atomically when options provided", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: "g3" });
    prisma.modifierGroup.update.mockResolvedValue({ id: "g3", options: [] });
    await service.update("g3", {
      name: "Đường",
      options: [{ name: "Ngọt", priceDelta: 0, isDefault: false, sortOrder: 0 }]
    });
    expect(prisma.modifierOption.deleteMany).toHaveBeenCalledWith({
      where: { modifierGroupId: "g3", tenantId: "tenant-a" }
    });
    expect(prisma.modifierOption.createMany).toHaveBeenCalledWith({
      data: [
        {
          modifierGroupId: "g3",
          tenantId: "tenant-a",
          name: "Ngọt",
          priceDelta: 0,
          isDefault: false,
          sortOrder: 0
        }
      ]
    });
    expect(prisma.modifierGroup.update).toHaveBeenCalledWith({
      where: { id: "g3" },
      data: { name: "Đường" },
      include: { options: { orderBy: { sortOrder: "asc" } } }
    });
  });

  it("update throws NotFoundException for cross-tenant id", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue(null);
    await expect(service.update("g-other", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("delete throws ConflictException when group is attached to a menu item", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: "g4" });
    prisma.menuItemModifierGroup.count.mockResolvedValue(2);
    await expect(service.remove("g4")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.modifierGroup.delete).not.toHaveBeenCalled();
  });

  it("delete removes group when not attached", async () => {
    prisma.modifierGroup.findFirst.mockResolvedValue({ id: "g5" });
    prisma.menuItemModifierGroup.count.mockResolvedValue(0);
    await service.remove("g5");
    expect(prisma.modifierGroup.delete).toHaveBeenCalledWith({ where: { id: "g5" } });
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=modifier-groups.service.spec
```

Expected: FAIL with `Cannot find module './modifier-groups.service'`.

- [ ] **Step 3: Implement `modifier-groups.service.ts`**

Write `apps/api/src/menu/modifier-groups/modifier-groups.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantService } from "../../tenant/tenant.service";
import type {
  CreateModifierGroupRequest,
  UpdateModifierGroupRequest
} from "@pos/contracts";

@Injectable()
export class ModifierGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService
  ) {}

  async findAll() {
    const tenantId = this.tenant.getTenantId();
    return this.prisma.modifierGroup.findMany({
      where: { tenantId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" }
    });
  }

  async create(input: CreateModifierGroupRequest) {
    const tenantId = this.tenant.getTenantId();
    return this.prisma.$transaction((tx) =>
      tx.modifierGroup.create({
        data: {
          tenantId,
          name: input.name,
          selectionType: input.selectionType,
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          isRequired: input.isRequired,
          options: {
            create: input.options.map((o) => ({
              tenantId,
              name: o.name,
              priceDelta: o.priceDelta,
              isDefault: o.isDefault,
              sortOrder: o.sortOrder
            }))
          }
        },
        include: { options: { orderBy: { sortOrder: "asc" } } }
      })
    );
  }

  async update(id: string, input: UpdateModifierGroupRequest) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.prisma.modifierGroup.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      throw new NotFoundException("Modifier group not found");
    }
    const { options, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      if (options !== undefined) {
        await tx.modifierOption.deleteMany({
          where: { modifierGroupId: id, tenantId }
        });
        await tx.modifierOption.createMany({
          data: options.map((o) => ({
            modifierGroupId: id,
            tenantId,
            name: o.name,
            priceDelta: o.priceDelta,
            isDefault: o.isDefault,
            sortOrder: o.sortOrder
          }))
        });
      }
      return tx.modifierGroup.update({
        where: { id },
        data: rest,
        include: { options: { orderBy: { sortOrder: "asc" } } }
      });
    });
  }

  async remove(id: string) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.prisma.modifierGroup.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      throw new NotFoundException("Modifier group not found");
    }
    const attached = await this.prisma.menuItemModifierGroup.count({
      where: { modifierGroupId: id, tenantId }
    });
    if (attached > 0) {
      throw new ConflictException(
        "Modifier group is attached to one or more menu items; detach first"
      );
    }
    await this.prisma.modifierGroup.delete({ where: { id } });
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=modifier-groups.service.spec
```

Expected: PASS, `6 passed`.

- [ ] **Step 5: Write the failing controller spec**

Write `apps/api/src/menu/modifier-groups/modifier-groups.controller.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { ModifierGroupsController } from "./modifier-groups.controller";
import { ModifierGroupsService } from "./modifier-groups.service";

describe("ModifierGroupsController", () => {
  let controller: ModifierGroupsController;
  let service: { findAll: jest.Mock; create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ModifierGroupsController],
      providers: [{ provide: ModifierGroupsService, useValue: service }]
    }).compile();
    controller = moduleRef.get(ModifierGroupsController);
  });

  it("GET / wraps findAll in { data }", async () => {
    service.findAll.mockResolvedValue([{ id: "g1", options: [] }]);
    const res = await controller.list();
    expect(res).toEqual({ data: [{ id: "g1", options: [] }] });
  });

  it("POST / parses body and creates", async () => {
    service.create.mockResolvedValue({ id: "g2" });
    await controller.create({
      name: "Size",
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [{ name: "S", priceDelta: 0, isDefault: true, sortOrder: 0 }]
    });
    expect(service.create).toHaveBeenCalled();
  });

  it("POST / rejects when maxSelect < minSelect", async () => {
    await expect(
      controller.create({
        name: "Bad",
        selectionType: "MULTIPLE",
        minSelect: 3,
        maxSelect: 1,
        isRequired: false,
        options: [{ name: "x", priceDelta: 0, isDefault: false, sortOrder: 0 }]
      } as never)
    ).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id forwards", async () => {
    service.update.mockResolvedValue({ id: "g3" });
    await controller.update("g3", { name: "x" });
    expect(service.update).toHaveBeenCalledWith("g3", { name: "x" });
  });

  it("DELETE /:id forwards", async () => {
    await controller.remove("g4");
    expect(service.remove).toHaveBeenCalledWith("g4");
  });
});
```

- [ ] **Step 6: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=modifier-groups.controller.spec
```

Expected: FAIL.

- [ ] **Step 7: Implement `modifier-groups.controller.ts`**

Write `apps/api/src/menu/modifier-groups/modifier-groups.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  CreateModifierGroupRequestSchema,
  UpdateModifierGroupRequestSchema,
  type CreateModifierGroupRequest,
  type UpdateModifierGroupRequest,
  type ModifierGroupListResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { ModifierGroupsService } from "./modifier-groups.service";

@Controller("menu/modifier-groups")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModifierGroupsController {
  constructor(private readonly groups: ModifierGroupsService) {}

  @Get()
  @Roles("OWNER", "CASHIER")
  async list(): Promise<ModifierGroupListResponse> {
    const data = await this.groups.findAll();
    return { data: data as ModifierGroupListResponse["data"] };
  }

  @Post()
  @Roles("OWNER")
  async create(@Body() body: CreateModifierGroupRequest) {
    const parsed = CreateModifierGroupRequestSchema.parse(body);
    return this.groups.create(parsed);
  }

  @Patch(":id")
  @Roles("OWNER")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateModifierGroupRequest
  ) {
    const parsed = UpdateModifierGroupRequestSchema.parse(body);
    return this.groups.update(id, parsed);
  }

  @Delete(":id")
  @Roles("OWNER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.groups.remove(id);
  }
}
```

- [ ] **Step 8: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=modifier-groups.controller.spec
```

Expected: PASS, `5 passed`.

- [ ] **Step 9: Wire into `menu.module.ts`**

Replace `apps/api/src/menu/menu.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";
import { ModifierGroupsController } from "./modifier-groups/modifier-groups.controller";
import { ModifierGroupsService } from "./modifier-groups/modifier-groups.service";

@Module({
  controllers: [CategoriesController, ModifierGroupsController],
  providers: [CategoriesService, ModifierGroupsService]
})
export class MenuModule {}
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/menu
git commit -m "feat(api): add menu/modifier-groups CRUD with nested options"
```

---

## Task 5: BE — Menu Items module (TDD)

**Files:**
- Create: `apps/api/src/menu/items/items.service.ts`
- Create: `apps/api/src/menu/items/items.service.spec.ts`
- Create: `apps/api/src/menu/items/items.controller.ts`
- Create: `apps/api/src/menu/items/items.controller.spec.ts`
- Modify: `apps/api/src/menu/menu.module.ts`

- [ ] **Step 1: Write the failing service spec**

Write `apps/api/src/menu/items/items.service.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ItemsService } from "./items.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantService } from "../../tenant/tenant.service";

describe("ItemsService", () => {
  let service: ItemsService;
  let prisma: {
    menuItem: Record<string, jest.Mock>;
    menuCategory: Record<string, jest.Mock>;
    modifierGroup: Record<string, jest.Mock>;
    menuItemModifierGroup: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let tenant: { getTenantId: jest.Mock };

  const sampleItemRow = (overrides: Record<string, unknown> = {}) => ({
    id: "i1",
    tenantId: "tenant-a",
    categoryId: "c1",
    name: "Trà đào",
    basePrice: 45000,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    modifierGroups: [{ modifierGroupId: "g1", sortOrder: 0 }],
    ...overrides
  });

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      },
      menuCategory: { findFirst: jest.fn() },
      modifierGroup: { findMany: jest.fn() },
      menuItemModifierGroup: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (cb) => cb(prisma))
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantService, useValue: tenant }
      ]
    }).compile();
    service = moduleRef.get(ItemsService);
  });

  it("findAll filters by tenant and optional categoryId", async () => {
    prisma.menuItem.findMany.mockResolvedValue([sampleItemRow()]);
    await service.findAll({ categoryId: "c1" });
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", categoryId: "c1" },
      include: { modifierGroups: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
  });

  it("create rejects when category belongs to another tenant", async () => {
    prisma.menuCategory.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        categoryId: "c-other",
        name: "x",
        basePrice: 1000,
        sortOrder: 0,
        modifierGroupIds: []
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("create rejects when modifier group belongs to another tenant", async () => {
    prisma.menuCategory.findFirst.mockResolvedValue({ id: "c1" });
    prisma.modifierGroup.findMany.mockResolvedValue([{ id: "g1" }]);
    await expect(
      service.create({
        categoryId: "c1",
        name: "x",
        basePrice: 1000,
        sortOrder: 0,
        modifierGroupIds: ["g1", "g-other"]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("create writes item + modifier-group joins in a transaction", async () => {
    prisma.menuCategory.findFirst.mockResolvedValue({ id: "c1" });
    prisma.modifierGroup.findMany.mockResolvedValue([{ id: "g1" }, { id: "g2" }]);
    prisma.menuItem.create.mockResolvedValue(sampleItemRow({ id: "i2" }));
    await service.create({
      categoryId: "c1",
      name: "Cafe sữa",
      basePrice: 30000,
      sortOrder: 0,
      modifierGroupIds: ["g1", "g2"]
    });
    expect(prisma.menuItem.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-a",
        categoryId: "c1",
        name: "Cafe sữa",
        basePrice: 30000,
        imageUrl: null,
        sortOrder: 0,
        modifierGroups: {
          create: [
            { tenantId: "tenant-a", modifierGroupId: "g1", sortOrder: 0 },
            { tenantId: "tenant-a", modifierGroupId: "g2", sortOrder: 1 }
          ]
        }
      },
      include: { modifierGroups: { orderBy: { sortOrder: "asc" } } }
    });
  });

  it("update replaces modifierGroup joins when modifierGroupIds is provided", async () => {
    prisma.menuItem.findFirst.mockResolvedValue(sampleItemRow());
    prisma.modifierGroup.findMany.mockResolvedValue([{ id: "g3" }]);
    prisma.menuItem.update.mockResolvedValue(sampleItemRow());
    await service.update("i1", { modifierGroupIds: ["g3"] });
    expect(prisma.menuItemModifierGroup.deleteMany).toHaveBeenCalledWith({
      where: { menuItemId: "i1", tenantId: "tenant-a" }
    });
    expect(prisma.menuItemModifierGroup.createMany).toHaveBeenCalledWith({
      data: [{ menuItemId: "i1", modifierGroupId: "g3", tenantId: "tenant-a", sortOrder: 0 }]
    });
  });

  it("update throws NotFoundException for cross-tenant item", async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);
    await expect(service.update("i-other", { name: "x" })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("softDelete sets isActive=false scoped by tenant", async () => {
    prisma.menuItem.updateMany.mockResolvedValue({ count: 1 });
    await service.softDelete("i1");
    expect(prisma.menuItem.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", tenantId: "tenant-a" },
      data: { isActive: false }
    });
  });

  it("softDelete throws NotFoundException when count is 0", async () => {
    prisma.menuItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.softDelete("i-none")).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=items.service.spec
```

Expected: FAIL with `Cannot find module './items.service'`.

- [ ] **Step 3: Implement `items.service.ts`**

Write `apps/api/src/menu/items/items.service.ts`:
```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantService } from "../../tenant/tenant.service";
import type {
  CreateMenuItemRequest,
  UpdateMenuItemRequest
} from "@pos/contracts";

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService
  ) {}

  async findAll(filter: { categoryId?: string }) {
    const tenantId = this.tenant.getTenantId();
    return this.prisma.menuItem.findMany({
      where: {
        tenantId,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {})
      },
      include: { modifierGroups: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async create(input: CreateMenuItemRequest) {
    const tenantId = this.tenant.getTenantId();
    await this.assertCategoryBelongsToTenant(input.categoryId, tenantId);
    await this.assertModifierGroupsBelongToTenant(input.modifierGroupIds, tenantId);

    return this.prisma.menuItem.create({
      data: {
        tenantId,
        categoryId: input.categoryId,
        name: input.name,
        basePrice: input.basePrice,
        imageUrl: input.imageUrl ?? null,
        sortOrder: input.sortOrder,
        modifierGroups: {
          create: input.modifierGroupIds.map((modifierGroupId, idx) => ({
            tenantId,
            modifierGroupId,
            sortOrder: idx
          }))
        }
      },
      include: { modifierGroups: { orderBy: { sortOrder: "asc" } } }
    });
  }

  async update(id: string, input: UpdateMenuItemRequest) {
    const tenantId = this.tenant.getTenantId();
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      throw new NotFoundException("Menu item not found");
    }
    if (input.categoryId) {
      await this.assertCategoryBelongsToTenant(input.categoryId, tenantId);
    }
    if (input.modifierGroupIds !== undefined) {
      await this.assertModifierGroupsBelongToTenant(input.modifierGroupIds, tenantId);
    }
    const { modifierGroupIds, ...rest } = input;

    return this.prisma.$transaction(async (tx) => {
      if (modifierGroupIds !== undefined) {
        await tx.menuItemModifierGroup.deleteMany({
          where: { menuItemId: id, tenantId }
        });
        await tx.menuItemModifierGroup.createMany({
          data: modifierGroupIds.map((modifierGroupId, idx) => ({
            menuItemId: id,
            modifierGroupId,
            tenantId,
            sortOrder: idx
          }))
        });
      }
      return tx.menuItem.update({
        where: { id },
        data: rest,
        include: { modifierGroups: { orderBy: { sortOrder: "asc" } } }
      });
    });
  }

  async softDelete(id: string) {
    const tenantId = this.tenant.getTenantId();
    const result = await this.prisma.menuItem.updateMany({
      where: { id, tenantId },
      data: { isActive: false }
    });
    if (result.count === 0) {
      throw new NotFoundException("Menu item not found");
    }
  }

  private async assertCategoryBelongsToTenant(categoryId: string, tenantId: string) {
    const cat = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, tenantId }
    });
    if (!cat) {
      throw new BadRequestException("categoryId does not belong to this tenant");
    }
  }

  private async assertModifierGroupsBelongToTenant(ids: string[], tenantId: string) {
    if (ids.length === 0) return;
    const found = await this.prisma.modifierGroup.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true }
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        "One or more modifierGroupIds do not belong to this tenant"
      );
    }
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=items.service.spec
```

Expected: PASS, `8 passed`.

- [ ] **Step 5: Write the failing controller spec**

Write `apps/api/src/menu/items/items.controller.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";

describe("ItemsController", () => {
  let controller: ItemsController;
  let service: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };

  const stripJoins = (raw: { modifierGroups: { modifierGroupId: string }[] } & Record<string, unknown>) => ({
    ...raw,
    modifierGroupIds: raw.modifierGroups.map((m) => m.modifierGroupId)
  });

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: ItemsService, useValue: service }]
    }).compile();
    controller = moduleRef.get(ItemsController);
  });

  it("GET / flattens modifierGroups -> modifierGroupIds in response", async () => {
    const raw = {
      id: "i1",
      tenantId: "t",
      categoryId: "c",
      name: "x",
      basePrice: 1000,
      imageUrl: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      modifierGroups: [{ modifierGroupId: "g1", sortOrder: 0 }]
    };
    service.findAll.mockResolvedValue([raw]);
    const res = await controller.list();
    expect(res.data[0]?.modifierGroupIds).toEqual(["g1"]);
    expect(res.data[0]).not.toHaveProperty("modifierGroups");
  });

  it("GET / passes categoryId filter through", async () => {
    service.findAll.mockResolvedValue([]);
    await controller.list("11111111-1111-1111-1111-111111111111");
    expect(service.findAll).toHaveBeenCalledWith({
      categoryId: "11111111-1111-1111-1111-111111111111"
    });
  });

  it("POST / parses body and creates", async () => {
    const created = {
      id: "i2",
      modifierGroups: [{ modifierGroupId: "g1", sortOrder: 0 }]
    };
    service.create.mockResolvedValue(created);
    await controller.create({
      categoryId: "11111111-1111-1111-1111-111111111111",
      name: "Cafe",
      basePrice: 30000,
      sortOrder: 0,
      modifierGroupIds: ["22222222-2222-2222-2222-222222222222"]
    });
    expect(service.create).toHaveBeenCalled();
  });

  it("POST / rejects negative basePrice", async () => {
    await expect(
      controller.create({
        categoryId: "11111111-1111-1111-1111-111111111111",
        name: "x",
        basePrice: -1,
        sortOrder: 0,
        modifierGroupIds: []
      } as never)
    ).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("DELETE /:id calls softDelete", async () => {
    await controller.remove("11111111-1111-1111-1111-111111111111");
    expect(service.softDelete).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });
});
```

- [ ] **Step 6: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=items.controller.spec
```

Expected: FAIL.

- [ ] **Step 7: Implement `items.controller.ts`**

Write `apps/api/src/menu/items/items.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  CreateMenuItemRequestSchema,
  UpdateMenuItemRequestSchema,
  type CreateMenuItemRequest,
  type UpdateMenuItemRequest,
  type MenuItem,
  type MenuItemListResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { ItemsService } from "./items.service";

type ItemRowWithJoins = Record<string, unknown> & {
  modifierGroups: { modifierGroupId: string; sortOrder: number }[];
};

function toMenuItemDto(row: ItemRowWithJoins): MenuItem {
  const { modifierGroups, ...rest } = row;
  return {
    ...(rest as Omit<MenuItem, "modifierGroupIds">),
    modifierGroupIds: modifierGroups.map((m) => m.modifierGroupId)
  } as MenuItem;
}

@Controller("menu/items")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @Roles("OWNER", "CASHIER")
  async list(@Query("categoryId") categoryId?: string): Promise<MenuItemListResponse> {
    const data = await this.items.findAll({ categoryId });
    return { data: (data as ItemRowWithJoins[]).map(toMenuItemDto) };
  }

  @Post()
  @Roles("OWNER")
  async create(@Body() body: CreateMenuItemRequest) {
    const parsed = CreateMenuItemRequestSchema.parse(body);
    const row = (await this.items.create(parsed)) as ItemRowWithJoins;
    return toMenuItemDto(row);
  }

  @Patch(":id")
  @Roles("OWNER")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMenuItemRequest
  ) {
    const parsed = UpdateMenuItemRequestSchema.parse(body);
    const row = (await this.items.update(id, parsed)) as ItemRowWithJoins;
    return toMenuItemDto(row);
  }

  @Delete(":id")
  @Roles("OWNER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.items.softDelete(id);
  }
}
```

- [ ] **Step 8: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=items.controller.spec
```

Expected: PASS, `5 passed`.

- [ ] **Step 9: Wire into `menu.module.ts`**

Replace `apps/api/src/menu/menu.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";
import { ModifierGroupsController } from "./modifier-groups/modifier-groups.controller";
import { ModifierGroupsService } from "./modifier-groups/modifier-groups.service";
import { ItemsController } from "./items/items.controller";
import { ItemsService } from "./items/items.service";

@Module({
  controllers: [CategoriesController, ModifierGroupsController, ItemsController],
  providers: [CategoriesService, ModifierGroupsService, ItemsService]
})
export class MenuModule {}
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/menu
git commit -m "feat(api): add menu/items CRUD with modifier-group joins"
```

---

## Task 6: BE — R2 image upload (presigned PUT)

**Files:**
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Create: `apps/api/src/menu/uploads/uploads.service.ts`
- Create: `apps/api/src/menu/uploads/uploads.service.spec.ts`
- Create: `apps/api/src/menu/uploads/uploads.controller.ts`
- Create: `apps/api/src/menu/uploads/uploads.controller.spec.ts`
- Modify: `apps/api/src/menu/menu.module.ts`

> **Manual cloud step (do once now):** sign in to Cloudflare → R2. Create a bucket named `pos-menu` in the closest region. Under R2 → Manage API Tokens, create an Object-level token with read+write on `pos-menu` and copy the `Access Key ID` + `Secret Access Key`. Under bucket → Settings → Public Access, enable a public dev URL or attach a custom domain `cdn.<your-domain>` — record the resulting public URL prefix (e.g., `https://pub-xxxx.r2.dev`).

- [ ] **Step 1: Add AWS SDK to `apps/api/package.json`**

Edit `apps/api/package.json` — add to `dependencies`:
```json
"@aws-sdk/client-s3": "3.621.0",
"@aws-sdk/s3-request-presigner": "3.621.0",
```

Then:
```bash
pnpm install
```

- [ ] **Step 2: Add R2 vars to `.env.example`**

Edit `.env.example` — append:
```
# Cloudflare R2 (menu images)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=pos-menu
R2_PUBLIC_URL=https://pub-replace-me.r2.dev
```

- [ ] **Step 3: Write the failing service spec**

Write `apps/api/src/menu/uploads/uploads.service.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { TenantService } from "../../tenant/tenant.service";

const presignMock = jest.fn();
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => presignMock(...args)
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input }))
}));

describe("UploadsService", () => {
  let service: UploadsService;
  let tenant: { getTenantId: jest.Mock };
  const ORIG_ENV = { ...process.env };

  beforeEach(async () => {
    presignMock.mockReset();
    process.env = {
      ...ORIG_ENV,
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "pos-menu",
      R2_PUBLIC_URL: "https://pub-xyz.r2.dev"
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [UploadsService, { provide: TenantService, useValue: tenant }]
    }).compile();
    service = moduleRef.get(UploadsService);
  });

  afterAll(() => {
    process.env = ORIG_ENV;
  });

  it("returns a presigned URL with a tenant-scoped key", async () => {
    presignMock.mockResolvedValue("https://r2.example.com/put?sig=xyz");
    const result = await service.sign({ contentType: "image/png", contentLength: 1024 });
    expect(result.uploadUrl).toBe("https://r2.example.com/put?sig=xyz");
    expect(result.key).toMatch(/^tenants\/tenant-a\/menu\/[0-9a-f-]{36}\.png$/);
    expect(result.publicUrl).toBe(`https://pub-xyz.r2.dev/${result.key}`);
    expect(result.expiresInSeconds).toBe(300);
  });

  it("throws 503 when R2 env vars are missing", async () => {
    delete process.env.R2_ACCESS_KEY_ID;
    const moduleRef = await Test.createTestingModule({
      providers: [UploadsService, { provide: TenantService, useValue: tenant }]
    }).compile();
    const svc = moduleRef.get(UploadsService);
    await expect(
      svc.sign({ contentType: "image/png", contentLength: 1 })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
```

- [ ] **Step 4: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=uploads.service.spec
```

Expected: FAIL with `Cannot find module './uploads.service'`.

- [ ] **Step 5: Implement `uploads.service.ts`**

Write `apps/api/src/menu/uploads/uploads.service.ts`:
```ts
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TenantService } from "../../tenant/tenant.service";
import type { SignUploadRequest, SignUploadResponse } from "@pos/contracts";

const EXTENSION_FOR_CONTENT_TYPE: Record<SignUploadRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const EXPIRES_IN_SECONDS = 300;

@Injectable()
export class UploadsService {
  constructor(private readonly tenant: TenantService) {}

  async sign(input: SignUploadRequest): Promise<SignUploadResponse> {
    const config = this.readConfig();
    const tenantId = this.tenant.getTenantId();
    const ext = EXTENSION_FOR_CONTENT_TYPE[input.contentType];
    const key = `tenants/${tenantId}/menu/${randomUUID()}.${ext}`;

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: EXPIRES_IN_SECONDS
    });
    return {
      uploadUrl,
      publicUrl: `${config.publicUrl.replace(/\/$/, "")}/${key}`,
      key,
      expiresInSeconds: EXPIRES_IN_SECONDS
    };
  }

  private readConfig() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const publicUrl = process.env.R2_PUBLIC_URL;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      throw new ServiceUnavailableException(
        "R2 storage is not configured on this server"
      );
    }
    return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
  }
}
```

- [ ] **Step 6: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=uploads.service.spec
```

Expected: PASS, `2 passed`.

- [ ] **Step 7: Write the failing controller spec**

Write `apps/api/src/menu/uploads/uploads.controller.spec.ts`:
```ts
import { Test } from "@nestjs/testing";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

describe("UploadsController", () => {
  let controller: UploadsController;
  let service: { sign: jest.Mock };

  beforeEach(async () => {
    service = { sign: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: service }]
    }).compile();
    controller = moduleRef.get(UploadsController);
  });

  it("POST /sign returns the presigned response", async () => {
    service.sign.mockResolvedValue({
      uploadUrl: "https://x",
      publicUrl: "https://y",
      key: "k",
      expiresInSeconds: 300
    });
    const res = await controller.sign({ contentType: "image/png", contentLength: 1024 });
    expect(res.uploadUrl).toBe("https://x");
  });

  it("rejects content type other than image/jpeg|png|webp", async () => {
    await expect(
      controller.sign({ contentType: "application/pdf" as never, contentLength: 100 })
    ).rejects.toThrow();
    expect(service.sign).not.toHaveBeenCalled();
  });

  it("rejects when contentLength > 5 MB", async () => {
    await expect(
      controller.sign({ contentType: "image/png", contentLength: 6 * 1024 * 1024 } as never)
    ).rejects.toThrow();
    expect(service.sign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=uploads.controller.spec
```

Expected: FAIL with `Cannot find module './uploads.controller'`.

- [ ] **Step 9: Implement `uploads.controller.ts`**

Write `apps/api/src/menu/uploads/uploads.controller.ts`:
```ts
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  SignUploadRequestSchema,
  type SignUploadRequest,
  type SignUploadResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { UploadsService } from "./uploads.service";

@Controller("menu/uploads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("sign")
  @Roles("OWNER")
  async sign(@Body() body: SignUploadRequest): Promise<SignUploadResponse> {
    const parsed = SignUploadRequestSchema.parse(body);
    return this.uploads.sign(parsed);
  }
}
```

- [ ] **Step 10: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/api test --testPathPattern=uploads.controller.spec
```

Expected: PASS, `3 passed`.

- [ ] **Step 11: Wire into `menu.module.ts`**

Replace `apps/api/src/menu/menu.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";
import { ModifierGroupsController } from "./modifier-groups/modifier-groups.controller";
import { ModifierGroupsService } from "./modifier-groups/modifier-groups.service";
import { ItemsController } from "./items/items.controller";
import { ItemsService } from "./items/items.service";
import { UploadsController } from "./uploads/uploads.controller";
import { UploadsService } from "./uploads/uploads.service";

@Module({
  controllers: [
    CategoriesController,
    ModifierGroupsController,
    ItemsController,
    UploadsController
  ],
  providers: [CategoriesService, ModifierGroupsService, ItemsService, UploadsService]
})
export class MenuModule {}
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/package.json apps/api/src/menu .env.example pnpm-lock.yaml
git commit -m "feat(api): add R2 presigned upload endpoint for menu images"
```

---

## Task 7: BE — Menu tenant isolation integration test

**Files:**
- Create: `apps/api/src/menu/menu.isolation.int-spec.ts`

> Mirrors `tenant_isolation.spec` from Plan 2's mandate (spec §3 / §9). Uses Testcontainers (or a CI-provided Postgres via `DATABASE_URL`) and exercises the actual services with two tenant contexts.

- [ ] **Step 1: Write the failing integration test**

Write `apps/api/src/menu/menu.isolation.int-spec.ts`:
```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { CategoriesService } from "./categories/categories.service";
import { ItemsService } from "./items/items.service";
import { ModifierGroupsService } from "./modifier-groups/modifier-groups.service";

jest.setTimeout(180_000);

class StubTenantService implements Pick<TenantService, "getTenantId"> {
  current: string | null = null;
  getTenantId(): string {
    if (!this.current) throw new Error("no tenant");
    return this.current;
  }
}

describe("Menu module tenant isolation (integration)", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService;
  let tenantStub: StubTenantService;
  let categories: CategoriesService;
  let items: ItemsService;
  let modifiers: ModifierGroupsService;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    let connectionUri = process.env.DATABASE_URL;
    if (!connectionUri) {
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

    const a = await prisma.tenant.create({
      data: { name: "Tenant A", slug: `iso-a-${Date.now()}` }
    });
    const b = await prisma.tenant.create({
      data: { name: "Tenant B", slug: `iso-b-${Date.now()}` }
    });
    tenantA = a.id;
    tenantB = b.id;

    tenantStub = new StubTenantService();
    categories = new CategoriesService(prisma, tenantStub as unknown as TenantService);
    items = new ItemsService(prisma, tenantStub as unknown as TenantService);
    modifiers = new ModifierGroupsService(prisma, tenantStub as unknown as TenantService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (container) await container.stop();
  });

  it("findAll returns only the calling tenant's categories", async () => {
    tenantStub.current = tenantA;
    await categories.create({ name: "A-Cafe", sortOrder: 0 });
    tenantStub.current = tenantB;
    await categories.create({ name: "B-Tea", sortOrder: 0 });

    tenantStub.current = tenantA;
    const aRows = await categories.findAll();
    expect(aRows.map((r) => r.name)).toEqual(["A-Cafe"]);
    tenantStub.current = tenantB;
    const bRows = await categories.findAll();
    expect(bRows.map((r) => r.name)).toEqual(["B-Tea"]);
  });

  it("update on another tenant's category throws NotFoundException", async () => {
    tenantStub.current = tenantA;
    const aCat = await categories.create({ name: "A-Other", sortOrder: 0 });
    tenantStub.current = tenantB;
    await expect(categories.update(aCat.id, { name: "hijack" })).rejects.toBeInstanceOf(
      NotFoundException
    );
    tenantStub.current = tenantA;
    const stillA = await categories.findAll();
    expect(stillA.some((r) => r.id === aCat.id && r.name === "A-Other")).toBe(true);
  });

  it("creating a menu item with another tenant's categoryId is rejected", async () => {
    tenantStub.current = tenantA;
    const aCat = await categories.create({ name: "A-Items", sortOrder: 0 });

    tenantStub.current = tenantB;
    await expect(
      items.create({
        categoryId: aCat.id,
        name: "Cross",
        basePrice: 1000,
        sortOrder: 0,
        modifierGroupIds: []
      })
    ).rejects.toThrow(/categoryId/);
  });

  it("attaching another tenant's modifier group is rejected", async () => {
    tenantStub.current = tenantA;
    const aCat = await categories.create({ name: "A-WithMod", sortOrder: 0 });
    const aGroup = await modifiers.create({
      name: "Size",
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [{ name: "S", priceDelta: 0, isDefault: true, sortOrder: 0 }]
    });

    tenantStub.current = tenantB;
    const bCat = await categories.create({ name: "B-WithMod", sortOrder: 0 });
    await expect(
      items.create({
        categoryId: bCat.id,
        name: "Cross-mod",
        basePrice: 1000,
        sortOrder: 0,
        modifierGroupIds: [aGroup.id]
      })
    ).rejects.toThrow(/modifierGroupIds/);
  });
});
```

- [ ] **Step 2: Run the test against Testcontainers locally**

Run (Docker must be running):
```bash
pnpm --filter @pos/api test:int --testPathPattern=menu.isolation.int-spec
```

Expected: PASS, `4 passed` (first run takes ~60s for image pull).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/menu/menu.isolation.int-spec.ts
git commit -m "test(api): tenant isolation integration test for menu module"
```

---

## Task 8: Web — shadcn primitives + API client + providers (TDD)

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/api-client.spec.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`
- Create: `apps/web/src/components/ui/dialog.tsx`
- Create: `apps/web/src/components/ui/form.tsx`
- Create: `apps/web/src/components/ui/table.tsx`
- Create: `apps/web/src/providers/query-provider.tsx`
- Create: `apps/web/src/providers/auth-provider.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add web deps to `apps/web/package.json`**

Edit `apps/web/package.json` — add to `dependencies`:
```json
"@hookform/resolvers": "3.9.0",
"@radix-ui/react-dialog": "1.1.1",
"@radix-ui/react-label": "2.1.0",
"@radix-ui/react-slot": "1.1.0",
"@tanstack/react-query": "5.51.1",
"class-variance-authority": "0.7.0",
"clsx": "2.1.1",
"lucide-react": "0.408.0",
"react-hook-form": "7.52.1",
"sonner": "1.5.0",
"tailwind-merge": "2.4.0",
"tailwindcss-animate": "1.0.7"
```

Then:
```bash
pnpm install
```

- [ ] **Step 2: Update Tailwind config to enable shadcn token classes**

Replace `apps/web/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        input: "hsl(214 32% 91%)",
        ring: "hsl(222 84% 50%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222 47% 11%)",
        primary: {
          DEFAULT: "hsl(222 47% 11%)",
          foreground: "hsl(210 40% 98%)"
        },
        secondary: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222 47% 11%)"
        },
        destructive: {
          DEFAULT: "hsl(0 84% 60%)",
          foreground: "hsl(0 0% 100%)"
        },
        muted: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(215 16% 47%)"
        }
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem"
      }
    }
  },
  plugins: [animatePlugin]
};

export default config;
```

- [ ] **Step 3: Create `apps/web/src/lib/utils.ts`**

Write `apps/web/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
}
```

- [ ] **Step 4: Write the failing api-client spec**

Write `apps/web/src/lib/api-client.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { ApiClient, ApiError } from "./api-client";

describe("ApiClient", () => {
  const ResponseSchema = z.object({ ok: z.boolean() });
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new ApiClient({
      baseUrl: "https://api.test",
      getToken: () => "tok-xyz",
      fetch: fetchMock as unknown as typeof fetch
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches Authorization header when token is present", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await client.request("/x", { method: "GET", responseSchema: ResponseSchema });
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok-xyz");
  });

  it("Zod-validates the response body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const data = await client.request("/x", {
      method: "GET",
      responseSchema: ResponseSchema
    });
    expect(data).toEqual({ ok: true });
  });

  it("throws ApiError with status on non-2xx", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "nope" }), { status: 403 })
    );
    await expect(
      client.request("/x", { method: "GET", responseSchema: ResponseSchema })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns void on 204 even when responseSchema is provided", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const data = await client.request("/x", { method: "DELETE", responseSchema: ResponseSchema });
    expect(data).toBeUndefined();
  });

  it("posts JSON body with Content-Type header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await client.request("/x", {
      method: "POST",
      body: { hello: "world" },
      responseSchema: ResponseSchema
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ hello: "world" }));
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("ApiError carries server message when available", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "boom" }), { status: 500 })
    );
    try {
      await client.request("/x", { method: "GET", responseSchema: ResponseSchema });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain("boom");
    }
  });
});
```

- [ ] **Step 5: Run, confirm fail**

Run:
```bash
pnpm --filter @pos/web test
```

Expected: FAIL — `Cannot find module './api-client'` (other tests still pass).

- [ ] **Step 6: Implement `apps/web/src/lib/api-client.ts`**

Write `apps/web/src/lib/api-client.ts`:
```ts
import type { z } from "zod";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions<TResponse> {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  responseSchema: z.ZodType<TResponse>;
  searchParams?: Record<string, string | undefined>;
}

interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null;
  fetch?: typeof fetch;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ApiClientConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  async request<TResponse>(
    path: string,
    options: RequestOptions<TResponse>
  ): Promise<TResponse | undefined> {
    const url = new URL(path, this.config.baseUrl);
    if (options.searchParams) {
      for (const [k, v] of Object.entries(options.searchParams)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    const headers = new Headers();
    const token = this.config.getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("content-type", "application/json");

    const res = await this.fetchImpl(url.toString(), {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include"
    });

    if (res.status === 204) {
      return undefined;
    }
    if (!res.ok) {
      const text = await res.text();
      let message = `Request failed with status ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed?.message) message = `${message}: ${parsed.message}`;
      } catch {
        if (text) message = `${message}: ${text.slice(0, 200)}`;
      }
      throw new ApiError(res.status, message);
    }
    const json = await res.json();
    return options.responseSchema.parse(json);
  }
}
```

- [ ] **Step 7: Run, confirm pass**

Run:
```bash
pnpm --filter @pos/web test
```

Expected: PASS, all tests including the previous `env.spec`.

- [ ] **Step 8: Create the shadcn primitives**

Write `apps/web/src/components/ui/button.tsx`:
```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-secondary"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";
```

Write `apps/web/src/components/ui/input.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
```

Write `apps/web/src/components/ui/label.tsx`:
```tsx
"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-sm font-medium leading-none", className)}
    {...props}
  />
));
Label.displayName = "Label";
```

Write `apps/web/src/components/ui/dialog.tsx`:
```tsx
"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-4 flex flex-col space-y-1.5", className)} {...props} />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-4 flex justify-end gap-2", className)} {...props} />
);
```

Write `apps/web/src/components/ui/form.tsx`:
```tsx
"use client";
import * as React from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext
} from "react-hook-form";
import { Label } from "./label";
import { cn } from "@/lib/utils";

export const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>(
  props: ControllerProps<TFieldValues, TName>
) => (
  <FormFieldContext.Provider value={{ name: props.name }}>
    <Controller {...props} />
  </FormFieldContext.Provider>
);

export const FormItem = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-2", className)} {...props} />
);

export const FormLabel = ({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <Label className={cn(className)} {...props} />
);

export const FormControl = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const FormMessage = ({ className }: { className?: string }) => {
  const ctx = React.useContext(FormFieldContext);
  const { formState } = useFormContext();
  const error = ctx ? (formState.errors[ctx.name] as { message?: string } | undefined) : undefined;
  if (!error?.message) return null;
  return <p className={cn("text-sm text-destructive", className)}>{error.message}</p>;
};
```

Write `apps/web/src/components/ui/table.tsx`:
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

export const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("border-b bg-secondary/50", className)} {...props} />
);
export const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn(className)} {...props} />
);
export const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b transition-colors hover:bg-secondary/30", className)} {...props} />
);
export const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn("h-10 px-4 text-left align-middle font-medium text-muted-foreground", className)}
    {...props}
  />
);
export const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("p-4 align-middle", className)} {...props} />
);
```

- [ ] **Step 9: Create the providers**

Write `apps/web/src/providers/query-provider.tsx`:
```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 }
        }
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Write `apps/web/src/providers/auth-provider.tsx`:
```tsx
"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "OWNER" | "CASHIER";
  tenantId: string;
}

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (s: { accessToken: string; user: AuthUser }) => void;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const setSession = useCallback((s: { accessToken: string; user: AuthUser }) => {
    setAccessToken(s.accessToken);
    setUser(s.user);
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ accessToken, user, setSession, clear }),
    [accessToken, user, setSession, clear]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 10: Wire providers into root layout**

Replace `apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "POS Superpowers",
  description: "POS F&B SaaS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <QueryProvider>
            {children}
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 11: Typecheck the web app**

Run:
```bash
pnpm --filter @pos/web typecheck
```

Expected: `0 errors`. If you get errors about `next-env.d.ts`, run `pnpm --filter @pos/web dev` once and stop it (Ctrl+C) — Next.js generates the file on first start.

- [ ] **Step 12: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): shadcn primitives, api-client, query/auth providers"
```

---

## Task 9: Web — login page + admin layout (RequireRole(OWNER))

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(admin)/layout.tsx`
- Create: `apps/web/src/app/(admin)/admin/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/menu/layout.tsx`

> **Note:** Plan 2 produced the login API. This task adds the FE login page and the `/admin/*` route group. POS routes (`/pos/*`) are intentionally **not** in this plan — they land in Plan 4.

- [ ] **Step 1: Create the shared `apiClient` factory**

Write `apps/web/src/lib/api.ts`:
```ts
"use client";
import { useMemo } from "react";
import { ApiClient } from "./api-client";
import { loadPublicEnv } from "./env";
import { useAuth } from "@/providers/auth-provider";

export function useApiClient(): ApiClient {
  const { accessToken } = useAuth();
  return useMemo(() => {
    const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
    return new ApiClient({
      baseUrl: NEXT_PUBLIC_API_URL,
      getToken: () => accessToken
    });
  }, [accessToken]);
}
```

- [ ] **Step 2: Create the login page**

Write `apps/web/src/app/(auth)/login/page.tsx`:
```tsx
"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClient } from "@/lib/api-client";
import { loadPublicEnv } from "@/lib/env";
import { useAuth } from "@/providers/auth-provider";

const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    role: z.enum(["OWNER", "CASHIER"]),
    tenantId: z.string().uuid()
  })
});

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
      const client = new ApiClient({ baseUrl: NEXT_PUBLIC_API_URL, getToken: () => null });
      const result = await client.request("/auth/login", {
        method: "POST",
        body: { email, password },
        responseSchema: LoginResponseSchema
      });
      if (result) {
        setSession(result);
        if (result.user.role === "OWNER") {
          router.push("/admin/menu/categories");
        } else {
          toast.error("Tài khoản này không có quyền vào trang quản trị");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create the admin layout with role guard**

Write `apps/web/src/app/(admin)/layout.tsx`:
```tsx
"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/menu/categories", label: "Danh mục" },
  { href: "/admin/menu/modifiers", label: "Tuỳ chọn" },
  { href: "/admin/menu/items", label: "Món" }
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, clear } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "OWNER") {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user || user.role !== "OWNER") {
    return null;
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <Link href="/admin" className="text-lg font-semibold">
          POS Admin
        </Link>
        <nav className="flex gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                pathname.startsWith(n.href)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.fullName}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clear();
              router.push("/login");
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create the admin index page**

Write `apps/web/src/app/(admin)/admin/page.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/menu/categories");
  }, [router]);
  return null;
}
```

- [ ] **Step 5: Create the menu sub-layout (placeholder for nested ui)**

Write `apps/web/src/app/(admin)/admin/menu/layout.tsx`:
```tsx
import type { ReactNode } from "react";

export default function MenuSectionLayout({ children }: { children: ReactNode }) {
  return <section className="space-y-4">{children}</section>;
}
```

- [ ] **Step 6: Smoke test login flow**

Start the API:
```bash
pnpm dev:api
```

In a second terminal, seed a tenant + owner via the Plan 2 endpoint (replace `<ADMIN_KEY>` with the value from your local `.env`):
```bash
curl -s -X POST http://localhost:3001/admin/tenants \
  -H "X-Admin-Key: <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Cafe Pilot","slug":"cafe-pilot","ownerEmail":"owner@cafe.vn","ownerPassword":"secret123","ownerFullName":"Owner"}'
```

Expected: 201 with `{ tenant, user }`.

Start the web:
```bash
pnpm dev:web
```

Open http://localhost:3000/login. Sign in as `owner@cafe.vn` / `secret123`. Expected: redirect to `/admin/menu/categories` (page will render the layout chrome but no table yet — that's Task 10).

Stop both dev servers.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): login page and admin layout with role guard"
```

---

## Task 10: Web — Admin Categories page (CRUD)

**Files:**
- Create: `apps/web/src/features/menu/use-categories.ts`
- Create: `apps/web/src/app/(admin)/admin/menu/categories/page.tsx`

- [ ] **Step 1: Create the categories hook**

Write `apps/web/src/features/menu/use-categories.ts`:
```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MenuCategoryListResponseSchema,
  MenuCategorySchema,
  type CreateMenuCategoryRequest,
  type MenuCategory,
  type UpdateMenuCategoryRequest
} from "@pos/contracts";
import { useApiClient } from "@/lib/api";

const KEY = ["menu", "categories"] as const;

export function useCategoriesQuery() {
  const api = useApiClient();
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<MenuCategory[]> => {
      const res = await api.request("/menu/categories", {
        method: "GET",
        responseSchema: MenuCategoryListResponseSchema
      });
      return res?.data ?? [];
    }
  });
}

export function useCreateCategory() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMenuCategoryRequest) =>
      api.request("/menu/categories", {
        method: "POST",
        body: input,
        responseSchema: MenuCategorySchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useUpdateCategory() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMenuCategoryRequest }) =>
      api.request(`/menu/categories/${id}`, {
        method: "PATCH",
        body: input,
        responseSchema: MenuCategorySchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useDeleteCategory() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request(`/menu/categories/${id}`, {
        method: "DELETE",
        responseSchema: MenuCategorySchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
```

- [ ] **Step 2: Create the categories page**

Write `apps/web/src/app/(admin)/admin/menu/categories/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CreateMenuCategoryRequestSchema,
  type CreateMenuCategoryRequest,
  type MenuCategory
} from "@pos/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  useCategoriesQuery,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory
} from "@/features/menu/use-categories";

export default function CategoriesPage() {
  const { data, isLoading } = useCategoriesQuery();
  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = useDeleteCategory();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Danh mục</h1>
        <Button onClick={() => setCreating(true)}>+ Thêm danh mục</Button>
      </div>
      {isLoading ? (
        <p>Đang tải...</p>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead className="w-32">Thứ tự</TableHead>
                <TableHead className="w-32">Trạng thái</TableHead>
                <TableHead className="w-40 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Chưa có danh mục nào.
                  </TableCell>
                </TableRow>
              ) : null}
              {data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.sortOrder}</TableCell>
                  <TableCell>{c.isActive ? "Hoạt động" : "Tắt"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                      Sửa
                    </Button>
                    {c.isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          remove.mutate(c.id, {
                            onSuccess: () => toast.success("Đã ẩn danh mục"),
                            onError: (e) => toast.error(String(e))
                          })
                        }
                      >
                        Ẩn
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CategoryFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => setCreating(false)}
      />
      <CategoryFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        onSaved={() => setEditing(null)}
      />
    </div>
  );
}

function CategoryFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: MenuCategory | null;
  onSaved: () => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const form = useForm<CreateMenuCategoryRequest>({
    resolver: zodResolver(CreateMenuCategoryRequestSchema),
    values: { name: initial?.name ?? "", sortOrder: initial?.sortOrder ?? 0 }
  });

  async function onSubmit(values: CreateMenuCategoryRequest) {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, input: values });
        toast.success("Đã cập nhật");
      } else {
        await create.mutateAsync(values);
        toast.success("Đã tạo danh mục");
      }
      form.reset();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <span />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa danh mục" : "Thêm danh mục"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên danh mục</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Trà sữa" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thứ tự</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Smoke test categories CRUD**

Run:
```bash
pnpm dev:api
pnpm dev:web   # in another terminal
```

Open http://localhost:3000/login → log in as the owner from Task 9. You should land at `/admin/menu/categories`.

- Click "Thêm danh mục" → submit `{ name: "Trà sữa", sortOrder: 0 }` → row appears.
- Click "Sửa" → change name → save → row updates.
- Click "Ẩn" → row's status changes to "Tắt" and "Ẩn" button disappears.

Stop both dev servers.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): admin categories CRUD page"
```

---

## Task 11: Web — Admin Modifier Groups page (CRUD with inline options)

**Files:**
- Create: `apps/web/src/features/menu/use-modifier-groups.ts`
- Create: `apps/web/src/app/(admin)/admin/menu/modifiers/page.tsx`

- [ ] **Step 1: Create the modifier-groups hook**

Write `apps/web/src/features/menu/use-modifier-groups.ts`:
```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ModifierGroupListResponseSchema,
  ModifierGroupSchema,
  type CreateModifierGroupRequest,
  type ModifierGroup,
  type UpdateModifierGroupRequest
} from "@pos/contracts";
import { useApiClient } from "@/lib/api";

const KEY = ["menu", "modifier-groups"] as const;

export function useModifierGroupsQuery() {
  const api = useApiClient();
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ModifierGroup[]> => {
      const res = await api.request("/menu/modifier-groups", {
        method: "GET",
        responseSchema: ModifierGroupListResponseSchema
      });
      return res?.data ?? [];
    }
  });
}

export function useCreateModifierGroup() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateModifierGroupRequest) =>
      api.request("/menu/modifier-groups", {
        method: "POST",
        body: input,
        responseSchema: ModifierGroupSchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useUpdateModifierGroup() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateModifierGroupRequest }) =>
      api.request(`/menu/modifier-groups/${id}`, {
        method: "PATCH",
        body: input,
        responseSchema: ModifierGroupSchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useDeleteModifierGroup() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request(`/menu/modifier-groups/${id}`, {
        method: "DELETE",
        responseSchema: ModifierGroupSchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
```

- [ ] **Step 2: Create the modifiers page**

Write `apps/web/src/app/(admin)/admin/menu/modifiers/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CreateModifierGroupRequestSchema,
  type CreateModifierGroupRequest,
  type ModifierGroup
} from "@pos/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatVnd } from "@/lib/utils";
import {
  useCreateModifierGroup,
  useDeleteModifierGroup,
  useModifierGroupsQuery,
  useUpdateModifierGroup
} from "@/features/menu/use-modifier-groups";

export default function ModifiersPage() {
  const { data, isLoading } = useModifierGroupsQuery();
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = useDeleteModifierGroup();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tuỳ chọn (modifier)</h1>
        <Button onClick={() => setCreating(true)}>+ Thêm nhóm tuỳ chọn</Button>
      </div>
      {isLoading ? (
        <p>Đang tải...</p>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên nhóm</TableHead>
                <TableHead>Kiểu chọn</TableHead>
                <TableHead>Bắt buộc</TableHead>
                <TableHead>Tuỳ chọn</TableHead>
                <TableHead className="w-40 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Chưa có nhóm tuỳ chọn nào.
                  </TableCell>
                </TableRow>
              ) : null}
              {data?.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>
                    {g.selectionType === "SINGLE" ? "Chọn 1" : `Chọn ${g.minSelect}-${g.maxSelect}`}
                  </TableCell>
                  <TableCell>{g.isRequired ? "Có" : "Không"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {g.options
                      .map((o) => `${o.name}${o.priceDelta ? ` (+${formatVnd(o.priceDelta)})` : ""}`)
                      .join(", ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(g)}>
                      Sửa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        remove.mutate(g.id, {
                          onSuccess: () => toast.success("Đã xoá"),
                          onError: (e) => toast.error(String(e))
                        })
                      }
                    >
                      Xoá
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ModifierGroupFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => setCreating(false)}
      />
      <ModifierGroupFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        onSaved={() => setEditing(null)}
      />
    </div>
  );
}

function ModifierGroupFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ModifierGroup | null;
  onSaved: () => void;
}) {
  const create = useCreateModifierGroup();
  const update = useUpdateModifierGroup();
  const form = useForm<CreateModifierGroupRequest>({
    resolver: zodResolver(CreateModifierGroupRequestSchema),
    values: {
      name: initial?.name ?? "",
      selectionType: initial?.selectionType ?? "SINGLE",
      minSelect: initial?.minSelect ?? 0,
      maxSelect: initial?.maxSelect ?? 1,
      isRequired: initial?.isRequired ?? false,
      options:
        initial?.options.map((o) => ({
          name: o.name,
          priceDelta: o.priceDelta,
          isDefault: o.isDefault,
          sortOrder: o.sortOrder
        })) ?? [{ name: "", priceDelta: 0, isDefault: false, sortOrder: 0 }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "options" });

  async function onSubmit(values: CreateModifierGroupRequest) {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, input: values });
        toast.success("Đã cập nhật");
      } else {
        await create.mutateAsync(values);
        toast.success("Đã tạo nhóm tuỳ chọn");
      }
      form.reset();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa nhóm tuỳ chọn" : "Thêm nhóm tuỳ chọn"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên nhóm</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Size / Đường / Đá" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="selectionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kiểu chọn</FormLabel>
                    <FormControl>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        <option value="SINGLE">Single</option>
                        <option value="MULTIPLE">Multiple</option>
                      </select>
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minSelect"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxSelect"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="isRequired"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                  Bắt buộc chọn
                </label>
              )}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>Tuỳ chọn</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({ name: "", priceDelta: 0, isDefault: false, sortOrder: fields.length })
                  }
                >
                  + Thêm tuỳ chọn
                </Button>
              </div>
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 items-center gap-2">
                  <Input
                    className="col-span-5"
                    placeholder="Tên (vd: Size L)"
                    {...form.register(`options.${i}.name`)}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    placeholder="+ giá (đ)"
                    {...form.register(`options.${i}.priceDelta`, { valueAsNumber: true })}
                  />
                  <label className="col-span-3 flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      {...form.register(`options.${i}.isDefault`)}
                    />
                    Mặc định
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="col-span-1"
                    onClick={() => remove(i)}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <FormMessage />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Smoke test modifier groups CRUD**

Restart api + web (`pnpm dev:api`, `pnpm dev:web`). Log in, go to "Tuỳ chọn".

- Create a group "Size" / SINGLE / required, options `[S 0đ default, M +5000đ, L +10000đ]` → save. Row appears.
- Edit it: change M's priceDelta to 7000 → save → row reflects update.
- Try DELETE — succeeds because no menu items reference it yet.

Stop dev servers.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): admin modifier groups CRUD page"
```

---

## Task 12: Web — Admin Menu Items page (CRUD + image upload + modifier picker)

**Files:**
- Create: `apps/web/src/features/menu/use-items.ts`
- Create: `apps/web/src/features/menu/use-upload-image.ts`
- Create: `apps/web/src/app/(admin)/admin/menu/items/page.tsx`

- [ ] **Step 1: Create the items hook**

Write `apps/web/src/features/menu/use-items.ts`:
```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MenuItemListResponseSchema,
  MenuItemSchema,
  type CreateMenuItemRequest,
  type MenuItem,
  type UpdateMenuItemRequest
} from "@pos/contracts";
import { useApiClient } from "@/lib/api";

const KEY = ["menu", "items"] as const;

export function useItemsQuery(filter: { categoryId?: string } = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: async (): Promise<MenuItem[]> => {
      const res = await api.request("/menu/items", {
        method: "GET",
        searchParams: { categoryId: filter.categoryId },
        responseSchema: MenuItemListResponseSchema
      });
      return res?.data ?? [];
    }
  });
}

export function useCreateItem() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMenuItemRequest) =>
      api.request("/menu/items", {
        method: "POST",
        body: input,
        responseSchema: MenuItemSchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useUpdateItem() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMenuItemRequest }) =>
      api.request(`/menu/items/${id}`, {
        method: "PATCH",
        body: input,
        responseSchema: MenuItemSchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useDeleteItem() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request(`/menu/items/${id}`, {
        method: "DELETE",
        responseSchema: MenuItemSchema
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
```

- [ ] **Step 2: Create the upload hook**

Write `apps/web/src/features/menu/use-upload-image.ts`:
```ts
"use client";
import { useMutation } from "@tanstack/react-query";
import { SignUploadResponseSchema, type SignUploadRequest } from "@pos/contracts";
import { useApiClient } from "@/lib/api";

export function useUploadImage() {
  const api = useApiClient();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const contentType = file.type;
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        throw new Error("Chỉ chấp nhận JPG, PNG, WEBP");
      }
      const signed = await api.request("/menu/uploads/sign", {
        method: "POST",
        body: { contentType, contentLength: file.size } as SignUploadRequest,
        responseSchema: SignUploadResponseSchema
      });
      if (!signed) throw new Error("Không lấy được URL upload");
      const putRes = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file
      });
      if (!putRes.ok) {
        throw new Error(`Upload thất bại (${putRes.status})`);
      }
      return signed.publicUrl;
    }
  });
}
```

- [ ] **Step 3: Create the items page**

Write `apps/web/src/app/(admin)/admin/menu/items/page.tsx`:
```tsx
"use client";
import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CreateMenuItemRequestSchema,
  type CreateMenuItemRequest,
  type MenuItem
} from "@pos/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatVnd } from "@/lib/utils";
import { useCategoriesQuery } from "@/features/menu/use-categories";
import { useModifierGroupsQuery } from "@/features/menu/use-modifier-groups";
import {
  useCreateItem,
  useDeleteItem,
  useItemsQuery,
  useUpdateItem
} from "@/features/menu/use-items";
import { useUploadImage } from "@/features/menu/use-upload-image";

export default function ItemsPage() {
  const { data: categories } = useCategoriesQuery();
  const [filterCategoryId, setFilterCategoryId] = useState<string | undefined>(undefined);
  const { data: items, isLoading } = useItemsQuery({ categoryId: filterCategoryId });
  const remove = useDeleteItem();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Món</h1>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filterCategoryId ?? ""}
            onChange={(e) => setFilterCategoryId(e.target.value || undefined)}
          >
            <option value="">Tất cả danh mục</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setCreating(true)}>+ Thêm món</Button>
        </div>
      </div>
      {isLoading ? (
        <p>Đang tải...</p>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Ảnh</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Danh mục</TableHead>
                <TableHead className="w-32 text-right">Giá</TableHead>
                <TableHead className="w-24">Trạng thái</TableHead>
                <TableHead className="w-40 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Chưa có món nào.
                  </TableCell>
                </TableRow>
              ) : null}
              {items?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    {m.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt={m.name} className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-secondary" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{categoryName(m.categoryId)}</TableCell>
                  <TableCell className="text-right">{formatVnd(m.basePrice)}</TableCell>
                  <TableCell>{m.isActive ? "Bán" : "Tắt"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                      Sửa
                    </Button>
                    {m.isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          remove.mutate(m.id, {
                            onSuccess: () => toast.success("Đã ngừng bán"),
                            onError: (e) => toast.error(String(e))
                          })
                        }
                      >
                        Ngừng bán
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ItemFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => setCreating(false)}
      />
      <ItemFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        onSaved={() => setEditing(null)}
      />
    </div>
  );
}

function ItemFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: MenuItem | null;
  onSaved: () => void;
}) {
  const { data: categories } = useCategoriesQuery();
  const { data: modifierGroups } = useModifierGroupsQuery();
  const create = useCreateItem();
  const update = useUpdateItem();
  const upload = useUploadImage();

  const form = useForm<CreateMenuItemRequest>({
    resolver: zodResolver(CreateMenuItemRequestSchema),
    values: {
      categoryId: initial?.categoryId ?? "",
      name: initial?.name ?? "",
      basePrice: initial?.basePrice ?? 0,
      imageUrl: initial?.imageUrl ?? null,
      sortOrder: initial?.sortOrder ?? 0,
      modifierGroupIds: initial?.modifierGroupIds ?? []
    }
  });
  const imageUrl = form.watch("imageUrl");
  const selectedGroupIds = form.watch("modifierGroupIds");

  async function onSubmit(values: CreateMenuItemRequest) {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, input: values });
        toast.success("Đã cập nhật món");
      } else {
        await create.mutateAsync(values);
        toast.success("Đã tạo món");
      }
      form.reset();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await upload.mutateAsync(file);
      form.setValue("imageUrl", url);
      toast.success("Đã tải ảnh lên");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải ảnh thất bại");
    }
  }

  function toggleGroup(id: string) {
    const current = selectedGroupIds ?? [];
    form.setValue(
      "modifierGroupIds",
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa món" : "Thêm món"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên món</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Trà đào cam sả" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Danh mục</FormLabel>
                    <FormControl>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      >
                        <option value="">— chọn —</option>
                        {categories?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="basePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giá (đồng)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thứ tự</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <FormLabel>Ảnh</FormLabel>
              <div className="flex items-center gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="preview" className="h-20 w-20 rounded object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded bg-secondary" />
                )}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFile}
                  disabled={upload.isPending}
                />
              </div>
              {upload.isPending ? <p className="text-sm text-muted-foreground">Đang tải...</p> : null}
            </div>

            <div className="space-y-2">
              <FormLabel>Nhóm tuỳ chọn</FormLabel>
              <div className="flex flex-wrap gap-2">
                {modifierGroups?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có nhóm tuỳ chọn — tạo ở trang Tuỳ chọn trước.
                  </p>
                ) : null}
                {modifierGroups?.map((g) => {
                  const active = selectedGroupIds?.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-secondary"
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Smoke test full menu CRUD**

Pre-req: R2 env vars filled in your local `.env` (or skip the image step — uploads will return 503).

Restart dev servers and log in. Walk:

1. Categories page → ensure "Trà sữa" exists.
2. Tuỳ chọn page → ensure "Size" group exists with options.
3. Món page → click "+ Thêm món":
   - Name "Trà đào cam sả", category "Trà sữa", basePrice 45000.
   - (If R2 configured) pick a JPG file → preview appears.
   - Toggle the "Size" chip → it turns primary.
   - Submit → row appears in the table with image (or empty box) and category name.
4. Edit it → flip a different category → save → table reflects.
5. Filter by category dropdown → only matching rows shown.
6. "Ngừng bán" → row's status flips to "Tắt".

Stop dev servers.

- [ ] **Step 5: Run all unit + integration tests one more time**

Run:
```bash
pnpm typecheck
pnpm --filter @pos/api test --testPathPattern=spec.ts
pnpm --filter @pos/api test:int
pnpm --filter @pos/web test
pnpm --filter @pos/domain test
pnpm --filter @pos/contracts typecheck
```

Expected: every command exits 0.

- [ ] **Step 6: Commit + push**

```bash
git add apps/web/src
git commit -m "feat(web): admin menu items page with image upload + modifier picker"
git push -u origin HEAD
```

Open the PR. Verify CI's three jobs (`unit`, `integration`, `build`) go green. Merge to `main` only after green.

---

## Done check

After all 12 tasks, you should be able to demonstrate:

- [ ] `apps/api/prisma/schema.prisma` includes `MenuCategory`, `MenuItem`, `ModifierGroup`, `ModifierOption`, `MenuItemModifierGroup`, and `SelectionType`; migration `add_menu` is applied.
- [ ] `packages/contracts` exports Zod schemas for category, modifier, item, and upload DTOs; both API and web import them.
- [ ] `GET/POST/PATCH/DELETE /menu/categories` work (OWNER for write, OWNER+CASHIER for read), tenant-scoped.
- [ ] `GET/POST/PATCH/DELETE /menu/modifier-groups` work; nested options write atomically; DELETE 409s when attached to an item.
- [ ] `GET/POST/PATCH/DELETE /menu/items` work; cross-tenant `categoryId` or `modifierGroupId` returns 400.
- [ ] `POST /menu/uploads/sign` returns a presigned PUT URL when R2 env is set, 503 otherwise.
- [ ] `menu.isolation.int-spec.ts` passes against real Postgres in CI.
- [ ] Login at `/login` as OWNER routes to `/admin/menu/categories`; CASHIER login is rejected with a toast.
- [ ] `/admin/menu/categories`, `/admin/menu/modifiers`, `/admin/menu/items` all CRUD via the UI; toasts surface BE errors.
- [ ] Image upload from the items form pushes the file to R2 and the menu item picks up the public URL.
- [ ] `pnpm typecheck`, `pnpm --filter @pos/domain test`, `pnpm --filter @pos/api test --testPathPattern=spec.ts`, `pnpm --filter @pos/api test:int`, `pnpm --filter @pos/web test` all pass.
- [ ] CI is green on `main` (3 jobs).
- [ ] Cross-plan invariants still hold: `/health`, `/api/health` both 200, no `tenant_id` bypass, Sentry receives errors, no secrets committed.

If all 12 boxes tick, the menu module is shipped. Plan 4 (`pos-order-online`) starts here.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-menu-module.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
