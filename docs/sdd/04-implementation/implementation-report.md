# Implementation Report

## TASK-001 — Workspace & Quality Foundation

- **Status:** `PASS` — implementer checks and independent review passed.
- **Requirements / ACs:** REQ-ERROR-001 (AC-ERROR-001-01–04), REQ-QUALITY-001 (AC-QUALITY-001-01–03), REQ-QUALITY-002 (AC-QUALITY-002-01–05).
- **Dependencies:** none; Task Decomposition verification is PASS.

### Files changed

- Root workspace/tooling: `package.json`, `package-lock.json`, `.nvmrc`, TypeScript, ESLint, Prettier, Vitest, Playwright, and git/environment configuration.
- Shared contracts: `packages/contracts/**`.
- API foundation: `apps/api/**` (runtime config, safe errors, Fastify app/startup, tests).
- Web foundation: `apps/web/**` (Vite React shell, test setup, smoke test).
- E2E harness: `playwright.config.ts`, `tests/e2e/.gitkeep`.

### Implementation summary

Established the approved npm workspace with Node 22.12+ engine target, strict TypeScript, Fastify/Zod/React/Vite foundations, root quality commands, runtime configuration parsing, allowlisted error contracts, safe Fastify unexpected-error mapping, and minimal API/web startup compositions. No business entity, migration, authentication, catalog, cart, order, deployment, or external integration was implemented.

### Tests added

- Shared-contract schema/error tests: 2 assertions.
- API config/error/health tests: 5 assertions.
- Web shell smoke test: 1 assertion.
- Playwright browser smoke test: 1 passing test; future tasks add the critical-flow coverage.

### Commands executed

| Command | Result |
| --- | --- |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:unit` | PASS — 2 tests |
| `npm run test:api` | PASS — 5 tests |
| `npm run test:web` | PASS — 1 test |
| `npm run test:e2e` | PASS — 1 Playwright browser smoke test |
| `npm run build` | PASS |
| `npm audit --omit=dev --json` | PASS — 0 vulnerabilities |
| Node 22.12 direct format/lint/typecheck/test run | PASS |
| Node 22.12 contracts/API/web build | PASS |

### Review result

PASS — initial review found two HIGH issues (empty-pass E2E and caller-controlled controlled-error output); both were remediated and the focused re-review passed.

### Known limitations

The workstation default is Node 26.1.0, while the application engine is pinned to Node 22.12+ `<23`. All foundation checks were additionally executed with transient Node 22.12.0. A local PostgreSQL service is not required until TASK-002.
## TASK-002 - Database & Persistence Foundation

- **Status:** `PASS` - migration, disposable-database integration tests, static gates, and independent review passed.
- **Requirements / ACs:** persistence foundation enabling REQ-AUTH-001/002, REQ-USER-001, REQ-CATEGORY-001/002, REQ-PRODUCT-001/002, REQ-INVENTORY-001, REQ-CART-001/002, REQ-ORDER-001/002/003, REQ-SEC-001/002, and REQ-QUALITY-001/002. No business AC is marked complete until its owning task passes.
- **Dependencies:** TASK-001 `PASS`.

### Files changed

- Persistence model and initial migration: `prisma/schema.prisma`, `prisma/migrations/20260913134652_init/migration.sql`.
- API persistence boundary: `apps/api/src/db/**`.
- Test configuration and environment documentation: `vitest.api.config.ts`, `vitest.db.config.ts`, `.env.example`, package scripts/dependency lockfiles.

### Implementation summary

Added PostgreSQL/Prisma persistence for all approved entities, UUID/timestamptz conventions, HMAC-only binary token/key fields, FK lifecycle rules, normalized email/category checks, integer USD-minor money, non-negative stock and versions, immutable-order invariants, idempotency-state consistency, and required functional/partial/list indexes. Added transaction helper, safe persistence-failure classification, owner-bound/bounded repositories, parameter-bound active Product search, and guarded test cleanup that accepts only `TEST_DATABASE_URL` targets ending in `_test` and verifies the live database identity before deletion. No routes, services, or domain workflows were introduced.

### Tests added / updated

- Disposable PostgreSQL integration suite: 6 passing tests covering constraints, lifecycle/FKs, money/quantity/cart uniqueness, snapshots/idempotency, bounded owner search/listing, Product name/description search, and rollback.
- Test-database guard unit coverage: 2 assertions for explicit `_test` URL validation.

### Commands executed

| Command | Result |
| --- | --- |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS - unit 2, API 8, web 1 |
| `npm run test:db` | PASS - 6 PostgreSQL integration tests |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS - 1 Playwright browser smoke test |
| `npx prisma validate` / `npx prisma migrate status` | PASS - schema valid; initial migration applied/up to date on `ecommerce_test` |
| `npm audit --omit=dev --json` | PASS - 0 vulnerabilities |
| Node 22.12 direct typecheck/database test/generate/web build | PASS |
| `git diff --check` | PASS |

### Review result

PASS - independent review identified three HIGH findings (missing Order audit timestamps, unsafe test cleanup URL, unbounded order list) and one MEDIUM gap (missing parameter-bound Product search). All were remediated and focused re-review passed with no unresolved BLOCKER/HIGH/MEDIUM finding.

### Known limitations

The temporary `ecommerce_test` PostgreSQL container was removed after verification. Runtime database configuration and all business endpoints remain intentionally deferred to their approved owning tasks.

## TASK-003 through TASK-007 — Business MVP Implementation Handoff

- **Status:** `IN PROGRESS` — source implementation is present; required database-backed and critical-flow verification is pending.
- **Scope:** TASK-003 authentication/profile/authorization; TASK-004 catalog/category/product/inventory; TASK-005 cart/checkout/order/Admin order operations; TASK-006 public/auth shopping UI; TASK-007 customer transactional/profile/Admin UI.
- **Dependencies:** TASK-001 and TASK-002 remain `PASS`; implementation consumes the approved Prisma schema and API/UI contracts.

| Task | Implementation | Verification gate |
| --- | --- | --- |
| TASK-003 | Present | BLOCKED — DB/API negative and ownership evidence pending |
| TASK-004 | Present | BLOCKED — disposable PostgreSQL catalog/lifecycle evidence pending |
| TASK-005 | Present | BLOCKED — transaction/concurrency/idempotency evidence pending |
| TASK-006 | Present | BLOCKED — responsive/accessibility and API-backed E2E evidence pending |
| TASK-007 | Present | BLOCKED — Customer/Admin integration E2E evidence pending |

### Main implementation areas

- `apps/api/src/auth/**`, `apps/api/src/http/**`: Argon2id credentials, opaque HMAC-backed sessions, cookie lifecycle, role/origin guards, safe profile DTOs, bounded input parsing, and controlled Admin provisioning.
- `apps/api/src/catalog/**`: active public catalog, normalized category lifecycle, product search/filter/pagination, and Admin inventory management.
- `apps/api/src/commerce/**`: owner-scoped carts, versioned mutations, transactional checkout with row locking, stock decrement, immutable order snapshots, idempotency replay/conflict handling, customer history, and Admin status transitions.
- `apps/web/src/api.ts`, `apps/web/src/ui.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`: credentialed API client, query-managed routing, public/customer/Admin pages, loading/empty/error/pending states, responsive layout, confirmations, and accessible form error associations.
- Runtime integration: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `.env.example`, `apps/web/vite.config.ts`, `playwright.config.ts`, and the additive category-normalization migration.
- Test coverage: `apps/api/src/db/mvp.integration.test.ts`, `tests/e2e/critical.spec.ts`, and [test design](./test-design.md) covering real database/API and critical browser journeys.

### Verification handoff

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| `npm run format:check` | PASS | Node 22.12.0 |
| `npm run lint` | PASS | Node 22.12.0 |
| `npm run typecheck` | PASS | Node 22.12.0 |
| `npm test` | PASS | 2 unit, 13 API, 6 web tests |
| `npm run build` | PASS | Prisma generate, contracts, API, and web build |
| `npm run test:e2e` | PASS (smoke only) | 1 shell test passed, 2 critical + 6 responsive tests skipped because required E2E environment was absent; smoke API calls logged `ECONNREFUSED 127.0.0.1:3000` |
| `NODE_ENV=test TEST_DATABASE_URL=... npm run test:db` | BLOCKED | With a valid `_test` URL, PostgreSQL is unavailable at `127.0.0.1:5432`; 2 suites / 12 integration tests skipped after connection failure |
| `prisma validate` | PASS | Valid schema with non-production `_test` URL |
| `npm audit --omit=dev --json` | PASS | 0 vulnerabilities |
| `git diff --check` | PASS | No whitespace errors |

The source-level review and static gates do not replace disposable-PostgreSQL evidence. TASK-003 through TASK-007 and TASK-008 must remain below `PASS` until DB-backed API/concurrency tests and real Customer/Admin E2E flows run successfully.

## Remediation implementation — 2026-09-16

The post-review remediation added root `.env` loading for API startup/Admin provisioning, root Vite environment discovery, a local PostgreSQL Compose definition with a separate test database, a safe test-database migration command, documented local startup, database readiness, and fail-closed test commands. Registration now creates the Customer and empty Cart in one nested persistence write. The PostgreSQL integration fixture no longer violates the category canonicalization constraint, and it now verifies registration Cart creation and duplicate-registration non-mutation. Critical/responsive E2E suites no longer skip when configuration is absent; only the explicitly named shell smoke test is runnable without an API.

Verification remains blocked by the workstation database environment; see the remediation update in [implementation verification](./verification.md).

## Remediation follow-up — Admin, order, pagination, price and operational hardening

- **Status:** `IN PROGRESS` — source and non-database verification are present; the new cleanup-index migration and API-backed acceptance still require PostgreSQL.
- **Scope:** the approved remediation items for Admin category/product editing, Customer/Admin order detail, frontend pagination, decimal price validation, safe pagination arithmetic, Admin provisioning semantics, and expired-record cleanup.

### Implemented

- Admin can rename a Category and edit a Product's name, description, USD price, and active target Category. The product form preserves an inactive current Category unless the Admin deliberately changes it.
- Customer order detail now presents immutable product identity, unit price, quantity, subtotal, total, and placed/processing/completed dates. Admin order detail additionally presents customer identity and advances the allowed next status.
- Customer orders plus Admin orders, categories, products, and inventory use URL-backed pageable collection calls. The shared pager retains a Previous path when a manually supplied URL page is out of range.
- USD price input is parsed as decimal text to integer minor units; zero, scientific notation, unsafe values, and more than two decimal places are rejected rather than rounded.
- Page and page-size validation now require safe integers, and Order services verify the calculated Prisma offset before querying.
- One-shot Admin provisioning compares an operator-supplied token against a configured SHA-256 digest using a timing-safe comparison. The raw token is no longer a configuration value that is merely checked for presence.
- `cleanup:expired` deletes expired sessions in one transaction and deletes completed checkout idempotency rows only when an explicit retention duration is configured. The additive migration adds the supporting `(state, completed_at)` index; it does not alter or delete existing records.
- The follow-up migration removes the redundant pre-trim category unique index; the canonical trimmed/case-folded unique index remains authoritative.

### Compatibility and recovery

- Existing API request and response contracts are unchanged; the new frontend uses existing `PATCH` contracts and page parameters.
- Applying the cleanup-index migration is additive. If an index rollback is required, drop only `checkout_idempotencies_state_completed_cleanup_idx`; no application data migration or backfill is needed.
- Applying the duplicate-index cleanup is metadata-only. Recovery is to recreate `categories_name_normalized_key` with `lower(name)` if rollback is required; the canonical `categories_normalized_name_key` is never removed.
- The cleanup command never deletes Orders, Users, Cart records, active Sessions, or idempotency rows unless they are `COMPLETED`, have a completion date, and are older than the configured retention.

### Remaining scope requiring product/infrastructure decisions

Production-grade distributed login rate limiting, metrics backend/alerting, database backup destination and recovery objective, HTTPS/reverse-proxy/domain configuration, and password-reset email delivery remain unimplemented because the approved MVP has no deployment topology, retention/RPO-RTO, provider, or email-origin decisions for them.
