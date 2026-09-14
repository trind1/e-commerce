# MVP Test Design

## Coverage strategy

The approved contracts require real PostgreSQL verification for persistence, transactions, concurrency, idempotency, ownership, and lifecycle behavior. The API integration suite uses the real Prisma client and Fastify app against `TEST_DATABASE_URL`; it does not mock persistence or successful business outcomes. The Playwright suite uses the real web client and API proxy. Admin credentials must be provisioned through the approved one-shot command before API-backed E2E execution.

## Execution prerequisites

Use a disposable database whose name ends in `_test`, apply the approved migrations, and set `TEST_DATABASE_URL` for `npm run test:db`. For critical E2E, set `E2E_DATABASE_URL`, `E2E_SESSION_HMAC_SECRET`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD`; provision the Admin through `npm run provision:admin` using the required controlled environment variables. Never reuse production credentials or a production database.

## Test matrix

| Test | Level | Behavior and observable outcome | Requirement / task |
| --- | --- | --- | --- |
| Registers customer, renews idle session, serves active catalog | API/integration | Normalized profile, rotated session digest/cookie, old cookie rejection, active public DTO without stock quantity | REQ-AUTH-001/002, REQ-USER-001, REQ-PRODUCT-001, REQ-SEC-001/002; TASK-003/004 |
| Enforces catalog lifecycle and Admin controls | API/integration | Duplicate category conflict, inactive-category rejection, product creation, inventory update, out-of-stock visibility, deactivated product hidden publicly | REQ-CATEGORY-001/002, REQ-PRODUCT-001/002, REQ-INVENTORY-001, REQ-ADMIN-001; TASK-004/007 |
| Merges cart and creates idempotent immutable order | API/integration | Repeated-add merge, current-price totals, atomic stock decrement/cart clear, exact replay, reused-key conflict, historical snapshot stability | REQ-CART-001/002, REQ-ORDER-001/002; TASK-005 |
| Claims one last unit under concurrent checkout | API/concurrency | Exactly one `201`, one stock conflict, one order, stock reaches zero without oversell | REQ-CART-002, REQ-ORDER-001; TASK-005 |
| Protects Admin transitions and customer ownership | API/integration | Customer denied Admin list, private other-customer order returns `ORDER_NOT_FOUND`, only sequential statuses accepted, invalid enum returns `INVALID_STATUS` | REQ-ORDER-002/003, REQ-ADMIN-001, REQ-SEC-002; TASK-005 |
| Rolls back checkout conflict | API/integration | Insufficient stock leaves order, idempotency row, and cart state unchanged | REQ-CART-002, REQ-ORDER-001; TASK-005 |
| Customer critical journey | E2E | Register, browse/search, detail, add/update cart, checkout, confirmation/history, profile update, logout/login | REQ-UI-001/002/003, REQ-USER-001, REQ-CART-001/002, REQ-ORDER-001/002; TASK-006/007/008 |
| Admin critical journey | E2E | Login, create category/product, update inventory, create real order, view order, advance status | REQ-UI-001/002/003, REQ-ADMIN-001, REQ-ORDER-003; TASK-007/008 |
| Public/Admin responsive matrix | E2E | 360/768/1280 viewport checks, keyboard focus visibility, and no page-level horizontal overflow | REQ-UI-003; TASK-006/007/008 |

## Current gate

The six API integration tests, two critical E2E tests, and six responsive E2E tests are implemented and discoverable. In the current workstation they cannot execute because PostgreSQL is unavailable at `127.0.0.1:5432`; environment-gated E2E tests therefore report skipped when the required variables are absent. This is an evidence gap, not a passing result.

## Test-design status

`PASS` for coverage definition and real-test implementation. Execution/acceptance remains `BLOCKED` pending PostgreSQL and API-backed E2E environment.
