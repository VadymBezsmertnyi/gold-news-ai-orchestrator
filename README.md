# GoldNews AI Orchestrator

Educational full-stack foundation for XAUUSD / gold news analytics. Collects news, stores predictions and market snapshots, supports mock evaluation and learning rules. **Claude orchestrator and Anthropic API are intentionally not implemented** — reserved for manual learning.

## Structure

- `backend/` — NestJS, Prisma, PostgreSQL, BullMQ-ready queues
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

### Seed mock data (optional)

```bash
curl -X POST http://localhost:3001/news/mock
curl -X POST http://localhost:3001/predictions/mock
curl -X POST http://localhost:3001/predictions/<id>/evaluate-mock
```

## Environment

See `backend/.env.example` and `web/.env.example`.
