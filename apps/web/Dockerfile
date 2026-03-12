# ─── Stage 1: Install Dependencies ────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=apps/web --workspace=packages/shared --include-workspace-root

# ─── Stage 2: Build ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
COPY package.json tsconfig.base.json ./

# Build shared package
WORKDIR /app/packages/shared
RUN npx tsc

# Build Next.js app
WORKDIR /app/apps/web

# Build args for env vars needed at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:4000/api/v1}

RUN npm run build

# ─── Stage 3: Production ────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 epuser && \
    adduser --system --uid 1001 epuser

# Copy Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER epuser

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
