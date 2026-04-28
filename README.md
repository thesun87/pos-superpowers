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
