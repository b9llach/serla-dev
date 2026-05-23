import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, bigint, index, uniqueIndex, decimal, date, primaryKey, customType } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Postgres bytea support for binary blobs (gzip-compressed session replay chunks).
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

// Users table - authentication
// role: 'user' | 'admin'
// Soft-delete via deletedAt - readers must filter WHERE deletedAt IS NULL.
// The daily cron hard-deletes rows whose deletedAt is older than 30 days.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  role: text('role').default('user').notNull(), // user, admin
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
  emailVerifiedAt: timestamp('email_verified_at'),
  plan: text('plan').default('free').notNull(), // free, hobby, pro, max
  // Email preferences
  weeklyDigestEnabled: boolean('weekly_digest_enabled').default(true).notNull(),
  // Set when the user explicitly dismisses the onboarding wizard so it stops
  // showing on every dashboard load. Sample data also clears the wizard
  // implicitly once they hit their activation milestone (first real event).
  onboardingDismissedAt: timestamp('onboarding_dismissed_at'),
  stripeCustomerId: text('stripe_customer_id'),
  polarCustomerId: text('polar_customer_id'),
  polarSubscriptionId: text('polar_subscription_id'),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
  index('users_deleted_at_idx').on(table.deletedAt),
]);

// Projects table.
// Soft-delete via deletedAt - readers must filter WHERE deletedAt IS NULL.
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  domain: text('domain'),
  timezone: text('timezone').default('UTC').notNull(),
  // Legacy single-key columns. New projects no longer get a key auto-generated;
  // API keys now live in the api_keys table (many per project). These columns
  // stay (nullable) so the migration backfill has a place to read from and so
  // we can roll back without data loss. Reads should go through api_keys.
  apiKeyHash: text('api_key_hash'),
  apiKeyPrefix: text('api_key_prefix'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
  retentionDays: integer('retention_days').default(7).notNull(),
  settings: jsonb('settings').default({}).notNull(),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
  uniqueIndex('projects_api_key_hash_idx').on(table.apiKeyHash),
  index('projects_deleted_at_idx').on(table.deletedAt),
]);

// Events table - core event storage
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: text('session_id'),
  distinctId: text('distinct_id'), // User identifier
  name: text('name').notNull(),
  properties: jsonb('properties').default({}).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),

  // Enrichment fields
  country: text('country'),
  city: text('city'),
  region: text('region'),
  browser: text('browser'),
  browserVersion: text('browser_version'),
  os: text('os'),
  osVersion: text('os_version'),
  device: text('device'),
  deviceType: text('device_type'), // desktop, mobile, tablet

  // UTM parameters
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmTerm: text('utm_term'),
  utmContent: text('utm_content'),

  // Page info
  pageUrl: text('page_url'),
  pagePath: text('page_path'),
  pageTitle: text('page_title'),
  referrer: text('referrer'),
  referrerDomain: text('referrer_domain'),

  // Click tracking for heatmaps
  clickX: integer('click_x'),
  clickY: integer('click_y'),
  elementSelector: text('element_selector'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('events_project_timestamp_idx').on(table.projectId, table.timestamp),
  index('events_project_name_idx').on(table.projectId, table.name),
  index('events_session_id_idx').on(table.sessionId),
  index('events_distinct_id_idx').on(table.projectId, table.distinctId),
]);

// Sessions table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // Session ID string
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  distinctId: text('distinct_id'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  eventCount: integer('event_count').default(0).notNull(),
  duration: integer('duration').default(0).notNull(), // seconds

  // First touch attribution
  entryPage: text('entry_page'),
  exitPage: text('exit_page'),
  referrer: text('referrer'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),

  // Device info
  country: text('country'),
  browser: text('browser'),
  os: text('os'),
  deviceType: text('device_type'),
}, (table) => [
  index('sessions_project_started_at_idx').on(table.projectId, table.startedAt),
  index('sessions_distinct_id_idx').on(table.projectId, table.distinctId),
]);

// User identities (for identify calls)
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  distinctId: text('distinct_id').notNull(),
  properties: jsonb('properties').default({}).notNull(), // email, name, custom props
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('identities_project_distinct_id_idx').on(table.projectId, table.distinctId),
]);

// Goals - conversion tracking
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'pageview' | 'event'
  eventName: text('event_name'), // For event-based goals
  pagePathPattern: text('page_path_pattern'), // For pageview goals (supports wildcards)
  value: decimal('value', { precision: 10, scale: 2 }), // Monetary value per conversion
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('goals_project_id_idx').on(table.projectId),
]);

// Funnels - multi-step conversion tracking
export const funnels = pgTable('funnels', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  steps: jsonb('steps').notNull(), // Array of { name, type, eventName?, pagePathPattern? }
  windowDays: integer('window_days').default(7).notNull(), // Conversion window
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('funnels_project_id_idx').on(table.projectId),
]);

// Segments - saved audience segments
export const segments = pgTable('segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filters: jsonb('filters').notNull(), // { logic: 'and'|'or', conditions: [...] }
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('segments_project_id_idx').on(table.projectId),
]);

// Webhooks
// type: 'raw' | 'discord' | 'slack' | 'teams'
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Webhook'), // Display name
  type: text('type').notNull().default('raw'), // raw, discord, slack, teams
  url: text('url').notNull(),
  events: jsonb('events').default([]).notNull(), // Array of event names to trigger on
  enabled: boolean('enabled').default(true).notNull(),
  secret: text('secret').notNull(), // For signature verification
  // Circuit breaker: increment on each failed delivery, reset on success.
  // When threshold exceeded, set disabledAt and stop firing until user re-enables.
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  disabledAt: timestamp('disabled_at'),
  lastSuccessAt: timestamp('last_success_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('webhooks_project_id_idx').on(table.projectId),
]);

// Webhook deliveries - delivery log
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  status: text('status').notNull(), // 'pending' | 'success' | 'failed'
  statusCode: integer('status_code'),
  responseBody: text('response_body'),
  attempts: integer('attempts').default(0).notNull(),
  lastAttemptAt: timestamp('last_attempt_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('webhook_deliveries_webhook_id_idx').on(table.webhookId),
  index('webhook_deliveries_status_idx').on(table.status),
]);

// Daily metrics - pre-aggregated for dashboard performance
export const dailyMetrics = pgTable('daily_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),

  // Event counts
  totalEvents: bigint('total_events', { mode: 'number' }).default(0).notNull(),
  uniqueUsers: bigint('unique_users', { mode: 'number' }).default(0).notNull(),
  sessions: bigint('sessions', { mode: 'number' }).default(0).notNull(),
  pageviews: bigint('pageviews', { mode: 'number' }).default(0).notNull(),

  // Engagement
  avgSessionDuration: integer('avg_session_duration').default(0).notNull(), // seconds
  bounceRate: decimal('bounce_rate', { precision: 5, scale: 2 }).default('0').notNull(),

  // Top sources (stored as JSONB for flexibility)
  topSources: jsonb('top_sources').default([]).notNull(),
  topPages: jsonb('top_pages').default([]).notNull(),
  topCountries: jsonb('top_countries').default([]).notNull(),
  topBrowsers: jsonb('top_browsers').default([]).notNull(),
  topDevices: jsonb('top_devices').default([]).notNull(),

  // Goal completions
  goalCompletions: jsonb('goal_completions').default({}).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('daily_metrics_project_date_idx').on(table.projectId, table.date),
]);

// Password reset tokens
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('password_reset_tokens_user_id_idx').on(table.userId),
  index('password_reset_tokens_token_hash_idx').on(table.tokenHash),
]);

// Email verification tokens
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('email_verification_tokens_user_id_idx').on(table.userId),
  index('email_verification_tokens_token_hash_idx').on(table.tokenHash),
]);

// Custom metrics definitions
export const customMetrics = pgTable('custom_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  aggregation: text('aggregation').notNull(), // 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique'
  eventName: text('event_name').notNull(), // Event to aggregate
  property: text('property'), // Property to aggregate (for sum, avg, etc.)
  filters: jsonb('filters').default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('custom_metrics_project_id_idx').on(table.projectId),
]);

// Processed webhook events - idempotency tracking for inbound provider webhooks
// (e.g. Polar payment events). Insert with ON CONFLICT DO NOTHING; 0 rows = duplicate.
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(), // 'polar', etc.
  eventKey: text('event_key').notNull(), // deterministic key from type+id+modifiedAt
  processedAt: timestamp('processed_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('processed_webhook_events_provider_key_idx').on(table.provider, table.eventKey),
  index('processed_webhook_events_processed_at_idx').on(table.processedAt),
]);

// Cron job locks - prevent double-execution across overlapping Vercel cron invocations.
// Acquire via INSERT ... ON CONFLICT WHERE expires_at < now() RETURNING.
export const cronLocks = pgTable('cron_locks', {
  name: text('name').primaryKey(),
  lockedAt: timestamp('locked_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

// Audit log: append-only record of consequential project events (member
// invited / accepted / removed / role changed, project deleted, etc).
// Designed to be lightweight: action is a slug, target is a free-form ref,
// metadata is a JSONB for everything else. Filter on (projectId, createdAt)
// to show a project's activity timeline.
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('audit_log_project_created_idx').on(table.projectId, table.createdAt),
  index('audit_log_actor_id_idx').on(table.actorId),
]);

// Project members: many users per project with role-based access.
// Roles: 'owner' (full control, can delete project, manage members),
//        'editor' (create/edit/delete content like funnels, alerts, webhooks),
//        'viewer' (read-only access to dashboards).
// Every existing project is backfilled with a single 'owner' row equal to
// projects.userId, so the userId field on projects becomes effectively
// "original creator" - real access lives in this table.
export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'owner' | 'editor' | 'viewer'
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  uniqueIndex('project_members_project_user_idx').on(table.projectId, table.userId),
  index('project_members_user_id_idx').on(table.userId),
]);

// Pending invites by email. Token is stored hashed for the same reasons as
// password reset tokens. Accepted invites stay around with accepted_at set so
// the audit log can show "Alice invited Bob, Bob accepted on X".
export const projectInvites = pgTable('project_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(), // 'editor' | 'viewer' (owners aren't invitable)
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_invites_token_hash_idx').on(table.tokenHash),
  index('project_invites_project_id_idx').on(table.projectId),
  index('project_invites_email_idx').on(table.email),
]);

// Alerts - threshold rules evaluated by the daily cron.
// metric: which dashboard metric to compare ('events' | 'users' | 'sessions' | 'event_count').
// eventName: when metric='event_count', restricts to that event's count.
// comparator: 'gt' | 'lt'.
// threshold: absolute number to compare against.
// window: '24h' | '7d' - rolling window for the metric.
// Delivery: notifyEmail (string) and/or webhookId (uuid of an existing webhook).
// lastTriggeredAt: when we most recently fired. Prevents repeat firing while
//   the condition stays true (one fire per cooldownHours).
// lastEvaluatedAt: last cron pass that looked at this alert.
export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  metric: text('metric').notNull(),
  eventName: text('event_name'),
  comparator: text('comparator').notNull(),
  threshold: decimal('threshold', { precision: 20, scale: 4 }).notNull(),
  // Column is named window_size in the DB because 'window' is reserved.
  windowSize: text('window_size').notNull().default('24h'),
  cooldownHours: integer('cooldown_hours').default(24).notNull(),
  notifyEmail: text('notify_email'),
  webhookId: uuid('webhook_id').references(() => webhooks.id, { onDelete: 'set null' }),
  lastTriggeredAt: timestamp('last_triggered_at'),
  lastEvaluatedAt: timestamp('last_evaluated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('alerts_project_id_idx').on(table.projectId),
  index('alerts_enabled_idx').on(table.enabled),
]);

// Alert delivery log - one row per fired alert event for diagnostics.
export const alertDeliveries = pgTable('alert_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').notNull().references(() => alerts.id, { onDelete: 'cascade' }),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  observedValue: decimal('observed_value', { precision: 20, scale: 4 }).notNull(),
  thresholdAtFire: decimal('threshold_at_fire', { precision: 20, scale: 4 }).notNull(),
  deliveryStatus: text('delivery_status').notNull(), // 'success' | 'partial' | 'failed'
  deliveryError: text('delivery_error'),
}, (table) => [
  index('alert_deliveries_alert_id_idx').on(table.alertId),
  index('alert_deliveries_triggered_at_idx').on(table.triggeredAt),
]);

// Daily unique-user counter: one row per (project, date, distinct_id). Populated
// at ingestion via INSERT ... ON CONFLICT DO NOTHING; the daily cron does a fast
// COUNT(*) on this table instead of a COUNT(DISTINCT) over the events table.
// Auto-pruned by retention cleanup.
export const dailyUserSeen = pgTable('daily_user_seen', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  distinctId: text('distinct_id').notNull(),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.date, table.distinctId] }),
  index('daily_user_seen_project_date_idx').on(table.projectId, table.date),
]);

// API keys - many per project. Replaces the legacy single-key model
// (projects.apiKeyHash / apiKeyPrefix), which is kept around in a nullable
// state for migration purposes only. New code reads/writes only this table.
// The plaintext is shown to the user once at creation and never stored;
// `keyHash` is SHA-256 of the plaintext for authentication.
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Populated by the auth path on successful validate. Light writes only -
  // we don't update on every request, just first-of-day per key (see auth.ts).
  lastUsedAt: timestamp('last_used_at'),
  // Soft-revoke - keys stay in the table for the audit trail. Auth path
  // rejects keys with a non-null revokedAt.
  revokedAt: timestamp('revoked_at'),
  revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
  index('api_keys_project_id_idx').on(table.projectId),
]);

// Session recordings - top-level metadata, one row per recording.
// A "recording" corresponds to a single session_id; the actual rrweb events
// live in session_recording_chunks (gzipped bytea).
export const sessionRecordings = pgTable('session_recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  distinctId: text('distinct_id'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  durationMs: integer('duration_ms').default(0).notNull(),
  // Total uncompressed bytes of rrweb event JSON for capacity tracking.
  sizeBytes: integer('size_bytes').default(0).notNull(),
  eventCount: integer('event_count').default(0).notNull(),
  // First page url seen; used as a label in the replay list.
  startUrl: text('start_url'),
  // Set true if the recording captured any console.error or unhandledrejection.
  hasErrors: boolean('has_errors').default(false).notNull(),
  // Snapshot of device context at recording start.
  browser: text('browser'),
  os: text('os'),
  country: text('country'),
  deviceType: text('device_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('session_recordings_project_session_idx').on(table.projectId, table.sessionId),
  index('session_recordings_project_started_idx').on(table.projectId, table.startedAt),
  index('session_recordings_distinct_id_idx').on(table.projectId, table.distinctId),
]);

// Session recording chunks - ordered binary blobs of gzipped rrweb event arrays.
// The SDK batches events client-side and POSTs each batch as a chunk.
// On playback, the dashboard streams chunks in order, gunzips, and feeds rrweb-player.
export const sessionRecordingChunks = pgTable('session_recording_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordingId: uuid('recording_id').notNull().references(() => sessionRecordings.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  // gzip-compressed JSON.stringify(events[]).
  data: bytea('data').notNull(),
  // Original byte count before compression for capacity tracking.
  uncompressedSize: integer('uncompressed_size').notNull(),
  // First and last rrweb event timestamps in this chunk (epoch ms).
  startTime: bigint('start_time', { mode: 'number' }).notNull(),
  endTime: bigint('end_time', { mode: 'number' }).notNull(),
  eventsCount: integer('events_count').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('session_recording_chunks_recording_idx_idx').on(table.recordingId, table.chunkIndex),
]);

// Feature flags - boolean-or-variant flags evaluated per distinct_id.
// rolloutPercentage: 0-100, what fraction of users get the flag if no conditions match.
// conditions: jsonb array of property-match rules (any match = flag on for that user).
// variants: jsonb array of { key, weight } for multivariate flags (empty for boolean).
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').default(false).notNull(),
  rolloutPercentage: integer('rollout_percentage').default(100).notNull(),
  conditions: jsonb('conditions').default([]).notNull(),
  variants: jsonb('variants').default([]).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('feature_flags_project_key_idx').on(table.projectId, table.key),
  index('feature_flags_enabled_idx').on(table.enabled),
]);

// LLM generations - one row per prompt/completion pair.
// trace_id ties multi-step chains together (e.g. agent loop, RAG retrieval + answer).
export const llmGenerations = pgTable('llm_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  distinctId: text('distinct_id'),
  traceId: text('trace_id'),
  parentId: text('parent_id'),
  model: text('model').notNull(),
  provider: text('provider'), // 'openai' | 'anthropic' | 'mistral' | etc.
  input: jsonb('input'), // messages array or prompt
  output: jsonb('output'), // completion / message
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  costUsd: decimal('cost_usd', { precision: 20, scale: 8 }),
  latencyMs: integer('latency_ms'),
  status: text('status').default('success').notNull(), // 'success' | 'error'
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').default({}).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('llm_generations_project_timestamp_idx').on(table.projectId, table.timestamp),
  index('llm_generations_trace_id_idx').on(table.projectId, table.traceId),
  index('llm_generations_distinct_id_idx').on(table.projectId, table.distinctId),
  index('llm_generations_model_idx').on(table.projectId, table.model),
]);

// Error tracking - groups identical errors by fingerprint so the UI can show
// one row per recurring bug instead of one row per occurrence.
// fingerprint: deterministic SHA-256 of (type, top-frame file, top-frame fn).
// status: 'unresolved' | 'resolved' | 'ignored'
export const errorGroups = pgTable('error_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),
  message: text('message').notNull(),
  type: text('type'),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  occurrenceCount: integer('occurrence_count').default(1).notNull(),
  affectedUsers: integer('affected_users').default(0).notNull(),
  status: text('status').default('unresolved').notNull(),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  release: text('release'),
  environment: text('environment'),
}, (table) => [
  uniqueIndex('error_groups_project_fingerprint_idx').on(table.projectId, table.fingerprint),
  index('error_groups_project_last_seen_idx').on(table.projectId, table.lastSeenAt),
  index('error_groups_project_status_idx').on(table.projectId, table.status),
]);

// Individual error occurrences. Many error_events roll up into one error_group
// by fingerprint. Keep retention modest (30 days) to control table growth.
export const errorEvents = pgTable('error_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => errorGroups.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  distinctId: text('distinct_id'),
  sessionId: text('session_id'),
  message: text('message').notNull(),
  type: text('type'),
  stack: text('stack'),
  // Parsed top-of-stack for the list view.
  sourceFile: text('source_file'),
  sourceLine: integer('source_line'),
  sourceColumn: integer('source_column'),
  // Context.
  url: text('url'),
  userAgent: text('user_agent'),
  browser: text('browser'),
  os: text('os'),
  release: text('release'),
  environment: text('environment'),
  level: text('level').default('error').notNull(), // 'error' | 'warning' | 'info'
  metadata: jsonb('metadata').default({}).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => [
  index('error_events_group_timestamp_idx').on(table.groupId, table.timestamp),
  index('error_events_project_timestamp_idx').on(table.projectId, table.timestamp),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  events: many(events),
  sessions: many(sessions),
  identities: many(identities),
  goals: many(goals),
  funnels: many(funnels),
  segments: many(segments),
  webhooks: many(webhooks),
  dailyMetrics: many(dailyMetrics),
  customMetrics: many(customMetrics),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  project: one(projects, {
    fields: [events.projectId],
    references: [projects.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  project: one(projects, {
    fields: [sessions.projectId],
    references: [projects.id],
  }),
}));

export const identitiesRelations = relations(identities, ({ one }) => ({
  project: one(projects, {
    fields: [identities.projectId],
    references: [projects.id],
  }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  project: one(projects, {
    fields: [goals.projectId],
    references: [projects.id],
  }),
}));

export const funnelsRelations = relations(funnels, ({ one }) => ({
  project: one(projects, {
    fields: [funnels.projectId],
    references: [projects.id],
  }),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  project: one(projects, {
    fields: [segments.projectId],
    references: [projects.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  project: one(projects, {
    fields: [webhooks.projectId],
    references: [projects.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, {
    fields: [webhookDeliveries.webhookId],
    references: [webhooks.id],
  }),
}));

export const dailyMetricsRelations = relations(dailyMetrics, ({ one }) => ({
  project: one(projects, {
    fields: [dailyMetrics.projectId],
    references: [projects.id],
  }),
}));

export const customMetricsRelations = relations(customMetrics, ({ one }) => ({
  project: one(projects, {
    fields: [customMetrics.projectId],
    references: [projects.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.projectId],
    references: [projects.id],
  }),
}));

export const sessionRecordingsRelations = relations(sessionRecordings, ({ one, many }) => ({
  project: one(projects, {
    fields: [sessionRecordings.projectId],
    references: [projects.id],
  }),
  chunks: many(sessionRecordingChunks),
}));

export const sessionRecordingChunksRelations = relations(sessionRecordingChunks, ({ one }) => ({
  recording: one(sessionRecordings, {
    fields: [sessionRecordingChunks.recordingId],
    references: [sessionRecordings.id],
  }),
}));

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  project: one(projects, {
    fields: [featureFlags.projectId],
    references: [projects.id],
  }),
}));

export const llmGenerationsRelations = relations(llmGenerations, ({ one }) => ({
  project: one(projects, {
    fields: [llmGenerations.projectId],
    references: [projects.id],
  }),
}));

export const errorGroupsRelations = relations(errorGroups, ({ one, many }) => ({
  project: one(projects, {
    fields: [errorGroups.projectId],
    references: [projects.id],
  }),
  events: many(errorEvents),
}));

export const errorEventsRelations = relations(errorEvents, ({ one }) => ({
  group: one(errorGroups, {
    fields: [errorEvents.groupId],
    references: [errorGroups.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Funnel = typeof funnels.$inferSelect;
export type NewFunnel = typeof funnels.$inferInsert;
export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type NewDailyMetric = typeof dailyMetrics.$inferInsert;
export type CustomMetric = typeof customMetrics.$inferSelect;
export type NewCustomMetric = typeof customMetrics.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type SessionRecording = typeof sessionRecordings.$inferSelect;
export type NewSessionRecording = typeof sessionRecordings.$inferInsert;
export type SessionRecordingChunk = typeof sessionRecordingChunks.$inferSelect;
export type NewSessionRecordingChunk = typeof sessionRecordingChunks.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
export type LlmGeneration = typeof llmGenerations.$inferSelect;
export type NewLlmGeneration = typeof llmGenerations.$inferInsert;
export type ErrorGroup = typeof errorGroups.$inferSelect;
export type NewErrorGroup = typeof errorGroups.$inferInsert;
export type ErrorEvent = typeof errorEvents.$inferSelect;
export type NewErrorEvent = typeof errorEvents.$inferInsert;
