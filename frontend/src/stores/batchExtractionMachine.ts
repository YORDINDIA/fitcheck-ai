/**
 * Transition rules for the batch extraction flow.
 *
 * Pure functions: no store, no React. The store and the hook call these
 * before they write `step`, an image status, or an item status.
 *
 * A move that is not in a table is rejected: the current value is kept and
 * `accepted` is false. The caller logs the rejection. A same-value move is
 * always accepted, so replayed SSE events are idempotent.
 */

import type { BatchExtractionStep, BatchImageStatus, DetectedItemStatus } from '@/types'

export const BATCH_INITIAL_STEP: BatchExtractionStep = 'select'

/** Allowed step moves. Every step may return to `select` (cancel, error, terminal empty). */
export const BATCH_STEP_TRANSITIONS: Readonly<Record<BatchExtractionStep, readonly BatchExtractionStep[]>> = {
  select: ['uploading'],
  uploading: ['extracting', 'select'],
  extracting: ['review', 'generating', 'select'],
  generating: ['review', 'select'],
  review: ['generating', 'saving', 'select'],
  saving: ['select'],
}

/** Allowed per-image status moves. `completed` and `failed` are terminal. */
export const BATCH_IMAGE_TRANSITIONS: Readonly<Record<BatchImageStatus, readonly BatchImageStatus[]>> = {
  pending: ['uploading', 'extracting', 'completed', 'failed'],
  uploading: ['extracting', 'failed'],
  extracting: ['completed', 'failed'],
  completed: [],
  failed: [],
}

/**
 * Allowed per-item status moves. Never back to `detected` once generation has
 * started. `deleted` is a user action and is terminal.
 */
export const BATCH_ITEM_TRANSITIONS: Readonly<Record<DetectedItemStatus, readonly DetectedItemStatus[]>> = {
  detected: ['generating', 'generated', 'failed', 'deleted'],
  generating: ['generated', 'failed', 'deleted'],
  generated: ['failed', 'deleted'],
  failed: ['generated', 'deleted'],
  deleted: [],
}

export interface TransitionResult<T> {
  /** The value to store. Equals `to` when accepted, otherwise the unchanged `from`. */
  next: T;
  accepted: boolean;
}

function allowed<T extends string>(
  table: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T
): boolean {
  return from === to || (table[from] ?? []).includes(to);
}

function move<T extends string>(
  table: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T
): TransitionResult<T> {
  return allowed(table, from, to)
    ? { next: to, accepted: true }
    : { next: from, accepted: false };
}

export function canTransitionStep(from: BatchExtractionStep, to: BatchExtractionStep): boolean {
  return allowed(BATCH_STEP_TRANSITIONS, from, to);
}

export function transitionStep(
  from: BatchExtractionStep,
  to: BatchExtractionStep
): TransitionResult<BatchExtractionStep> {
  return move(BATCH_STEP_TRANSITIONS, from, to);
}

export function canTransitionImageStatus(from: BatchImageStatus, to: BatchImageStatus): boolean {
  return allowed(BATCH_IMAGE_TRANSITIONS, from, to);
}

export function transitionImageStatus(
  from: BatchImageStatus,
  to: BatchImageStatus
): TransitionResult<BatchImageStatus> {
  return move(BATCH_IMAGE_TRANSITIONS, from, to);
}

export function canTransitionItemStatus(from: DetectedItemStatus, to: DetectedItemStatus): boolean {
  return allowed(BATCH_ITEM_TRANSITIONS, from, to);
}

export function transitionItemStatus(
  from: DetectedItemStatus,
  to: DetectedItemStatus
): TransitionResult<DetectedItemStatus> {
  return move(BATCH_ITEM_TRANSITIONS, from, to);
}
