# EP-Product — Setup, Testing & Delivery Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Setup](#environment-setup)
3. [All API Keys & Credentials](#all-api-keys--credentials)
4. [Testing Workflow](#testing-workflow)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Production Readiness Checklist](#production-readiness-checklist)
7. [Delivery Checklist](#delivery-checklist)
8. [Architecture Overview](#architecture-overview)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Build shared package
cd packages/shared && npm run build && cd ../..

# 4. Apply migrations + seed
cd apps/api
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts

# 5. Copy and fill in env variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit .env with your keys (see "All API Keys" section below)

# 6. Start services (3 terminals)
cd apps/api && npm run dev      # API server on :4000
cd apps/api && npm run worker   # BullMQ worker
cd apps/web && npm run dev      # Frontend on :3000
```

**Default admin**: `admin@epproduct.com` / `Admin@123456`

---

## Environment Setup

### `.env` file locations:

1. **Backend (`apps/api/.env`)**: A reference file `apps/api/.env.example` is provided. Copy it and fill in your database, Redis, and API keys.
2. **Frontend (`apps/web/.env.local`)**: A reference file `apps/web/.env.example` is provided. Copy it to `.env.local` to point the frontend to the backend.

### Infrastructure Requirements

| Service | Version | Port | Purpose |
|---------|---------|------|---------|
| PostgreSQL | 16+ | 5432 | Primary database |
| Redis | 7+ | 6379 | Job queue (BullMQ), rate limiting, cost tracking |
| Node.js | 18+ | - | Runtime for API, worker, and build tools |

All managed via `docker-compose.yml`.

---

## All API Keys & Credentials

### JWT Secrets (REQUIRED)

| Key | Purpose | Where Used | Requirements |
|-----|---------|------------|--------------|
| `JWT_ACCESS_SECRET` | Signs short-lived access tokens | Auth middleware (`middleware/auth.ts`) | Min 32 chars, random hex |
| `JWT_REFRESH_SECRET` | Signs long-lived refresh tokens | Auth service (`services/auth.service.ts`) | Min 32 chars, random hex |

**How to generate**:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**CRITICAL**: Never use default values in production. Access tokens expire in 15 minutes, refresh tokens in 7 days. Refresh tokens are rotated on every use (old token is revoked).

### Cloudinary (REQUIRED)

| Key | Purpose | Where Used |
|-----|---------|------------|
| `CLOUDINARY_CLOUD_NAME` | Your cloud identifier | Template upload, generation output upload |
| `CLOUDINARY_API_KEY` | API authentication | `engine/upload/cloudinary.ts` |
| `CLOUDINARY_API_SECRET` | API authentication | `engine/upload/cloudinary.ts` |

**How to get**: Sign up at https://cloudinary.com/ (free: 25 credits/month). Keys are on Dashboard > Account Details.

**Used for**: Uploading admin templates, storing generated images, signed download URLs.

### AI Provider — OpenAI (REQUIRED)

All 3 tiers use **AI generation** via OpenAI. The template image is sent as a **style reference** — the AI generates a completely NEW poster matching the template's style, with text and logo artistically integrated. Without an OpenAI API key, generation will fail.

| Key | Provider | Where Used |
|-----|----------|------------|
| `OPENAI_API_KEY` | OpenAI | `engine/providers/openai.ts` |

**How to get your API key**:

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to **API Keys** (left sidebar > API keys)
4. Click **"Create new secret key"**
5. Copy the key (starts with `sk-`) and paste into your `.env` file
6. **Billing**: Add a payment method at https://platform.openai.com/account/billing — image generation is pay-per-use

**Pricing** (approximate, as of 2025):

| Model | Tier | Quality | Approx Cost |
|-------|------|---------|-------------|
| `gpt-image-1-mini` | BASIC | low | ~$0.04/image |
| `gpt-image-1` | STANDARD | medium | ~$0.08/image |
| `gpt-image-1.5` | PREMIUM | high | ~$0.17/image |

**DB-driven model config**: Models, quality, size, and cost are configured by the admin via the **Models** page in the admin panel (`/admin/models`). The source code reads all configuration from the `ModelPricing` database table — no code changes needed to switch models.

**Tier differences** (all use AI generation):

| Tier | Default Model | Quality | Size | Effect |
|------|---------------|---------|------|--------|
| BASIC | gpt-image-1-mini | low | 1024x1024 | Fast AI generation, budget-friendly |
| STANDARD | gpt-image-1 | medium | 1536x1024 | Balanced quality & detail |
| PREMIUM | gpt-image-1.5 | high | 1792x1024 | Highest quality, artistic detail |

### Apple Subscriptions (OPTIONAL)

| Key | Purpose |
|-----|---------|
| `APPLE_KEY_ID` | App Store Connect API key ID |
| `APPLE_ISSUER_ID` | Your team's issuer ID |
| `APPLE_BUNDLE_ID` | Your app's bundle identifier |
| `APPLE_PRIVATE_KEY` | ES256 PEM-encoded private key |
| `APPLE_ENVIRONMENT` | `Sandbox` or `Production` |

Only needed for live Apple In-App Purchase testing. Requires Apple Developer account ($99/year).

**For testing without Apple keys**: Seed credits directly in DB:
```sql
INSERT INTO subscription_balances ("id", "userId", "subscriptionId", "periodStart", "periodEnd", "weeklyCredits", "usedCredits", "remainingCredits", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '<user-id>', '<sub-id>', NOW(), NOW() + INTERVAL '7 days', 100, 0, 100, NOW(), NOW());
```

### Font Files (REQUIRED for text rendering)

Place in `apps/api/src/engine/fonts/assets/`:

| Font | Languages |
|------|-----------|
| NotoSans-Regular.ttf, NotoSans-Bold.ttf | English, Spanish, French, Portuguese, German |
| NotoSansDevanagari-Regular.ttf | Hindi |
| NotoSansArabic-Regular.ttf | Arabic (RTL) |
| NotoSansJP-Regular.ttf | Japanese |
| NotoSansSC-Regular.ttf | Chinese |
| NotoSansKR-Regular.ttf | Korean |

Download from https://fonts.google.com/noto

---

## Testing Workflow

### 1. Auth System

| Test | Steps | Expected |
|------|-------|----------|
| Register | POST `/register` with name, email, password, phone | 201, tokens returned |
| Login (user) | POST `/login` with user creds | Redirect to `/events` |
| Login (admin) | Login as `admin@epproduct.com` | Redirect to `/admin` |
| Wrong password | Login with wrong password | "Invalid email or password" (no hint which is wrong) |
| Duplicate email | Register with existing email | "Email already registered" (409) |
| Token refresh | Wait 15+ min, make API call | Auto-refreshes, no logout |
| Show/hide password | Click eye icon on login/register | Toggles password visibility |
| Password strength | Type password on register page | 4-bar indicator (red->green) |
| Phone validation | Enter "abc" in phone field | Toast error on submit |
| Deactivated account | Login as deactivated user | "Account has been deactivated" |

### 2. Admin Panel

| Test | Steps | Expected |
|------|-------|----------|
| Dashboard | Navigate to `/admin` | 8 stat cards with real data |
| Categories | Create/edit/delete category | Field schemas visible |
| Templates | Upload image, draw safe zones | Scrollable dialog, instruction banner |
| Safe zones | Draw rect, edit properties | Position, type, padding, font size |
| Festivals | Create with future date | Shows "Upcoming" badge |
| AI Models | Check model list | 3 entries (one per tier), all OpenAI |
| Pricing | Create plan in rupees | Rs.99 display (stored as 9900 paise internally) |
| Users | Change role, deactivate | Only SUPER_ADMIN can create admin |
| Analytics | Check AI cost monitor | OpenAI spending per tier |
| Audit logs | Generate content, check logs | Logs appear in moderation page |

### 3. Content Browsing

| Test | Steps | Expected |
|------|-------|----------|
| Events page | Navigate to `/events` | Only EVENT templates + categories |
| Posters page | Navigate to `/posters` | Only POSTER templates |
| Template detail | Click a template card | Preview, safe zones, tier pricing, no page errors |
| Languages tooltip | Hover "All 10" in generate page | Shows 10 languages with native labels |

### 4. Image Generation

| Test | Steps | Expected |
|------|-------|----------|
| Start from events/posters | Click template > Generate | Content type set automatically |
| Direct `/generate` access | Navigate to `/generate` directly | Toast: "Content type not set..." |
| Fill required fields | Leave required fields empty | Toast lists missing field names |
| Phone validation | Enter "abc" in phone field | Inline red error text |
| Email validation | Enter "notanemail" | Inline red error text |
| BASIC generation | Select Basic, generate | 10 language images, fast AI generation |
| STANDARD generation | Select Standard, generate | 10 language images, balanced AI quality |
| PREMIUM generation | Select Premium, generate | 10 language images, highest AI quality |
| Progressive display | Watch during generation | Images appear one-by-one as completed |
| English first | Check result order | English always on top |
| No AI key | Remove OPENAI_API_KEY, generate | Clear error message |
| Profanity in prompt | Enter profanity | Moderation block toast |
| No credits | Generate without credits | "Insufficient credits" toast |

### 5. Security

| Test | Steps | Expected |
|------|-------|----------|
| RBAC (user) | As USER, access `/admin` | Redirect away |
| RBAC (API) | As USER, call `/admin/categories` | 403 Forbidden |
| RBAC (admin create) | As ADMIN, create admin account | 403 (SUPER_ADMIN only) |
| Rate limiting | 6+ generations in 1 min | 429 Too Many Requests |
| Image upload scan | Upload non-image as template | Rejected |
| Error leakage | Trigger 500 error | "An unexpected error occurred" (no stack trace) |
| DB error | Trigger unique constraint | "A record with this email already exists" (not raw SQL) |

---

## API Endpoints Reference

### Auth
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/users/me
PATCH  /api/v1/users/me
```

### User Content
```
GET    /api/v1/templates
GET    /api/v1/templates/:id
GET    /api/v1/categories
GET    /api/v1/categories/:id
GET    /api/v1/festivals
```

### Generations
```
POST   /api/v1/generations
GET    /api/v1/generations
GET    /api/v1/generations/batch/:batchId
GET    /api/v1/generations/:id
GET    /api/v1/generations/:id/status   (SSE stream)
```

### Downloads
```
POST   /api/v1/downloads
GET    /api/v1/downloads
```

### Subscriptions
```
POST   /api/v1/subscriptions/verify
GET    /api/v1/subscriptions/status
POST   /api/v1/subscriptions/restore
GET    /api/v1/subscriptions/plans
```

### Admin (ADMIN/SUPER_ADMIN only)
```
CRUD   /api/v1/admin/categories
CRUD   /api/v1/admin/templates
CRUD   /api/v1/admin/festivals
CRUD   /api/v1/admin/model-pricing
CRUD   /api/v1/admin/subscription-plans
GET    /api/v1/admin/analytics/*
GET    /api/v1/admin/audit-logs
CRUD   /api/v1/admin/users
```

### Webhook
```
POST   /api/v1/webhooks/apple
```

### Docs
```
GET    /api/docs        (Swagger UI)
GET    /api/docs.json   (OpenAPI spec)
```

---

## Production Readiness Checklist

### Security

- [ ] Generate strong JWT secrets (64+ char hex) — never use defaults
- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your actual domain (not `localhost`)
- [ ] Enable HTTPS (via reverse proxy like nginx or load balancer)
- [ ] Remove seed admin password — create real admin via SUPER_ADMIN
- [ ] Rotate Cloudinary keys if they were ever committed to git
- [ ] Set `APPLE_ENVIRONMENT=Production` for live subscriptions
- [ ] Review rate limits for production traffic
- [ ] Ensure Redis requires password in production (`REDIS_URL` with auth)
- [ ] Ensure PostgreSQL has strong password + SSL

### Infrastructure

- [ ] Use `docker-compose.prod.yml` for production deployment
- [ ] Set up health check endpoint monitoring
- [ ] Configure log aggregation (the API uses pino JSON logging)
- [ ] Set up Redis persistence (AOF/RDB) for job queue durability
- [ ] Configure PostgreSQL backups (pg_dump or managed service)
- [ ] Set appropriate `WORKER_CONCURRENCY` for your server specs
- [ ] Set appropriate `WORKER_MAX_MEMORY_MB` to prevent OOM

### AI Provider

- [ ] Set `OPENAI_API_KEY` with a valid key and billing enabled
- [ ] Configure models per tier via admin UI (ModelPricing table)
- [ ] Set daily spend limits via SystemConfig in admin panel
- [ ] Monitor cost guard thresholds (70%/90%/100%)
- [ ] Test circuit breaker recovery after provider outages

### Frontend

- [ ] Set `NEXT_PUBLIC_API_URL` to production API endpoint
- [ ] Build with `npm run build` (standalone output for Docker)
- [ ] Verify error boundaries catch all route-level crashes
- [ ] Test all admin pages with real data at scale

---

## Delivery Checklist

Things to verify before handing off this project:

### Code Quality

- [ ] No files over 1000 lines (largest: `subscription.service.ts` at ~1050 — acceptable as cohesive state machine)
- [ ] All TypeScript strict mode — both apps pass `tsc --noEmit`
- [ ] No `console.log` in production paths (pino logger used instead)
- [ ] No hardcoded secrets in source code (all in `.env`)
- [ ] `.env.example` provided with documentation for every key
- [ ] No AI-generated "Phase X" or "Tier N" comments in code
- [ ] Error messages never expose stack traces, SQL queries, or internal paths

### Error Handling

- [ ] Zod validation errors return 422 with field-level details
- [ ] Prisma unique constraint errors return 409 with human-readable message
- [ ] All unexpected errors return generic "An unexpected error occurred"
- [ ] Frontend shows toast notifications for all error states
- [ ] Admin audit logs capture generation failures, moderation blocks

### Admin Experience

- [ ] Admin sees dashboard stats, AI costs, generation trends
- [ ] Admin can manage all content (categories, templates, festivals, models, plans, users)
- [ ] Admin sees audit logs for all user activity
- [ ] Safe zone editor has clear instructions and is not overflowing
- [ ] Pricing input is in rupees (not paise)
- [ ] Models page shows OpenAI models (3 tiers, admin-configurable)

### User Experience

- [ ] Auth pages have clean split-panel layout with branding
- [ ] Password strength indicator on registration
- [ ] Show/hide password toggle on login and register
- [ ] Phone and email validation with inline error messages
- [ ] Templates show safe zone overlay and tier pricing
- [ ] Generation shows progressive results (not waiting for all 10)
- [ ] English results always displayed first
- [ ] Language tooltip shows all 10 languages on hover

### State Management

- [ ] Auth store: clean login/logout/refresh cycle, no sensitive data in memory beyond tokens
- [ ] Generation store: proper reset after generation, no stale state between sessions
- [ ] Browse store: filters and pagination state managed cleanly
- [ ] No event listener leaks in stores

---

## Architecture Overview

```
EP-Product/
  apps/
    api/          Express + Prisma + BullMQ backend
      src/
        config/       Env validation, database, Redis
        controllers/  Route handlers (thin, delegate to services)
        middleware/    Auth, validation, rate limiting, error handling
        services/     Business logic (auth, generation, subscription, analytics, audit)
        engine/       Image generation pipeline
          fonts/      Font manager + Noto Sans assets
          layout/     9-position grid calculator, collision detection
          providers/  AI provider (OpenAI) — extensible via BaseProvider
          renderers/  Overlay renderer (fallback), Enhanced (AI generation) renderer
          upload/     Cloudinary upload
        moderation/   Prompt + field content moderation
        resilience/   Circuit breaker, cost guard
        queues/       BullMQ job queue
      prisma/         Schema (16 models) + migrations + seed
    web/          Next.js 14 frontend
      src/
        app/          Route groups: (auth), (dashboard), (admin)
        components/   Shared UI (shadcn/ui + admin components)
        stores/       Zustand state (auth, generation, browse)
        lib/          API client with token refresh
  packages/
    shared/       Zod schemas, types, constants (shared between API + Web)
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 500 on all requests | Missing DB tables | `npx prisma migrate deploy` |
| "Cannot find module" | Shared package not built | `npm run build` in `packages/shared` |
| Worker not processing | Worker not running | `npm run worker` in `apps/api` |
| Font rendering fallback | Missing font files | Download Noto Sans fonts to `engine/fonts/assets/` |
| Generation stuck QUEUED | Redis not running | `docker-compose up -d redis` |
| 401 on admin routes | Not logged in as admin | Login with `admin@epproduct.com` |
| EPERM on prisma generate | API server holding DLL | Stop API server, re-run `npx prisma generate` |
| "All providers unavailable" | No AI API key set | Add `OPENAI_API_KEY` to `.env` |
| 422 on generation | Zod validation failed | Navigate from `/events` or `/posters` first (sets content type) |
| Price shows wrong amount | Paise/rupees mismatch | Admin enters rupees (99), stored as paise (9900) internally |
| Only 1 language generated | Old schema/code | Run migration + rebuild shared package |
| Template detail page error | Next.js params mismatch | Params is plain object for Next.js 14 (already fixed) |
| AI generates random image | Template not sent as reference | All tiers send template as style reference via images/edits API |
| "Invalid or expired access token" | Token expired during idle | Auto-refreshes on next request; if refresh also expired, re-login |
| Duplicate email error shows 500 | Prisma error not caught | Fixed — Prisma P2002 returns 409 with human-readable message |
