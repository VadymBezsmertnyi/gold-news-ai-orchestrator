# GoldNews AI Orchestrator

Educational full-stack foundation for XAUUSD / gold news analytics. Runs fully locally with in-process scheduling (no Redis/BullMQ).

## URLs

- API: http://localhost:3001
- Dashboard: http://localhost:3000

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Set `LLM_DEFAULT_PROVIDER=mock` in `.env` for zero-cost local demo (deterministic agent responses).

Set `METAAPI_TOKEN` and `METAAPI_ACCOUNT_ID` for live XAUUSD streaming (optional `METAAPI_SYMBOL=XAUUSD`).

### Web

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open the dashboard — it auto-refreshes every 10 seconds. No buttons required for the main flow.

## Automatic flow (after `npm run start:dev`)

1. **~3s after startup** — initial news sync, analysis batch, prediction evaluation.
2. **Every 10 min** — Forex Factory news sync (idempotent, no duplicates).
3. **Every 1 min** — analyze up to 2 pending news items (classifier → impact → prediction agents).
4. **Every 1 min** — evaluate due PENDING predictions (`checkAfter <= now`).
5. **Dashboard** — polls `GET /orchestrator/dashboard` every 10s (stats, news, predictions, server logs).

## Server logs

`GET /server-logs` — latest 100 DB-backed logs from scheduler jobs.

Types: `news_sync`, `news_analysis`, `prediction_evaluation`, `scheduler`

## Manual endpoints (optional)

```bash
curl -X POST http://localhost:3001/news/mock
curl -X POST http://localhost:3001/predictions/evaluate-due
curl -X POST http://localhost:3001/orchestrator/analyze-pending
```

## Architecture notes

- **News dedup**: `externalId` = `source:id` or `source:publishedAt:titleSlug`
- **Predictions**: one active `SINGLE_NEWS` PENDING prediction per news item
- **LLM**: Mock / OpenAI / Claude via `LlmRouterService.resolveAgentProvider()`
- **Global context**: placeholder only — `MarketContextAnalysis` model ready for later
