import type { SocialImportJobStatus } from '@/types'

/**
 * Social import job lifecycle.
 *
 * Source of truth for the values: backend/app/models/social_import.py
 * (SocialImportJobStatus). The frontend type SocialImportJobStatus in
 * src/types/index.ts must list the same eight values.
 *
 * The edges below are taken from the backend write sites in
 * backend/app/services/social_import_pipeline_service.py. Each edge comment
 * names the write site that produces it.
 */

export const SOCIAL_IMPORT_JOB_STATUSES: readonly SocialImportJobStatus[] = [
  'created',
  'discovering',
  'awaiting_auth',
  'processing',
  'paused_rate_limited',
  'completed',
  'cancelled',
  'failed',
]

export const TERMINAL_SOCIAL_IMPORT_STATUSES: readonly SocialImportJobStatus[] = [
  'completed',
  'cancelled',
  'failed',
]

type TransitionTable = Record<SocialImportJobStatus, readonly SocialImportJobStatus[]>

export const SOCIAL_IMPORT_TRANSITIONS: TransitionTable = {
  // POST start -> created. run() enters discovery (_discover_all_photos).
  created: ['discovering', 'processing', 'cancelled', 'failed'],
  // _discover_all_photos sets discovering. Stale recovery resets to created when discovery is incomplete.
  discovering: ['created', 'awaiting_auth', 'processing', 'cancelled', 'failed'],
  // Discovery hits a login wall -> awaiting_auth. accept_auth -> processing.
  awaiting_auth: ['processing', 'cancelled', 'failed'],
  // _run_queue sets processing. Auth accepted, rate limit resumed, or stale recovery.
  processing: ['created', 'awaiting_auth', 'paused_rate_limited', 'completed', 'cancelled', 'failed'],
  // _pause_for_rate_limit sets paused. _try_resume_rate_limited_job sets processing.
  paused_rate_limited: ['processing', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
}

/**
 * Returns true when a job may move from `from` to `to`.
 * Re-reporting the same status is always allowed, because snapshots repeat.
 */
export function canTransition(
  from: SocialImportJobStatus,
  to: SocialImportJobStatus
): boolean {
  if (from === to) return true
  return SOCIAL_IMPORT_TRANSITIONS[from].includes(to)
}

export function isTerminalSocialImportStatus(
  status: SocialImportJobStatus | null | undefined
): boolean {
  if (!status) return false
  return TERMINAL_SOCIAL_IMPORT_STATUSES.includes(status)
}

/**
 * Picks the status to show after a server snapshot arrives.
 *
 * The server is authoritative for non-terminal states, so a snapshot is
 * accepted even when the edge is not in the table. A terminal status is
 * sticky: a late or out-of-order snapshot cannot move a finished job back
 * to life.
 */
export function resolveSocialImportStatus(
  current: SocialImportJobStatus | null,
  incoming: SocialImportJobStatus
): SocialImportJobStatus {
  if (current && isTerminalSocialImportStatus(current)) return current
  return incoming
}
