# Auth & Tenancy Implementation - Progress Tracker

> Last updated: 2026-04-29
> Worktree: `.claude/worktrees/auth-tenancy`
> Branch: `auth-tenancy`

## Progress

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| Task 1: Prisma schema - add User model + extend Tenant | ✅ Done | `89dd775` | User model, Role enum, login DTOs |
| Task 2: Auth module - login endpoint with JWT | ✅ Done | `a58887a` | AuthService, AuthController, JWT strategies |
| Task 3: JWT guard + tenant middleware + Prisma extension | ✅ Done | `3c8f602` | TenantService, Guards, Prisma extension |
| Task 4: Users module + tenant-scoped repository | 🔄 In Progress | — | — |
| Task 5: Super-admin endpoint for tenant onboarding | ⏳ Pending | — | — |
| Task 6: Tenant isolation integration test | ⏳ Pending | — | — |

## Current Task: Task 4 - Users Module

**Files needed:**
- `apps/api/src/users/users.module.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`

## Recent Commits

```
89dd775 feat(api): add User model with Role enum and login DTOs
a58887a feat(api): add auth module with login/refresh JWT endpoints
3c8f602 feat(api): add JWT guard, tenant middleware, tenant isolation
```

## Verification Commands

```bash
# Typecheck
pnpm --filter @pos/api typecheck

# Unit tests (spec.ts only)
pnpm --filter @pos/api test -- --testPathPattern=spec.ts

# Integration tests
pnpm --filter @pos/api test:int
```

## Done Check

After all 6 tasks, verify:
- [ ] `POST /auth/login` returns JWT tokens
- [ ] `POST /auth/refresh` issues new access tokens
- [ ] `POST /admin/tenants` creates tenant + owner
- [ ] `GET /users` returns only requesting tenant's users
- [ ] `@Roles('OWNER')` protects owner-only endpoints
- [ ] JWT access token: 15min (OWNER) or 2h (CASHIER)
- [ ] Refresh token in httpOnly cookie
- [ ] Tenant ID from JWT `tid` claim in AsyncLocalStorage
- [ ] `tenant_isolation.spec` documents cross-tenant guard