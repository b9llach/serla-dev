// One-off migration runner for the codebase review.
// Adds: processed_webhook_events, cron_locks
// Run with: node --env-file=.env.local scripts/apply-audit-migrations.mjs

import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/apply-audit-migrations.mjs');
  process.exit(1);
}

const sql = neon(url);

const statements = [
  // processed_webhook_events
  `CREATE TABLE IF NOT EXISTS processed_webhook_events (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     provider text NOT NULL,
     event_key text NOT NULL,
     processed_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS processed_webhook_events_provider_key_idx
     ON processed_webhook_events (provider, event_key)`,
  `CREATE INDEX IF NOT EXISTS processed_webhook_events_processed_at_idx
     ON processed_webhook_events (processed_at)`,

  // cron_locks
  `CREATE TABLE IF NOT EXISTS cron_locks (
     name text PRIMARY KEY,
     locked_at timestamp NOT NULL DEFAULT now(),
     expires_at timestamp NOT NULL
   )`,

  // GIN index on events.properties for fast filtering by JSONB key/value
  // (e.g. WHERE properties->>'plan' = 'pro').
  `CREATE INDEX IF NOT EXISTS events_properties_gin_idx
     ON events USING GIN (properties)`,

  // daily_user_seen - counter table for unique users per day.
  // Populated at event ingestion; the daily cron reads from this instead
  // of running COUNT(DISTINCT) over the events table.
  `CREATE TABLE IF NOT EXISTS daily_user_seen (
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     date date NOT NULL,
     distinct_id text NOT NULL,
     first_seen_at timestamp NOT NULL DEFAULT now(),
     PRIMARY KEY (project_id, date, distinct_id)
   )`,
  `CREATE INDEX IF NOT EXISTS daily_user_seen_project_date_idx
     ON daily_user_seen (project_id, date)`,

  // Soft-delete columns for users and projects. Hard-deleted by daily cron
  // 30 days after deletedAt is set.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp`,
  `CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at)`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamp`,
  `CREATE INDEX IF NOT EXISTS projects_deleted_at_idx ON projects (deleted_at)`,

  // Weekly digest opt-in (defaults to true so existing users get the digest;
  // they can opt out from settings).
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean NOT NULL DEFAULT true`,

  // Threshold alerts evaluated daily.
  // window_size is named that way because 'window' is a reserved keyword in
  // Postgres (used for window functions).
  `CREATE TABLE IF NOT EXISTS alerts (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     name text NOT NULL,
     enabled boolean NOT NULL DEFAULT true,
     metric text NOT NULL,
     event_name text,
     comparator text NOT NULL,
     threshold numeric(20, 4) NOT NULL,
     window_size text NOT NULL DEFAULT '24h',
     cooldown_hours integer NOT NULL DEFAULT 24,
     notify_email text,
     webhook_id uuid REFERENCES webhooks(id) ON DELETE SET NULL,
     last_triggered_at timestamp,
     last_evaluated_at timestamp,
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS alerts_project_id_idx ON alerts (project_id)`,
  `CREATE INDEX IF NOT EXISTS alerts_enabled_idx ON alerts (enabled)`,

  // Per-fire log row so users can see when/why an alert delivered.
  `CREATE TABLE IF NOT EXISTS alert_deliveries (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
     triggered_at timestamp NOT NULL DEFAULT now(),
     observed_value numeric(20, 4) NOT NULL,
     threshold_at_fire numeric(20, 4) NOT NULL,
     delivery_status text NOT NULL,
     delivery_error text
   )`,
  `CREATE INDEX IF NOT EXISTS alert_deliveries_alert_id_idx ON alert_deliveries (alert_id)`,
  `CREATE INDEX IF NOT EXISTS alert_deliveries_triggered_at_idx ON alert_deliveries (triggered_at)`,

  // Project membership for teams. Each existing project gets a backfilled
  // owner row from projects.user_id so nobody loses access.
  `CREATE TABLE IF NOT EXISTS project_members (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role text NOT NULL,
     joined_at timestamp NOT NULL DEFAULT now(),
     invited_by uuid REFERENCES users(id) ON DELETE SET NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_idx
     ON project_members (project_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS project_members_user_id_idx
     ON project_members (user_id)`,

  // Backfill every project's creator as the owner. Safe to re-run.
  `INSERT INTO project_members (project_id, user_id, role)
     SELECT id, user_id, 'owner' FROM projects
     ON CONFLICT (project_id, user_id) DO NOTHING`,

  // Pending invites by email. Token hashed like password-reset tokens.
  `CREATE TABLE IF NOT EXISTS project_invites (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     email text NOT NULL,
     role text NOT NULL,
     token_hash text NOT NULL,
     invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at timestamp NOT NULL,
     accepted_at timestamp,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_invites_token_hash_idx
     ON project_invites (token_hash)`,
  `CREATE INDEX IF NOT EXISTS project_invites_project_id_idx
     ON project_invites (project_id)`,
  `CREATE INDEX IF NOT EXISTS project_invites_email_idx
     ON project_invites (email)`,

  // Audit log - append-only record of project-level events.
  `CREATE TABLE IF NOT EXISTS audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
     actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
     action text NOT NULL,
     target_type text,
     target_id text,
     metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS audit_log_project_created_idx
     ON audit_log (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx
     ON audit_log (actor_id)`,

  // Onboarding wizard dismissal timestamp - null means the wizard will keep
  // showing for users whose project has 0 real events.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamp`,

  // ===== Session replay =====
  // One row per session_id with rrweb event chunks in session_recording_chunks.
  `CREATE TABLE IF NOT EXISTS session_recordings (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     session_id text NOT NULL,
     distinct_id text,
     started_at timestamp NOT NULL DEFAULT now(),
     ended_at timestamp,
     duration_ms integer NOT NULL DEFAULT 0,
     size_bytes integer NOT NULL DEFAULT 0,
     event_count integer NOT NULL DEFAULT 0,
     start_url text,
     has_errors boolean NOT NULL DEFAULT false,
     browser text,
     os text,
     country text,
     device_type text,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS session_recordings_project_session_idx
     ON session_recordings (project_id, session_id)`,
  `CREATE INDEX IF NOT EXISTS session_recordings_project_started_idx
     ON session_recordings (project_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS session_recordings_distinct_id_idx
     ON session_recordings (project_id, distinct_id)`,

  `CREATE TABLE IF NOT EXISTS session_recording_chunks (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     recording_id uuid NOT NULL REFERENCES session_recordings(id) ON DELETE CASCADE,
     chunk_index integer NOT NULL,
     data bytea NOT NULL,
     uncompressed_size integer NOT NULL,
     start_time bigint NOT NULL,
     end_time bigint NOT NULL,
     events_count integer NOT NULL,
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS session_recording_chunks_recording_idx_idx
     ON session_recording_chunks (recording_id, chunk_index)`,

  // ===== Feature flags =====
  `CREATE TABLE IF NOT EXISTS feature_flags (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     key text NOT NULL,
     name text NOT NULL,
     description text,
     enabled boolean NOT NULL DEFAULT false,
     rollout_percentage integer NOT NULL DEFAULT 100,
     conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
     variants jsonb NOT NULL DEFAULT '[]'::jsonb,
     created_by uuid REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_project_key_idx
     ON feature_flags (project_id, key)`,
  `CREATE INDEX IF NOT EXISTS feature_flags_enabled_idx
     ON feature_flags (enabled)`,

  // ===== LLM observability =====
  `CREATE TABLE IF NOT EXISTS llm_generations (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     distinct_id text,
     trace_id text,
     parent_id text,
     model text NOT NULL,
     provider text,
     input jsonb,
     output jsonb,
     input_tokens integer,
     output_tokens integer,
     total_tokens integer,
     cost_usd numeric(20, 8),
     latency_ms integer,
     status text NOT NULL DEFAULT 'success',
     error_message text,
     metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
     timestamp timestamp NOT NULL DEFAULT now(),
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS llm_generations_project_timestamp_idx
     ON llm_generations (project_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS llm_generations_trace_id_idx
     ON llm_generations (project_id, trace_id)`,
  `CREATE INDEX IF NOT EXISTS llm_generations_distinct_id_idx
     ON llm_generations (project_id, distinct_id)`,
  `CREATE INDEX IF NOT EXISTS llm_generations_model_idx
     ON llm_generations (project_id, model)`,

  // ===== Error tracking =====
  `CREATE TABLE IF NOT EXISTS error_groups (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     fingerprint text NOT NULL,
     message text NOT NULL,
     type text,
     first_seen_at timestamp NOT NULL DEFAULT now(),
     last_seen_at timestamp NOT NULL DEFAULT now(),
     occurrence_count integer NOT NULL DEFAULT 1,
     affected_users integer NOT NULL DEFAULT 0,
     status text NOT NULL DEFAULT 'unresolved',
     assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
     resolved_at timestamp,
     resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
     release text,
     environment text
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS error_groups_project_fingerprint_idx
     ON error_groups (project_id, fingerprint)`,
  `CREATE INDEX IF NOT EXISTS error_groups_project_last_seen_idx
     ON error_groups (project_id, last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS error_groups_project_status_idx
     ON error_groups (project_id, status)`,

  `CREATE TABLE IF NOT EXISTS error_events (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     group_id uuid NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     distinct_id text,
     session_id text,
     message text NOT NULL,
     type text,
     stack text,
     source_file text,
     source_line integer,
     source_column integer,
     url text,
     user_agent text,
     browser text,
     os text,
     release text,
     environment text,
     level text NOT NULL DEFAULT 'error',
     metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
     timestamp timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS error_events_group_timestamp_idx
     ON error_events (group_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS error_events_project_timestamp_idx
     ON error_events (project_id, timestamp)`,

  // ===== Multi-key per project =====
  // Move from one-key-per-project (projects.api_key_hash / api_key_prefix) to
  // many-keys-per-project in a dedicated table. Legacy columns drop their
  // NOT NULL constraint so new projects can be created keyless. Existing
  // single keys are backfilled into the new table as 'Default key'.
  `CREATE TABLE IF NOT EXISTS api_keys (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     name text NOT NULL,
     key_hash text NOT NULL,
     key_prefix text NOT NULL,
     created_by uuid REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamp NOT NULL DEFAULT now(),
     last_used_at timestamp,
     revoked_at timestamp,
     revoked_by uuid REFERENCES users(id) ON DELETE SET NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash)`,
  `CREATE INDEX IF NOT EXISTS api_keys_project_id_idx ON api_keys (project_id)`,

  // Backfill: every existing project with a key gets one row labelled
  // "Default key". Idempotent on key_hash thanks to the unique index.
  `INSERT INTO api_keys (project_id, name, key_hash, key_prefix, created_at)
   SELECT id, 'Default key', api_key_hash, api_key_prefix, created_at
   FROM projects
   WHERE api_key_hash IS NOT NULL
   ON CONFLICT (key_hash) DO NOTHING`,

  // Make legacy columns nullable so new projects can be created keyless.
  `ALTER TABLE projects ALTER COLUMN api_key_hash DROP NOT NULL`,
  `ALTER TABLE projects ALTER COLUMN api_key_prefix DROP NOT NULL`,

  // ===== API key scopes =====
  // 'secret' keys (sk_live_) keep full access including data export.
  // 'public' keys (pk_live_) are write-only ingest + flag resolution, safe to
  // ship in a browser bundle. Existing keys default to 'secret' so nothing
  // that works today stops working.
  `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'secret'`,
  `CREATE INDEX IF NOT EXISTS api_keys_scope_idx ON api_keys (scope)`,
];

for (const stmt of statements) {
  const label = stmt.split('\n')[0].trim();
  process.stdout.write(`Running: ${label.slice(0, 80)}...\n`);
  await sql.query(stmt);
}

const tables = await sql.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('processed_webhook_events', 'cron_locks')
  ORDER BY table_name
`);
const indexes = await sql.query(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('processed_webhook_events', 'cron_locks')
  ORDER BY indexname
`);

console.log('\nTables present:', tables.map(t => t.table_name).join(', '));
console.log('Indexes present:', indexes.map(i => i.indexname).join(', '));
console.log('\nDone.');
