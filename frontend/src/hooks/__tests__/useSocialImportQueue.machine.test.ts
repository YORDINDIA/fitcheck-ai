import { describe, expect, it } from 'vitest'
import type { SocialImportJobStatus } from '@/types'
import {
  SOCIAL_IMPORT_JOB_STATUSES,
  TERMINAL_SOCIAL_IMPORT_STATUSES,
  canTransition,
  resolveSocialImportStatus,
} from '../socialImportMachine'

const LEGAL_EDGES: Array<[SocialImportJobStatus, SocialImportJobStatus]> = [
  ['created', 'discovering'],
  ['created', 'processing'],
  ['created', 'cancelled'],
  ['created', 'failed'],
  ['discovering', 'created'],
  ['discovering', 'awaiting_auth'],
  ['discovering', 'processing'],
  ['discovering', 'cancelled'],
  ['discovering', 'failed'],
  ['awaiting_auth', 'processing'],
  ['awaiting_auth', 'cancelled'],
  ['awaiting_auth', 'failed'],
  ['processing', 'created'],
  ['processing', 'awaiting_auth'],
  ['processing', 'paused_rate_limited'],
  ['processing', 'completed'],
  ['processing', 'cancelled'],
  ['processing', 'failed'],
  ['paused_rate_limited', 'processing'],
  ['paused_rate_limited', 'cancelled'],
  ['paused_rate_limited', 'failed'],
]

describe('social import status set', () => {
  it('exposes exactly the eight statuses the backend enum defines', () => {
    expect([...SOCIAL_IMPORT_JOB_STATUSES].sort()).toEqual(
      [
        'awaiting_auth',
        'cancelled',
        'completed',
        'created',
        'discovering',
        'failed',
        'paused_rate_limited',
        'processing',
      ].sort()
    )
  })

  it('marks completed, cancelled and failed as the only terminal statuses', () => {
    expect([...TERMINAL_SOCIAL_IMPORT_STATUSES].sort()).toEqual(['cancelled', 'completed', 'failed'])
  })
})

describe('canTransition', () => {
  it.each(LEGAL_EDGES)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
  })

  it('allows a status to re-report itself (idempotent snapshot)', () => {
    for (const status of SOCIAL_IMPORT_JOB_STATUSES) {
      expect(canTransition(status, status)).toBe(true)
    }
  })

  it.each([
    ['awaiting_auth', 'completed'],
    ['paused_rate_limited', 'awaiting_auth'],
    ['created', 'completed'],
    ['discovering', 'paused_rate_limited'],
  ] as Array<[SocialImportJobStatus, SocialImportJobStatus]>)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
  })

  it.each(['completed', 'cancelled', 'failed'] as SocialImportJobStatus[])(
    'gives terminal status %s no outgoing edge',
    (terminal) => {
      for (const to of SOCIAL_IMPORT_JOB_STATUSES) {
        if (to === terminal) continue
        expect(canTransition(terminal, to)).toBe(false)
      }
    }
  )
})

describe('resolveSocialImportStatus', () => {
  it('keeps a terminal status against a later non-terminal snapshot', () => {
    expect(resolveSocialImportStatus('completed', 'processing')).toBe('completed')
    expect(resolveSocialImportStatus('cancelled', 'awaiting_auth')).toBe('cancelled')
    expect(resolveSocialImportStatus('failed', 'created')).toBe('failed')
  })

  it('accepts the incoming snapshot when the current status is not terminal', () => {
    expect(resolveSocialImportStatus('awaiting_auth', 'processing')).toBe('processing')
    expect(resolveSocialImportStatus('processing', 'completed')).toBe('completed')
  })

  it('accepts the incoming status when there is no current status', () => {
    expect(resolveSocialImportStatus(null, 'created')).toBe('created')
  })
})
