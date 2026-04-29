# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

POS F&B SaaS MVP — multi-tenant point-of-sale for Vietnamese cafés / trà sữa. The project is being built as 8 sequential weekly plans (see `docs/superpowers/plans/README.md`); each plan is independently shippable. The full design lives in `docs/superpowers/specs/2026-04-27-pos-fnb-saas-mvp-design.md` and is the source of truth — anything outside that spec is **out of scope**.

**Working language:** the spec, plans, and many comments are written in Vietnamese. Read them in that language; do not translate when committing.

## Commands

Always use `pnpm` (the package manager is pinned via `packageManager` in `package.json`). Node version is read from `.nvmrc`.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Run API (dev, watch) | `pnpm dev:api` — http://localhost:3001/health |
| Run web (dev) | `pnpm dev:web` — http://localhost:3000 |
| Build everything | `pnpm build` |
| Typecheck (all workspaces) | `pnpm typecheck` |
| Lint (all workspaces) | `pnpm lint` |
| Test (all workspaces) | `pnpm test` |

Per-workspace tests:

```bash
# API: unit (jest, *.spec.ts only)
pnpm --filter @pos/api test -- --testPathPattern=spec.ts

# API: integration (jest, *.int-spec.ts — needs running Postgres + DATABASE_URL)
pnpm --filter @pos/api test:int

# API: single test file
pnpm --filter @pos/api test -- src/health/health.controller.spec.ts

# Domain (vitest)
pnpm --filter @pos/domain test

# Web (vitest)
pnpm --filter @pos/web test
pnpm --filter @pos/web test:watch
```

Prisma (run from repo root):

```bash
pnpm --filter @pos/api prisma:generate          # regenerate client after schema change
pnpm --filter @pos/api prisma:migrate:dev       # create + apply a migration in dev
pnpm --filter @pos/api prisma:migrate:deploy    # apply pending migrations (CI / prod)
```

Local Postgres for integration tests:

```bash
docker run --rm -p 5432:5432 \
  -e POSTGRES_USER=pos -e POSTGRES_PASSWORD=pos -e POSTGRES_DB=pos \
  postgres:16-alpine
```

## Architecture

pnpm monorepo, TypeScript-strict end-to-end. Imports between workspaces resolve to source (`src/index.ts`) — there is no published build step for packages. `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride`.

```
apps/
  api/        NestJS 10 REST API (Node 20). Prisma client lives here.
  web/        Next.js 15 App Router PWA — both /pos and /admin in one app.
packages/
  contracts/  Zod schemas + inferred DTO types. Imported by BOTH api and web.
  domain/     Pure-TS business logic (Money, OrderCalc, ModifierApplier). No Nest, no React.
  ui/         Shared React components.
```

### Cross-cutting rules from the spec

These constraints are not optional — they're enforced (or will be) by tests and CI lint:

1. **Multi-tenancy is shared-schema, `tenant_id` column.** Every business table gets `tenant_id UUID NOT NULL` and a `(tenant_id, …)` composite index at the front. Tenant comes from JWT claim `tid`, propagated via `AsyncLocalStorage`, auto-injected by a Prisma extension. **Never** call `prisma.<model>.<op>` directly from feature code — always go through a repository that enforces the tenant guard. A CI lint rule for this is planned.
2. **Contracts are the source of truth for DTOs.** When changing a request/response shape, edit the Zod schema in `packages/contracts/src/` first, then update the API handler and the web consumer. Don't define ad-hoc types on either side.
3. **Domain logic stays in `packages/domain`.** Money math, totals, modifier application, VND rounding — all of it lives here as pure TS so it can be unit-tested without bootstrapping Nest. The web app imports the same code for optimistic-UI calculations.
4. **REST, not tRPC/GraphQL.** Plain HTTP + JWT bearer + Zod-validated bodies. Easier to replay when the PWA goes offline.
5. **Tenant isolation tests are mandatory.** For every new resource (Menu, Order, Payment, …), add an integration test asserting "tenant A cannot read or mutate tenant B's row."

### Module map (current state, Plan 1 done, Plan 2 in flight)

API — `apps/api/src/`:
- `main.ts` — bootstrap; initializes Sentry **before** anything else.
- `app.module.ts` — root module composition (`PrismaModule`, `HealthModule` so far).
- `prisma/` — `PrismaService` (extends `PrismaClient`, manages connect/disconnect lifecycle).
- `health/` — `/health` endpoint returning the contract from `@pos/contracts`. Also exposes `/debug-sentry` to verify error reporting.
- `sentry.ts` — single init point.

Web — `apps/web/src/`:
- `app/` — Next.js App Router. `app/api/health` is a Next-side health probe.
- `lib/env.ts` — Zod-validated `NEXT_PUBLIC_*` env loader. Use this pattern for any new public env.
- `sentry.{client,server}.config.ts`, `instrumentation.ts` — Sentry wiring.

Auth, tenants, menu, orders, payments, reports modules are **not yet built** — they land in Plans 2–7. Don't add them ad-hoc; check the plan file first.

### Plans-driven workflow

`docs/superpowers/plans/README.md` is the work tracker. Before starting any non-trivial change:

1. Read the tracker; pick the lowest-numbered `⬜ todo` plan.
2. Read that plan's file end-to-end before touching code.
3. Don't start plan N+1 until plan N's "Done check" is fully ticked **and** CI is green on `main`.

### Cross-plan invariants (must hold after every change)

- All tests green on `main`.
- API `/health` and Web `/api/health` return 200.
- No `tenant_id` query bypass introduced.
- Sentry receives errors from production.
- No secrets committed (only `.env.example`).

## Conventions worth knowing

- **Test file naming** is significant for the API: `*.spec.ts` = unit (run on every CI job), `*.int-spec.ts` = integration (needs Postgres, runs in the `integration` CI job). The two jest invocations filter by this suffix.
- **Jest module aliases** (`apps/api/jest.config.ts`) point `@pos/contracts` and `@pos/domain` at their `src/` directly — no build step in test runs.
- **Currency in MVP is VND only**; `currency` field on Tenant exists for forward-compat but assume VND in calculations and rounding.
- **Timezone default is `Asia/Ho_Chi_Minh`** on Tenant; use it when formatting timestamps for receipts and reports.
- **Two roles only:** `OWNER` and `CASHIER`. Don't introduce a permission system — `@Roles('OWNER')` decorator is enough.
- **Hosting target:** Render (API) + Vercel (web) + Neon Postgres + Cloudflare R2 (menu images). Build steps must work in those environments.
