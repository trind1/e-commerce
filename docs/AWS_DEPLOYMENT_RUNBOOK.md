# AWS Deployment Runbook

## 1. Scope

This document is the application release contract for the AWS infrastructure repository.
It does not define or provision AWS resources. VPC, subnet, Security Group, ALB, RDS,
CloudFront, S3, Route 53, ACM, IAM, and monitoring resources remain owned by the
infrastructure repository.

Target topology:

```text
Browser
  ├── https://<frontend-origin>
  │       └── CloudFront → S3 private bucket + OAC
  │
  └── https://<api-origin>/api/...
          └── ALB HTTPS :443 → EC2/Docker :3000 → RDS PostgreSQL :5432
```

The infrastructure repository MUST provide these deployment outputs before application
release:

| Output | Example | Consumer |
| --- | --- | --- |
| Frontend origin | `https://app.example.com` | `VITE_API_URL`, CORS verification |
| API origin | `https://api.example.com` | Frontend build, API smoke tests |
| S3 frontend bucket | `ecommerce-web-production` | Static asset upload |
| CloudFront distribution ID | `E123EXAMPLE` | Cache invalidation |
| Docker Hub image | `docker.io/username/ecommerce-api` | EC2 deployment |
| RDS endpoint | `db.example.region.rds.amazonaws.com` | `DATABASE_URL` |
| EC2 deployment access | SSM or approved deployment runner | Migration and container release |

## 2. Go-live blockers and domain decision

Before production, replace example/testing names with real DNS names. A public `.test`
domain is not a production DNS domain.

The current application uses an exact single `CORS_ORIGIN` and a host-only,
`HttpOnly; Secure; SameSite=Lax` session cookie. The preferred production arrangement
is two subdomains of the same registered domain:

```text
FRONTEND_ORIGIN=https://app.example.com
API_ORIGIN=https://api.example.com
```

They are different origins for CORS, but remain same-site for the existing `SameSite=Lax`
cookie policy. If the CloudFront default hostname and the API hostname are different
sites, do not proceed with authentication until a separate approved security change
selects `SameSite=None; Secure` and verifies CSRF protection.

## 3. Application configuration contract

The frontend receives the API URL at build time. The API receives runtime configuration
from the EC2 deployment environment or an approved secret/configuration service.

Production values:

```env
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3000
CORS_ORIGIN=https://app.example.com
VITE_API_URL=https://api.example.com/api
DATABASE_URL=postgresql://<user>:<url-encoded-password>@<rds-endpoint>:5432/<database>?schema=public&sslmode=require
SESSION_HMAC_SECRET=<at-least-32-character-random-secret>
SESSION_ABSOLUTE_TTL_SECONDS=28800
SESSION_IDLE_TTL_SECONDS=1800
```

Rules:

- Never commit the production environment file, database password, session secret,
  Docker Hub password, access token, or Admin credentials.
- `CORS_ORIGIN` MUST exactly match the browser origin, including scheme and port.
- `API_HOST` MUST be `0.0.0.0` inside the container so the ALB can reach port 3000.
- `VITE_API_URL` MUST be the complete API base URL for the two-origin deployment.
- Keep the session cookie host-only; do not broaden it with `Domain=.example.com`.
- The API origin must return `Set-Cookie` to the browser and the frontend HTTP client
  must use `credentials: 'include'`.

## 4. Release gates before AWS deployment

Run from the repository root using the supported Node.js version:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:fast
npm run build
```

Database-backed verification MUST also be completed before production acceptance:

```bash
npm run test:db
npm run test:e2e:acceptance
```

If PostgreSQL or the E2E environment is unavailable, record the gate as `BLOCKED`;
do not treat skipped database/acceptance tests as a production PASS.

## 5. Build and publish the API image

The API Dockerfile is located at `apps/api/Dockerfile`; the build context is the
repository root. Use an immutable release tag and retain the previous image tag for
rollback.

```bash
export IMAGE_REPOSITORY=username/ecommerce-api
export IMAGE_TAG=1.0.0

printf '%s' "$DOCKERHUB_TOKEN" | docker login \
  --username "$DOCKERHUB_USERNAME" \
  --password-stdin

docker build \
  -f apps/api/Dockerfile \
  -t "$IMAGE_REPOSITORY:$IMAGE_TAG" \
  .

docker push "$IMAGE_REPOSITORY:$IMAGE_TAG"
```

The Docker Hub repository SHOULD be private. The EC2 deployment MUST use a Docker Hub
access token with the minimum required permission. Prefer recording the pushed image
digest in the release record and deploying that digest or an immutable tag.

## 6. Build and publish the frontend

Build with the production API origin:

```bash
VITE_API_URL=https://api.example.com/api npm run build
```

The Vite output is `apps/web/dist`. Upload only this build artifact to the frontend
S3 bucket. Verify the bucket name supplied by infrastructure before using `--delete`.

```bash
aws s3 sync apps/web/dist "s3://<frontend-bucket>" \
  --delete \
  --cache-control 'public,max-age=31536000,immutable' \
  --exclude 'index.html'

aws s3 cp apps/web/dist/index.html "s3://<frontend-bucket>/index.html" \
  --cache-control 'no-cache,no-store,must-revalidate' \
  --content-type 'text/html; charset=utf-8'

aws cloudfront create-invalidation \
  --distribution-id '<cloudfront-distribution-id>' \
  --paths '/*'
```

CloudFront MUST be configured to serve SPA fallback requests with `index.html`, and
the S3 bucket MUST remain private with CloudFront OAC as the only read path.

## 7. RDS schema initialization and migration

RDS creates the PostgreSQL service/database, not the application tables. Prisma creates
the schema by applying the committed migrations in `prisma/migrations`.

The infrastructure prerequisites are:

- RDS is reachable from the EC2 Security Group on port 5432.
- The database name and credentials in `DATABASE_URL` are correct.
- The RDS certificate/SSL policy is compatible with `sslmode=require`.
- The target database is the intended environment and is not a disposable test database.

After the image is available on EC2, run migration exactly once per release using the
same image that will run the API:

```bash
docker run --rm \
  --env-file /opt/ecommerce/api.env \
  "$IMAGE_REPOSITORY:$IMAGE_TAG" \
  node node_modules/prisma/build/index.js migrate deploy
```

`migrate deploy` is the production command. Do not use `prisma migrate dev` or
`prisma db push` against RDS.

The migration command applies pending migrations in order and records them in
`_prisma_migrations`. It does not create an Admin account or seed catalog data.

## 8. EC2 API deployment

The EC2 host MUST have Docker, network access to Docker Hub, network access to RDS,
and an approved secret delivery method. Store `/opt/ecommerce/api.env` outside Git with
permissions restricted to the deployment user:

```bash
chmod 600 /opt/ecommerce/api.env
```

Pull the release:

```bash
printf '%s' "$DOCKERHUB_TOKEN" | docker login \
  --username "$DOCKERHUB_USERNAME" \
  --password-stdin
docker pull "$IMAGE_REPOSITORY:$IMAGE_TAG"
```

After migration succeeds, replace the API container:

```bash
docker stop ecommerce-api 2>/dev/null || true
docker rm ecommerce-api 2>/dev/null || true

docker run -d \
  --name ecommerce-api \
  --restart unless-stopped \
  --env-file /opt/ecommerce/api.env \
  -p 3000:3000 \
  "$IMAGE_REPOSITORY:$IMAGE_TAG"
```

The ALB target group health check is:

```text
GET http://<ec2-private-address>:3000/ready
```

The API process is healthy only when it can query RDS. `/health` checks process
liveness; `/ready` checks database readiness.

## 9. One-time Admin provisioning

Migration does not create the first Admin. Provision it once after the schema is ready,
using controlled runtime secrets. The production image contains compiled API output,
so invoke the compiled entrypoint rather than a source-only `tsx` command:

```bash
docker run --rm \
  --env-file /opt/ecommerce/admin-provision.env \
  "$IMAGE_REPOSITORY:$IMAGE_TAG" \
  node apps/api/dist/auth/provision-admin.js
```

The provisioning environment MUST contain `DATABASE_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_PROVISION_TOKEN_HASH`, and the raw
`ADMIN_PROVISION_TOKEN` only for the duration of this command. Do not print this
environment or token in logs. The command must not be part of normal API startup.

## 10. DNS, TLS, and network verification

Verify the infrastructure outputs before application acceptance:

```bash
curl -I https://app.example.com/
curl -i https://api.example.com/health
curl -i https://api.example.com/ready
```

Verify the credentialed CORS preflight:

```bash
curl -i -X OPTIONS https://api.example.com/api/auth/login \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expected preflight response includes:

```text
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Credentials: true
```

The following must also be verified in a real browser:

- Login response sets a `Secure; HttpOnly` session cookie.
- Subsequent API requests include the session cookie.
- Customer can access only the Customer flow.
- Admin can access Admin endpoints only.
- A request from an unapproved Origin is rejected for unsafe methods.
- API responses are not cached or shared between users.
- Direct S3 object access is denied.
- EC2 port 3000 is not publicly reachable.
- RDS port 5432 is not publicly reachable.

## 11. Operations

The infrastructure repository SHOULD provide:

- ALB unhealthy-target alarm.
- ALB/API 5xx alarm.
- EC2 CPU, memory, disk, and container restart monitoring.
- RDS storage, CPU, connections, and backup monitoring.
- Centralized API logs with request ID but without passwords, cookies, tokens, or
  database credentials.
- RDS automated backups and a tested restore procedure.
- SSM access instead of an open SSH port where possible.

Schedule `cleanup:expired` separately from the API process. If multiple EC2 instances
are used, run it through one controlled scheduler/job rather than every instance's
startup command.

## 12. Rollback

### API rollback

1. Keep the previous image tag or digest.
2. Confirm whether the database migration is backward-compatible with that image.
3. Deploy the previous API image only when compatibility is confirmed.
4. If a migration is not backward-compatible, use the approved forward migration or
   database recovery procedure; do not edit an applied migration file.

### Frontend rollback

1. Restore the previous `apps/web/dist` artifact to S3.
2. Upload `index.html` with no-cache headers.
3. Invalidate CloudFront.
4. Verify the previous frontend uses a compatible API contract.

## 13. Definition of Done

- [ ] Infrastructure outputs are available from the infrastructure repository.
- [ ] Production domain and TLS certificates are valid.
- [ ] Frontend is served by CloudFront from private S3.
- [ ] API is reachable through ALB HTTPS and target health is green.
- [ ] EC2 pulls the pinned Docker Hub image.
- [ ] RDS is private and reachable only by the API security boundary.
- [ ] `prisma migrate deploy` completed successfully on the intended RDS database.
- [ ] Admin provisioning completed once through the controlled procedure.
- [ ] Browser login, session renewal, logout, Customer flow, and Admin flow pass.
- [ ] CORS and Origin negative tests pass.
- [ ] Logs, alarms, backups, restore evidence, and rollback evidence exist.
- [ ] No secret is committed or exposed in image, frontend bundle, response, or logs.

**Status:** Application deployment runbook ready for infrastructure handoff. AWS
provisioning and production acceptance remain pending until the infrastructure outputs
and real domain values are supplied.
