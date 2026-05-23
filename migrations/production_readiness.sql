-- Production Readiness Migration
-- Run these SQL statements in your Neon DB console

-- =====================================================
-- 1. USER AUTHENTICATION ENHANCEMENTS
-- =====================================================

-- Add brute force protection fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_change_at TIMESTAMP;

-- Create login attempts table for security audit
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for login attempts
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS login_attempts_timestamp_idx ON login_attempts(timestamp);

-- =====================================================
-- 2. WEBHOOK CIRCUIT BREAKER
-- =====================================================

-- Add circuit breaker fields to webhooks table
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMP;

-- =====================================================
-- 3. PERFORMANCE INDEXES
-- =====================================================

-- Events table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_project_created_at_idx
  ON events(project_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS events_distinct_user_journey_idx
  ON events(project_id, distinct_id, timestamp DESC);

-- Webhook deliveries indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS webhook_deliveries_status_created_idx
  ON webhook_deliveries(status, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX CONCURRENTLY IF NOT EXISTS webhook_deliveries_webhook_created_idx
  ON webhook_deliveries(webhook_id, created_at DESC);

-- Token cleanup indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS password_reset_tokens_cleanup_idx
  ON password_reset_tokens(expires_at, used_at)
  WHERE used_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS email_verification_tokens_cleanup_idx
  ON email_verification_tokens(expires_at, used_at)
  WHERE used_at IS NULL;

-- Sessions index
CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_project_distinct_idx
  ON sessions(project_id, distinct_id, started_at DESC);

-- =====================================================
-- 4. CLEANUP OLD LOGIN ATTEMPTS (run periodically)
-- =====================================================

-- Delete login attempts older than 30 days (run in a cron job or manually)
-- DELETE FROM login_attempts WHERE timestamp < NOW() - INTERVAL '30 days';
