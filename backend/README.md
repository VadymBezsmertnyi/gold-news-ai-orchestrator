# GoldNews AI Orchestrator Backend

NestJS backend of the GoldNews AI Orchestrator. See the [root README](../README.md) for the project overview, architecture, and status.

## Local setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Set `LLM_DEFAULT_PROVIDER=mock` in `.env` for a zero-cost local run. `METAAPI_TOKEN` and `METAAPI_ACCOUNT_ID` are only needed for live XAUUSD data.

## Useful endpoints

- `GET /orchestrator/dashboard`
- `GET /server-logs`
- `POST /news/mock`
- `POST /predictions/evaluate-due`
- `POST /orchestrator/analyze-pending`
