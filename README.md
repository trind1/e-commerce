# E-commerce MVP

Ứng dụng e-commerce gồm API Fastify/Prisma/PostgreSQL và frontend React/Vite.

## Yêu cầu môi trường

- Node.js `22.12.x`
- npm
- Docker có Docker Compose plugin, hoặc PostgreSQL 16 cài trực tiếp

Kiểm tra phiên bản:

```bash
node --version
npm --version
docker compose version
```

## Cấu hình lần đầu

Từ thư mục gốc repository:

```bash
cp .env.example .env
chmod 600 .env
npm ci
```

Mở `.env` và thay các giá trị mẫu:

- `POSTGRES_PASSWORD`: mật khẩu PostgreSQL local.
- `DATABASE_URL`: database chạy ứng dụng.
- `TEST_DATABASE_URL`: database dùng cho integration/E2E test, tên phải kết thúc bằng `_test`.
- `SESSION_HMAC_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: tài khoản Admin đầu tiên.
- `ADMIN_PROVISION_TOKEN_HASH`: SHA-256 digest của token provisioning, không lưu raw token vào `.env`.

Tạo token provisioning và digest:

```bash
ADMIN_SETUP_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
ADMIN_PROVISION_TOKEN_HASH="$(node -e "const c=require('node:crypto'); console.log(c.createHash('sha256').update(process.argv[1]).digest('hex'))" "$ADMIN_SETUP_TOKEN")"
echo "$ADMIN_PROVISION_TOKEN_HASH"
```

Copy digest được in ra vào `ADMIN_PROVISION_TOKEN_HASH` trong `.env`. Giữ lại biến `ADMIN_SETUP_TOKEN` cho bước provisioning bên dưới.

## Khởi động PostgreSQL

```bash
docker compose up -d postgres
```

Compose tạo:

- `ecommerce`: database chạy ứng dụng.
- `ecommerce_test`: database disposable cho test.

PostgreSQL chỉ bind tại `127.0.0.1:5432`.

Nếu máy chưa có Compose plugin, cài Docker Compose hoặc dùng PostgreSQL 16 local và tạo hai database tương ứng với `DATABASE_URL` và `TEST_DATABASE_URL`.

## Chạy API bằng Docker

API trong Docker tự kết nối tới service `postgres` và tự chạy migration khi khởi động:

```bash
docker compose up -d postgres api
docker compose ps
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

Xem log API:

```bash
docker compose logs -f api
```

Khi chạy API bằng Docker, chỉ cần chạy frontend local ở terminal khác:

```bash
npm run dev --workspace=@ecommerce/web
```

Giữ `CORS_ORIGIN` khớp với địa chỉ frontend. Với `http://localhost:5173`, cấu hình hiện tại đã phù hợp.

## Migration và tạo Admin

```bash
npm run db:deploy
npm run db:deploy:test
ADMIN_PROVISION_TOKEN="$ADMIN_SETUP_TOKEN" npm run provision:admin
```

Lệnh provisioning chỉ tạo Admin khi database chưa có Admin. Không chạy trên production database nếu chưa có quy trình provisioning được phê duyệt.

## Chạy ứng dụng local

Mở hai terminal tại thư mục gốc.

Terminal 1 — API:

```bash
npm run dev --workspace=@ecommerce/api
```

API chạy tại `http://127.0.0.1:3000`.

Terminal 2 — web:

```bash
npm run dev --workspace=@ecommerce/web
```

Frontend chạy tại `http://127.0.0.1:5173`.

Kiểm tra API:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

`/health` kiểm tra process còn sống; `/ready` kiểm tra API kết nối được database.

## Test và build

Test không cần database:

```bash
npm run test:fast
```

Integration test với PostgreSQL disposable:

```bash
npm run test:db
```

E2E smoke không cần API/database thật:

```bash
npm run test:e2e:smoke
```

E2E acceptance cần API, PostgreSQL test và các biến môi trường:

```bash
E2E_DATABASE_URL="$TEST_DATABASE_URL" \
E2E_SESSION_HMAC_SECRET="$SESSION_HMAC_SECRET" \
E2E_ADMIN_EMAIL="$ADMIN_EMAIL" \
E2E_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
npm run test:e2e:acceptance
```

Chạy toàn bộ quality gate:

```bash
npm test
```

Build production artifact:

```bash
npm run build
```

## Cleanup dữ liệu hết hạn

Session hết hạn có thể dọn bằng:

```bash
npm run cleanup:expired
```

Idempotency record `COMPLETED` chỉ bị dọn khi cấu hình retention rõ ràng:

```bash
CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS=2592000 npm run cleanup:expired
```

Lệnh này không xoá User, Order, Cart hoặc session còn hạn. Nên chạy bằng scheduler của môi trường triển khai.

## Troubleshooting

- `ECONNREFUSED 127.0.0.1:5432`: PostgreSQL chưa chạy hoặc URL/port trong `.env` không khớp.
- `docker compose: unknown command`: Docker Compose plugin chưa được cài; cài plugin hoặc dùng PostgreSQL local.
- `npm run test:e2e:acceptance` báo thiếu `E2E_*`: kiểm tra bốn biến E2E trong `.env` hoặc truyền chúng khi chạy lệnh.
- API không đọc được biến môi trường khi chạy từ workspace: luôn chạy từ repository root; API và Vite đã được cấu hình đọc `.env` root.
- Không commit `.env`, password, token raw hoặc database credential.

## Tài liệu liên quan

- [Hướng dẫn local development và PostgreSQL](docs/LOCAL_DEVELOPMENT.md)
- [SDD status và verification](docs/sdd/status.md)
- [Implementation verification](docs/sdd/04-implementation/verification.md)

Production vẫn cần cấu hình riêng cho rate limiting distributed, metrics/alerting, backup/restore, HTTPS/reverse proxy và password reset email.

docker compose exec postgres psql -U ecommerce -d ecommerce
