# Shoebill AI

A low-cost, universal prototype for small-to-mid-sized warehouses to coordinate
audits, inventory, packaging, loading, and supplier-client communication on one
shared, role-aware surface.

## Architecture

This is a **pnpm monorepo** with three artifacts plus shared libraries.

### Artifacts
- **`artifacts/warehouse-hub`** (`web`, served at `/`) — React + Vite + Tailwind
  + shadcn/ui + wouter + TanStack Query frontend.
- **`artifacts/api-server`** (`api`, served at `/api`) — Express 5 + Pino HTTP
  + Drizzle ORM + Postgres backend with cookie-session auth.
- **`artifacts/mockup-sandbox`** — design canvas sandbox (unchanged from
  template; not used by the product).

### Shared libraries
- **`lib/api-spec`** — OpenAPI 3 spec at `lib/api-spec/openapi.yaml`. Run
  `pnpm --filter @workspace/api-spec run codegen` after editing it; this
  regenerates `lib/api-client-react` (orval) and `lib/api-zod`.
- **`lib/api-client-react`** — Generated TanStack Query hooks consumed by the
  frontend. `custom-fetch.ts` already includes `credentials: "include"` so
  session cookies travel on every request.
- **`lib/api-zod`** — Generated Zod request/response validators.
- **`lib/db`** — Drizzle schema + Postgres client. Tables: `users`,
  `clients`, `suppliers`, `warehouses`, `inventory_items`, `packaging_specs`,
  `item_notes`, `audit_logs`, `compliance_flags`, `integrations`, `sync_jobs`,
  `dock_slots`, `slot_reservations`.
  Run `pnpm --filter @workspace/db run push` to sync schema.

## Roles & data scoping

Five roles, enforced server-side by `lib/visibility.ts`:

| Role               | Inventory scope                              | Note visibilities they can see                                              | Note visibilities they can post      | Edit inventory/packaging |
|--------------------|----------------------------------------------|-----------------------------------------------------------------------------|---------------------------------------|--------------------------|
| `admin`            | All                                          | shared, client_visible, supplier_visible, warehouse_internal, admin_only    | All five                              | Yes                      |
| `warehouse_manager`| All                                          | shared, client_visible, supplier_visible, warehouse_internal                | Same                                  | Yes                      |
| `supplier`         | Items where `supplier_id` matches their user | shared, supplier_visible                                                    | shared, supplier_visible              | No                       |
| `client`           | Items where `client_id` matches their user   | shared, client_visible                                                      | shared, client_visible                | No                       |
| `auditor`          | All (read)                                   | All visibilities (read-only)                                                | None                                  | No                       |

## Demo accounts

Password is `demo` for everyone.

| Username     | Display name              | Role               | Scope       |
|--------------|---------------------------|--------------------|-------------|
| `admin`      | Avery Park                | admin              | global      |
| `manager`    | Morgan Vega               | warehouse_manager  | East Hub    |
| `acme`       | Sasha Lin (Acme)          | supplier           | Acme        |
| `northstar`  | Devon Cole (Northstar)    | supplier           | Northstar   |
| `globex`     | Riley Mendes (Globex)     | client             | Globex      |
| `initech`    | Jordan Ahmed (Initech)    | client             | Initech     |
| `auditor`    | Quinn Rivers              | auditor            | global      |

The seed script also loads 15 inventory items spanning Q1–Q4 2026 across both
warehouses, both suppliers, and both clients, with a mix of statuses
(`Available`, `PendingSupplier`, `PendingClient`, `PendingWarehouse`,
`ReadyForPicking`, `ReadyForPacking`, `ReadyForStaging`, `ReadyForLoading`,
`ReadyForShipment`, `Shipped`, `Backordered`, `Delayed`, `Closed`). Several
items have intentionally incomplete packaging specs so the exception engine
generates real, varied flags.

## Backend specifics

- **Auth**: cookie-session via `express-session` using `SESSION_SECRET`.
  Sessions are signed and 8h-rolling, `httpOnly`, `sameSite=lax`.
- **Audit log**: every mutation writes to `audit_logs` with actor info,
  category, field, old/new values via `lib/audit.ts`.
- **Exception engine**: `lib/exceptions.ts` derives compliance flags from
  inventory + packaging state — below-reorder, missing dimensions/weight,
  fragile-without-handling, hazmat-without-compliance, ready-without-carrier,
  ASN-required-but-missing, etc. Re-runs on every item or packaging mutation
  and on every sync.
- **Hourly sync simulator**: `lib/sync.ts` schedules a `setInterval` that
  iterates all integrations (mock SAP / Manhattan / AWS / Tableau), records a
  `sync_jobs` row, recomputes flags, and updates `lastSyncAt` / `nextSyncAt`.
- **Tableau export**: `GET /api/export/inventory.csv` streams a denormalized
  CSV (inventory + packaging + flag count + warehouse/supplier/client names),
  scoped by the caller's role.
- **Capacity planner**: recurring `dock_slots` (per warehouse × weekday × time
  range × pallet capacity) plus `slot_reservations` (per ISO-week Monday).
  `GET /api/capacity/board` returns the week grid with per-slot pallet usage.
  Suppliers can request reservations (`status=planned`); admin/manager create
  them as `confirmed` directly and can confirm/cancel supplier requests.
  Capacity is enforced server-side — over-booking returns 409 with details.
  Suppliers can only reserve against their own items; clients are read-only.
  The seeder (`seedCapacityIfEmpty`) runs at server startup and is idempotent.
- **Shipment manifest**: `GET /api/capacity/reservations/:id/manifest` returns
  a denormalized manifest payload (reservation + slot + warehouse + supplier +
  client + item + packaging spec + open compliance flags) plus a generated
  manifest number, scheduled date, barcode payload, and audit entry.
  Frontend page `/manifest/:id` renders a print-friendly letter-size document
  with handling badges (HAZMAT, FRAGILE, etc.), packaging dimensions, a
  pseudo-barcode canvas, and signature blocks. A "Manifest" icon appears on
  every confirmed reservation in the Capacity Planner.

## Common tasks

- Edit API contract → `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen`.
- Edit DB schema → `lib/db/src/schema/*.ts`, then
  `pnpm --filter @workspace/db run push`.
- Restart backend → restart workflow `artifacts/api-server: API Server`.
- Restart frontend → restart workflow `artifacts/warehouse-hub: web`.
- Reseed: drop the `users` table (or all tables) and restart the API server;
  the seed script is no-op when users already exist.

## Environment

- `DATABASE_URL` — provisioned Replit Postgres.
- `SESSION_SECRET` — already set; used to sign session cookies.
- `PORT`, `BASE_PATH` — injected per artifact by the platform.
