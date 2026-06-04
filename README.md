# GoldNews AI Orchestrator

Educational full-stack foundation for XAUUSD / gold news analytics. Background jobs run in-process via `@nestjs/schedule` (no Redis). Claude / Anthropic agents are **not** implemented yet.

## Structure

- `backend/` — NestJS, Prisma, PostgreSQL, in-process scheduler
- `web/` — Next.js App Router dashboard

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
# Edit DATABASE_URL / DIRECT_URL for PostgreSQL (e.g. Supabase)
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

API default: `http://localhost:3001`

### Frontend

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Dashboard: `http://localhost:3000`

## Background scheduler (automatic)

When the API is running:

| Interval | Job |
|----------|-----|
| Every 10 min | Forex Factory news sync (`NewsService.syncNews`) |
| Every 1 min | Pending news analysis placeholder (logs IDs, no AI) |
| Every 1 min | Evaluate due predictions (`evaluateDuePredictions`) |

## Local manual flow

```bash
curl -X POST http://localhost:3001/news/mock
curl -X POST http://localhost:3001/predictions/mock
curl -X POST http://localhost:3001/predictions/evaluate-due
```

Orchestrator placeholders (no AI):

```bash
curl -X POST http://localhost:3001/orchestrator/analyze-pending-placeholder
curl http://localhost:3001/orchestrator/global-context-placeholder
```

Single prediction evaluation anytime:

```bash
curl -X POST http://localhost:3001/predictions/<id>/evaluate-mock
```

## New database fields

- **NewsItem**: `analysisStatus`, `analysisSummary`, `category`, `impactLevel`, `goldImpact`, …
- **Prediction**: `sourceType` (`SINGLE_NEWS` \| `GLOBAL_CONTEXT`), `validFrom`, `expiresAt`, `globalContextId`, …
- **MarketContextAnalysis**: for future global-context predictions

## Environment

See `backend/.env.example` and `web/.env.example`.

## Future AI wiring

1. Replace `analyzePendingNewsPlaceholder()` with Claude agents → set `NewsItem.analysisStatus` and create `SINGLE_NEWS` predictions.
2. Replace `getGlobalContextPlaceholder()` → persist `MarketContextAnalysis` and `GLOBAL_CONTEXT` predictions.
3. Optionally call `MarketService.handlePriceUpdate()` from a live MetaAPI tick stream.
