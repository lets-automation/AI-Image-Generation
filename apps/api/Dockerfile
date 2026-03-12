# Stage 1: Install Dependencies 
FROM node:20-alpine AS deps

WORKDIR /app

# Copy workspace-level package files
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN npm ci --workspace=apps/api --workspace=packages/shared --include-workspace-root

# Stage 2: Build 
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
COPY package.json tsconfig.base.json ./

# Build shared package first
WORKDIR /app/packages/shared
RUN npx tsc

# Generate Prisma client
WORKDIR /app/apps/api
RUN npx prisma generate

# Build API
RUN npx tsc

# Stage 3: Production 
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Add non-root user
RUN addgroup --system --gid 1001 epuser && \
    adduser --system --uid 1001 epuser

# Copy built artifacts
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/src/engine/fonts/assets ./apps/api/src/engine/fonts/assets
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/package.json ./

USER epuser

EXPOSE 4000

WORKDIR /app/apps/api

# Run database migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
