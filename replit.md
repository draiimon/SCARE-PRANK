# Visitor Security Dashboard

A privacy-conscious visitor access monitor for understanding repeat visits and protecting a site without pretending an IP address proves a person's identity.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/visitor-security-dashboard` — public monitored site and owner dashboard
- `artifacts/api-server/src/routes/visitors.ts` — visit logging, dashboard, visitor detail, and block endpoints
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/db/src/schema/visitor-monitor.ts` — PostgreSQL tables for visits and blocked IPs

## Architecture decisions

- Public visits use a first-party anonymous browser ID; no attempt is made to identify a real person from an IP.
- Admin endpoints require the `x-admin-token` header, checked against `ADMIN_PASSWORD` or the existing `SESSION_SECRET`.
- The first build uses network-level fields available from the request and deliberately labels location as an estimate.

## Product

- Automatically records a monitored page visit with timestamp, IP, browser, OS, device, referrer, viewport, timezone, and language.
- Shows dashboard totals, daily activity, recent visits, searchable visitor profiles, and per-visitor history.
- Lets the owner block and unblock an IP address from future monitored visits.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
