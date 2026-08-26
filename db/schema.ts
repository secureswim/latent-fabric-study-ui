import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const studySessions = sqliteTable('study_sessions', {
  id: text('id').primaryKey(),
  participantId: text('participant_id').notNull(),
  sequence: text('sequence').notNull(),
  researcherInitials: text('researcher_initials').notNull().default(''),
  status: text('status').notNull().default('active'),
  currentTrial: integer('current_trial').notNull().default(0),
  stateJson: text('state_json').notNull(),
  startedAt: integer('started_at').notNull(),
  elapsedMs: integer('elapsed_ms').notNull().default(0),
  completedAt: integer('completed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_study_sessions_status_updated').on(table.status, table.updatedAt),
  index('idx_study_sessions_participant').on(table.participantId),
]);

export const studyTrials = sqliteTable('study_trials', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  trialNumber: integer('trial_number').notNull(),
  referentId: text('referent_id').notNull(),
  referentLabel: text('referent_label').notNull(),
  status: text('status').notNull().default('draft'),
  draftJson: text('draft_json').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_study_trials_session_trial').on(table.sessionId, table.trialNumber),
  index('idx_study_trials_session').on(table.sessionId),
]);
