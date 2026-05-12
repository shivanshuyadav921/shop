import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.dbUrl });

export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id TEXT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'dealer',
      is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token TEXT PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      device_id UUID,
      ip TEXT,
      user_agent TEXT,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      device_id UUID,
      ip TEXT,
      user_agent TEXT,
      last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      platform TEXT,
      last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      success BOOLEAN NOT NULL,
      ip TEXT,
      device TEXT,
      reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS otp_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      target TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      otp_code_hash TEXT,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      consumed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ip_whitelist (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      label TEXT NOT NULL,
      ip_cidr TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS geo_restrictions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      label TEXT NOT NULL,
      country_code TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'block',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT,
      ip TEXT,
      user_agent TEXT,
      payload JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS otp_code_hash TEXT;
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, revoked, expires_at);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_username_created ON login_attempts(username, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_otp_requests_target_type_created ON otp_requests(target, type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);
}
