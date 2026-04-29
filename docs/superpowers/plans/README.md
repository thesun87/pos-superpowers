# Plans Tracker — POS F&B SaaS MVP

Source spec: [`../specs/2026-04-27-pos-fnb-saas-mvp-design.md`](../specs/2026-04-27-pos-fnb-saas-mvp-design.md)

The spec covers an 8-week MVP. Per the `superpowers:writing-plans` scope check, it has been broken into 8 sequential plans — each producing working, testable software on its own.

## Status

Legend: `⬜ todo` · `🟨 in progress` · `✅ done` · `⏸ blocked`

| # | Plan | Spec week | Subsystem | Status | File |
|---|---|---|---|---|---|
| 1 | `foundation` | Week 1 | Monorepo + scaffolds + initial Prisma + Sentry + CI + deploy pipeline | ✅ written | [2026-04-27-foundation.md](./2026-04-27-foundation.md) |
| 2 | `auth-and-tenancy` | Week 2 | Login/refresh, JWT guard, tenant middleware, Prisma extension auto-injecting `tenant_id`, super-admin endpoint, `tenant_isolation.spec` | ✅ written | [2026-04-27-auth-tenancy.md](./2026-04-27-auth-tenancy.md) |
| 3 | `menu-module` | Week 3 | BE CRUD for categories/items/modifier groups + image upload (R2) + Admin UI tables/forms | ✅ written | [2026-04-29-menu-module.md](./2026-04-29-menu-module.md) |
| 4 | `pos-order-online` | Week 4 | POS 3-pane layout, modifier sheet, totals via `packages/domain`, optimistic create, online order submit, `window.print()` fallback | ⬜ todo | — |
| 5 | `offline-sync` | Week 5 | Dexie schemas, sync worker, idempotency BE+FE, 6 acceptance tests, error toasts | ⬜ todo | — |
| 6 | `escpos-printing` | Week 6 | WebUSB hook, ESC/POS template, hardware test on Xprinter XP-58, reprint, settings page | ⬜ todo | — |
| 7 | `reports` | Week 7 | 4 report screens, CSV export, dashboard auto-refresh, tenant-guard audit, bug fix sweep | ⬜ todo | — |
| 8 | `pilot-deploy` | Week 8 | Tenant onboarding script, on-site setup, training PDF, runbook, observation shift | ⬜ todo | — |

## Definition of "done" per plan

Each plan ships independently — its "done" criteria are the verification checks at the bottom of that plan's document. Do not start plan N+1 until plan N's done check is fully ticked.

## Cross-plan invariants

These must hold true at the end of every plan, not just at the end:

- All tests green on `main` (CI never red)
- Production API + Web URLs return 200 on `/health`
- No `tenant_id` query bypass introduced (audited each plan)
- Sentry receives errors from production
- No secrets committed (`.env` only via `.env.example` template)

## Guardrails (from spec §1)

- **End of Week 5** (after Plan 5): if offline sync is not stable, drop offline from MVP and ship as Approach A. Inform pilot stores in advance.
- **Anything outside the spec is out of scope.** Scope changes require a new spec.

## Out-of-scope (deferred to v1.1)

See spec §13. Notable: Customer/CRM, Branch/multi-store, Inventory, Promotion, Shift, KDS, e-invoice, refund tracking, self-serve signup, payment gateway, GrabFood/ShopeeFood integration, dark mode, i18n, mobile portrait POS, SSO/2FA, cash drawer, multi-printer.

## Workflow

1. Read this tracker before starting any new work.
2. Pick the lowest-numbered plan with status `⬜ todo`.
3. Execute that plan via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
4. When the plan's "Done check" is fully ticked, update the row above to ✅ and commit.
5. Move to the next plan only after CI is green on `main`.

## Revision log

| Date | Change |
|---|---|
| 2026-04-27 | Initial breakdown into 8 plans. Plan 1 (`foundation`) written. |
| 2026-04-27 | Plan 2 (`auth-and-tenancy`) written. |
| 2026-04-29 | Plan 3 (`menu-module`) written. |
