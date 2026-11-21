# GoldNews AI Orchestrator

> **Project Status: Discontinued / Portfolio Archive**

## Project Overview

GoldNews AI Orchestrator is a full-stack system that collects economic news for gold (XAUUSD), analyzes it with LLM agents, produces price-reaction predictions, and later checks those predictions against market data. It runs fully locally, with in-process scheduling and no Redis or queue infrastructure.

## Project Background

This is an educational and research project. I built it to get hands-on experience with AI-based analysis of financial news: working with external APIs, orchestrating several LLM agents, automating a recurring pipeline, and testing how well model predictions hold up against real market movements. My goal was practical experience with these technologies, not a commercial product.

## Key Features

- News synchronization from the ForexFactory API, idempotent and deduplicated by an external id
- A pipeline of LLM agents: news classifier, impact analysis, and prediction
- One active single-news prediction per news item, evaluated automatically once it is due
- A learning agent that runs on failed predictions and proposes prompt improvements, with thresholds for promoting and deprecating prompts
- Live XAUUSD market data through the MetaApi SDK, with candle history lookups
- A pluggable LLM router that supports a mock provider (deterministic, zero cost), OpenAI, and Claude
- A dashboard that refreshes every 10 seconds and shows statistics, news, predictions, and database-backed server logs
- A market-context model that was prepared but left as a placeholder

## Architecture

- **Backend (`backend/`)**: a NestJS application with modules for news, agents, AI (LLM router), predictions, learning, market, orchestrator, scheduler, and server logs. Data lives in PostgreSQL through Prisma, with migrations in `backend/prisma`.
- **Scheduler**: in-process jobs started with the application: an initial sync shortly after startup, a news sync every 10 minutes, analysis of up to two pending news items every minute, and evaluation of due predictions every minute.
- **Web (`web/`)**: a Next.js dashboard that polls the backend (`GET /orchestrator/dashboard`) and shows the latest server logs (`GET /server-logs`).
- **Configuration**: environment variables only; see `backend/.env.example` for the variable names. No credentials are stored in the repository.

## Tech Stack

- Backend: Node.js, TypeScript, NestJS (`@nestjs/schedule`, `@nestjs/config`), Prisma with PostgreSQL, class-validator
- AI: OpenAI SDK, Anthropic SDK
- Market and news data: MetaApi cloud SDK, ForexFactory API access through `axios` and `impit`
- Web: Next.js, React, TypeScript, Tailwind CSS
- Tooling: ESLint, Prettier, Jest

## Project Timeline

- Started: June 2026
- Discontinued: June 2026
- Status: Discontinued — Portfolio Archive

The whole commit history (54 commits) was written within a single day, 4 June 2026.

## Project Status

The project is discontinued and no longer maintained. It was a short learning and research exercise, and it gave me the practical experience I was looking for. The code is not intended to run in production without your own credentials and infrastructure, and the external APIs it uses may have changed.

## Portfolio Note

I keep this repository as an example of my hands-on experience and growth as a developer. No license has been chosen, so all rights are reserved by the author.
