import { describe, expect, it } from 'vitest'
import type { BatchExtractionStep, BatchImageStatus, DetectedItemStatus } from '@/types'
import {
  BATCH_INITIAL_STEP,
  canTransitionImageStatus,
  canTransitionItemStatus,
  canTransitionStep,
  transitionImageStatus,
  transitionItemStatus,
  transitionStep,
} from '../batchExtractionMachine'

const key = (from: string, to: string) => `${from}>${to}`

const STEPS: BatchExtractionStep[] = ['select', 'uploading', 'extracting', 'generating', 'review', 'saving']
const LEGAL_STEP_MOVES = new Set([
  key('select', 'uploading'),
  key('uploading', 'extracting'),
  key('uploading', 'select'),
  key('extracting', 'review'),
  key('extracting', 'generating'),
  key('extracting', 'select'),
  key('generating', 'review'),
  key('generating', 'select'),
  key('review', 'generating'),
  key('review', 'saving'),
  key('review', 'select'),
  key('saving', 'select'),
])

const IMAGE_STATUSES: BatchImageStatus[] = ['pending', 'uploading', 'extracting', 'completed', 'failed']
const LEGAL_IMAGE_MOVES = new Set([
  key('pending', 'uploading'),
  key('pending', 'extracting'),
  key('pending', 'completed'),
  key('pending', 'failed'),
  key('uploading', 'extracting'),
  key('uploading', 'failed'),
  key('extracting', 'completed'),
  key('extracting', 'failed'),
])

const ITEM_STATUSES: DetectedItemStatus[] = ['detected', 'generating', 'generated', 'failed', 'deleted']
const LEGAL_ITEM_MOVES = new Set([
  key('detected', 'generating'),
  key('detected', 'generated'),
  key('detected', 'failed'),
  key('detected', 'deleted'),
  key('generating', 'generated'),
  key('generating', 'failed'),
  key('generating', 'deleted'),
  key('generated', 'failed'),
  key('generated', 'deleted'),
  key('failed', 'generated'),
  key('failed', 'deleted'),
])

describe('batch step transitions', () => {
  it('starts at select', () => {
    expect(BATCH_INITIAL_STEP).toBe('select')
  })

  it.each([...LEGAL_STEP_MOVES])('accepts %s', (move) => {
    const [from, to] = move.split('>') as [BatchExtractionStep, BatchExtractionStep]
    expect(canTransitionStep(from, to)).toBe(true)
    expect(transitionStep(from, to)).toEqual({ next: to, accepted: true })
  })

  it('accepts a same-step move for every step (idempotent replays)', () => {
    for (const step of STEPS) {
      expect(transitionStep(step, step)).toEqual({ next: step, accepted: true })
    }
  })

  it('canTransitionStep and transitionStep agree on same-step moves', () => {
    for (const step of STEPS) {
      expect(canTransitionStep(step, step)).toBe(true)
      expect(transitionStep(step, step).accepted).toBe(canTransitionStep(step, step))
    }
  })

  it('rejects every other move and keeps the current step', () => {
    for (const from of STEPS) {
      for (const to of STEPS) {
        if (from === to || LEGAL_STEP_MOVES.has(key(from, to))) continue
        expect(canTransitionStep(from, to), key(from, to)).toBe(false)
        expect(transitionStep(from, to), key(from, to)).toEqual({ next: from, accepted: false })
      }
    }
  })

  it('blocks a replayed extraction_started from pulling review back to extracting', () => {
    expect(transitionStep('review', 'extracting')).toEqual({ next: 'review', accepted: false })
  })

  it('blocks extraction events from interrupting saving', () => {
    expect(transitionStep('saving', 'extracting')).toEqual({ next: 'saving', accepted: false })
    expect(transitionStep('saving', 'review')).toEqual({ next: 'saving', accepted: false })
  })

  it('blocks stale events from moving an idle select step forward', () => {
    expect(transitionStep('select', 'review')).toEqual({ next: 'select', accepted: false })
    expect(transitionStep('select', 'extracting')).toEqual({ next: 'select', accepted: false })
  })
})

describe('batch image status transitions', () => {
  it.each([...LEGAL_IMAGE_MOVES])('accepts %s', (move) => {
    const [from, to] = move.split('>') as [BatchImageStatus, BatchImageStatus]
    expect(canTransitionImageStatus(from, to)).toBe(true)
    expect(transitionImageStatus(from, to)).toEqual({ next: to, accepted: true })
  })

  it('rejects every other move and keeps the current status', () => {
    for (const from of IMAGE_STATUSES) {
      for (const to of IMAGE_STATUSES) {
        if (from === to || LEGAL_IMAGE_MOVES.has(key(from, to))) continue
        expect(canTransitionImageStatus(from, to), key(from, to)).toBe(false)
        expect(transitionImageStatus(from, to), key(from, to)).toEqual({ next: from, accepted: false })
      }
    }
  })

  it('canTransitionImageStatus and transitionImageStatus agree on same-status moves', () => {
    for (const status of IMAGE_STATUSES) {
      expect(canTransitionImageStatus(status, status)).toBe(true)
      expect(transitionImageStatus(status, status).accepted).toBe(canTransitionImageStatus(status, status))
    }
  })

  it('treats completed and failed as terminal', () => {
    expect(transitionImageStatus('completed', 'extracting').accepted).toBe(false)
    expect(transitionImageStatus('failed', 'completed').accepted).toBe(false)
  })
})

describe('detected item status transitions', () => {
  it.each([...LEGAL_ITEM_MOVES])('accepts %s', (move) => {
    const [from, to] = move.split('>') as [DetectedItemStatus, DetectedItemStatus]
    expect(canTransitionItemStatus(from, to)).toBe(true)
    expect(transitionItemStatus(from, to)).toEqual({ next: to, accepted: true })
  })

  it('rejects every other move and keeps the current status', () => {
    for (const from of ITEM_STATUSES) {
      for (const to of ITEM_STATUSES) {
        if (from === to || LEGAL_ITEM_MOVES.has(key(from, to))) continue
        expect(canTransitionItemStatus(from, to), key(from, to)).toBe(false)
        expect(transitionItemStatus(from, to), key(from, to)).toEqual({ next: from, accepted: false })
      }
    }
  })

  it('canTransitionItemStatus and transitionItemStatus agree on same-status moves', () => {
    for (const status of ITEM_STATUSES) {
      expect(canTransitionItemStatus(status, status)).toBe(true)
      expect(transitionItemStatus(status, status).accepted).toBe(canTransitionItemStatus(status, status))
    }
  })

  it('blocks a replayed extraction event from moving generating, generated, or failed back to detected', () => {
    for (const from of ['generating', 'generated', 'failed'] as const) {
      expect(transitionItemStatus(from, 'detected')).toEqual({ next: from, accepted: false })
    }
  })

  it('keeps a user-deleted item deleted', () => {
    for (const to of ITEM_STATUSES.filter((s) => s !== 'deleted')) {
      expect(transitionItemStatus('deleted', to)).toEqual({ next: 'deleted', accepted: false })
    }
  })

  it('blocks generation_started from reviving generated or failed items', () => {
    expect(transitionItemStatus('generated', 'generating').accepted).toBe(false)
    expect(transitionItemStatus('failed', 'generating').accepted).toBe(false)
  })
})
