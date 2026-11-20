/**
 * Photoshoot step machine (web).
 *
 * Mirrors flutter/lib/features/photoshoot/providers/photoshoot_machine.dart.
 * Keep the two tables identical. Tests on both sides run the same edges.
 *
 * Edges (from -> to, label):
 *   upload     -> configure    continue (photos added)
 *   configure  -> upload       back
 *   configure  -> generating   start (not while a run is in flight)
 *   generating -> generating   run again: retry, or stay with a failure shown
 *                              (not while a run is in flight)
 *   generating -> results      complete
 *   generating -> configure    back to options (not while running) or
 *                              cancel (allowed while running)
 *   results    -> configure    new style
 *   results    -> upload       start over
 *
 * A failed start or a failed job stays on generating, with the error shown
 * there, so the user can retry or go back to options. See Decision 1 in
 * docs/exec-plans/active/2026-11-20-explicit-state-machines.md.
 */

export type PhotoshootStep = 'upload' | 'configure' | 'generating' | 'results';

export interface TransitionOptions {
  /** A run is in flight (job started and not yet ended). */
  running?: boolean;
  /** The transition is a user cancel of the in-flight run. */
  cancel?: boolean;
}

export function canTransition(
  from: PhotoshootStep,
  to: PhotoshootStep,
  opts: TransitionOptions = {}
): boolean {
  const running = opts.running === true;
  const cancel = opts.cancel === true;
  switch (from) {
    case 'upload':
      return to === 'configure';
    case 'configure':
      if (to === 'upload') return true;
      if (to === 'generating') return !running;
      return false;
    case 'generating':
      if (to === 'results') return !running;
      if (to === 'generating') return !running;
      if (to === 'configure') return !running || cancel;
      return false;
    case 'results':
      return to === 'configure' || to === 'upload';
    default:
      return false;
  }
}

/** Returns `to` when the edge is legal, otherwise `from` (no change). */
export function transition(
  from: PhotoshootStep,
  to: PhotoshootStep,
  opts: TransitionOptions = {}
): PhotoshootStep {
  return canTransition(from, to, opts) ? to : from;
}
