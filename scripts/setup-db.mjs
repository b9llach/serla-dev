// One-shot database setup for a fresh install.
//
//   npm run db:setup
//   (or: node --env-file=.env.local scripts/setup-db.mjs)
//
// Runs in two phases:
//   1. drizzle/0000_*.sql  - the base schema (users, projects, events, ...)
//   2. apply-audit-migrations.mjs - every table and column added since,
//      including api_keys, project_members, feature_flags, session
//      recordings, LLM generations, and error tracking.
//
// Both phases are idempotent, so this is safe to re-run against an existing
// database. Phase 1 statements are wrapped so "already exists" is not fatal -
// drizzle's generated SQL uses bare CREATE TABLE, not IF NOT EXISTS.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set.\n' +
      'Copy .env.example to .env.local and fill it in, then run: npm run db:setup'
  );
  process.exit(1);
}

const sql = neon(url);

/** Split a .sql file on drizzle's statement separator (or plain semicolons). */
function splitStatements(text) {
  const parts = text.includes('--> statement-breakpoint')
    ? text.split('--> statement-breakpoint')
    : text.split(/;\s*$/m);
  return parts.map(s => s.trim().replace(/;$/, '')).filter(Boolean);
}

/** Errors that mean "this object is already there" - safe to skip. */
function isAlreadyExists(err) {
  const msg = String(err?.message ?? err).toLowerCase();
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate key') ||
    msg.includes('duplicate object')
  );
}

async function runPhase1() {
  const drizzleDir = join(repoRoot, 'drizzle');
  let files = [];
  try {
    files = readdirSync(drizzleDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    console.log('No drizzle/ directory found - skipping base schema.');
    return;
  }
  if (files.length === 0) {
    console.log('No .sql files in drizzle/ - skipping base schema.');
    return;
  }

  for (const file of files) {
    console.log(`\nBase schema: ${file}`);
    const statements = splitStatements(readFileSync(join(drizzleDir, file), 'utf-8'));
    let created = 0;
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await sql.query(stmt);
        created++;
      } catch (err) {
        if (isAlreadyExists(err)) {
          skipped++;
        } else {
          console.error(`\nFailed statement:\n${stmt.slice(0, 200)}\n`);
          throw err;
        }
      }
    }
    console.log(`  applied ${created}, already present ${skipped}`);
  }
}

async function runPhase2() {
  console.log('\nIncremental migrations: apply-audit-migrations.mjs');
  // The migration runner executes its statements on import.
  await import('./apply-audit-migrations.mjs');
}

async function verify() {
  const expected = [
    'users', 'projects', 'events', 'sessions', 'identities',
    'goals', 'funnels', 'segments', 'custom_metrics', 'daily_metrics',
    'webhooks', 'webhook_deliveries', 'api_keys', 'project_members',
    'project_invites', 'audit_log', 'alerts', 'alert_deliveries',
    'daily_user_seen', 'cron_locks', 'processed_webhook_events',
    'session_recordings', 'session_recording_chunks', 'feature_flags',
    'llm_generations', 'error_groups', 'error_events',
  ];
  const rows = await sql.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const present = new Set(rows.map(r => r.table_name));
  const missing = expected.filter(t => !present.has(t));

  console.log(`\nTables present: ${present.size}`);
  if (missing.length > 0) {
    console.error(`MISSING: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('All expected tables exist. Database is ready.');
}

await runPhase1();
await runPhase2();
await verify();
