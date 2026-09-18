FROM node:22.12-bookworm-slim AS build

WORKDIR /app
ENV CI=true
ENV DATABASE_URL=postgresql://ecommerce:change-me@postgres:5432/ecommerce?schema=public

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json apps/api/tsconfig.build.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json

RUN npm ci

COPY apps/api/src ./apps/api/src
COPY packages/contracts/src ./packages/contracts/src

RUN npm run prisma:generate
RUN npm run build --workspace=@ecommerce/contracts
RUN npm run build --workspace=@ecommerce/api

FROM node:22.12-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
