# Local development and PostgreSQL

This guide is for a local development database only. Production infrastructure, backups, and deployment remain outside this repository.

## Prerequisites

- Node.js 22.12.x
- npm
- Docker with Compose support, or a local PostgreSQL 16 instance

## Configure the application

```bash
cp .env.example .env
chmod 600 .env
```

The default Compose password is `change-me`, which matches the example database URLs and is only suitable for local development. If you change `POSTGRES_PASSWORD`, update both `DATABASE_URL` and `TEST_DATABASE_URL` with the same URL-encoded password.

Set a real `SESSION_HMAC_SECRET` with at least 32 characters. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the SHA-256 digest `ADMIN_PROVISION_TOKEN_HASH` before provisioning the first Admin. The raw provisioning token must be at least 32 characters and is supplied only at command time. Keep every real credential in `.env`; it is ignored by Git.

`DATABASE_CONNECTION_LIMIT` and `DATABASE_POOL_TIMEOUT_SECONDS` control the Prisma connection pool per API process. The defaults are `5` connections and a `10` second pool wait timeout; tune the total across all API replicas against PostgreSQL's connection budget.

## Start PostgreSQL

```bash
docker compose up -d postgres
```

The Compose file binds PostgreSQL only to `127.0.0.1:5432`. It initializes two databases:

- `ecommerce` for the application.
- `ecommerce_test` for disposable integration and E2E data.

If your Docker installation provides the legacy command, use `docker-compose up -d postgres` instead.

## Run the API in Docker

The API image uses the Docker service name `postgres` for its database connection and runs pending migrations before starting:

```bash
docker compose up -d postgres api
docker compose ps
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

The API container requires `SESSION_HMAC_SECRET` in `.env`. To inspect its logs:

```bash
docker compose logs -f api
```

Run the web app separately from the repository root:

```bash
npm run dev --workspace=@ecommerce/web
```

Keep `CORS_ORIGIN` equal to the URL used in the browser. The default is `http://localhost:5173`.

## Migrate and run

```bash
npm ci
npm run db:deploy
npm run db:deploy:test
ADMIN_PROVISION_TOKEN='the-raw-token-that-matches-the-configured-digest' npm run provision:admin
```

Run the API and web app in separate terminals from the repository root:

```bash
npm run dev --workspace=@ecommerce/api
npm run dev --workspace=@ecommerce/web
```

The API explicitly reads the repository-root `.env`, even when started from the API workspace. The web app also uses root Vite environment values. For the default same-origin setup, leave `VITE_API_URL=/api`.

## Expired-record cleanup

`npm run cleanup:expired` deletes only sessions whose configured absolute expiry has passed. It does not delete Orders, Users, Cart data, or active/revoked-but-not-yet-expired sessions. Completed checkout idempotency records are retained unless `CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS` is explicitly configured; choose that period to be at least as long as the client retry window, then schedule the command using your production scheduler.

Verify process liveness and database readiness separately:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

## Test commands

```bash
npm run test:fast
npm run test:db
npm run test:e2e:smoke
npm run test:e2e:acceptance
```

`test:e2e:acceptance` requires `E2E_DATABASE_URL`, `E2E_SESSION_HMAC_SECRET`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD`. It fails before starting tests if any are absent; it never silently skips critical journeys.
