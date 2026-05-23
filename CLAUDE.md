# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Serla is a developer analytics platform (PostHog alternative) built with Next.js 16, React 19, and TypeScript. The project uses Neon (PostgreSQL) for the database with Drizzle ORM planned for type-safe queries.

## Development Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint with Next.js rules
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4 with dark mode first design
- **Database**: Neon (PostgreSQL) with connection pooling
- **ORM**: Drizzle ORM
- **Payments**: Polar.sh SDK
- **Deployment**: Vercel (Edge Functions, Cron Jobs)

## Architecture

### API Routes (planned structure)
- `/api/v1/events` - Event ingestion (Edge Function)
- `/api/v1/events/batch` - Batch event ingestion
- `/api/v1/identify` - User identification
- `/api/v1/export` - Data export

### Database Considerations
- Use `DATABASE_URL` (pooled) for application queries
- Use `DATABASE_URL_UNPOOLED` for migrations only
- Index on (project_id, timestamp), (project_id, name), (session_id)
- Use pre-aggregated daily_metrics table for dashboard queries

### Authentication
- API keys: `Authorization: Bearer sk_live_...`
- Store API keys hashed, never raw

## UI/UX Guidelines

- Dark mode first, minimal aesthetic (Vercel/Polar.sh inspired)
- Near-black backgrounds (#0a0a0a, #111111)
- No emojis in UI or logging
- Professional design with subtle borders, minimal shadows
- 4px/8px spacing system with generous whitespace

## Database Changes

When updating database models, provide the SQL for Neon DB alongside Drizzle schema changes.
