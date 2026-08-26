import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb() {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return drizzle(env.DB, { schema });
}

let initialized = false;
export async function ensureSchema() {
  if (initialized) return;
  const d1 = env.DB;
  if (!d1) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      participant_id TEXT NOT NULL,
      sequence TEXT NOT NULL,
      researcher_initials TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      current_trial INTEGER NOT NULL DEFAULT 0,
      state_json TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS study_trials (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      trial_number INTEGER NOT NULL,
      referent_id TEXT NOT NULL,
      referent_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      draft_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_study_sessions_status_updated ON study_sessions(status, updated_at)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_study_sessions_participant ON study_sessions(participant_id)'),
    d1.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_study_trials_session_trial ON study_trials(session_id, trial_number)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_study_trials_session ON study_trials(session_id)'),
  ]);
  initialized = true;
}
