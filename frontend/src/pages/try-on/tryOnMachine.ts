/**
 * Try-on state machines. Pure functions, no React.
 *
 * The step machine owns the wizard step, the garment flag and the run outcome.
 * The avatar machine owns the avatar upload phase.
 *
 * Each step has an explicit table of accepted events. An event with no handler
 * for the current step is ignored. transitionTryOn then returns the same state
 * object, so callers detect a rejected event with `next === prev`.
 */
import type { TryOnResult } from '@/api/ai';

export type TryOnStep = 'upload' | 'options' | 'generating' | 'result';

export const TRY_ON_STEPS: readonly TryOnStep[] = ['upload', 'options', 'generating', 'result'];

export interface TryOnMachineState {
  step: TryOnStep;
  /** A garment photo is held. Options and generation need it. */
  hasGarment: boolean;
  /** Set only on the result step. */
  result: TryOnResult | null;
  /** Last failure message. Shown on Options, or on Upload after a remount. */
  error: string | null;
}

export type TryOnEvent =
  | { type: 'PICK_GARMENT' }
  | { type: 'START' }
  | { type: 'SUCCESS'; result: TryOnResult }
  | { type: 'FAIL'; message: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' }
  | { type: 'STEP_BACK'; to: TryOnStep };

type AnyTryOnHandler = (state: TryOnMachineState, event: TryOnEvent) => TryOnMachineState | null;
type TryOnEventType = TryOnEvent['type'];
type TryOnEventOf<T extends TryOnEventType> = Extract<TryOnEvent, { type: T }>;
type TryOnHandler<T extends TryOnEventType> = (
  state: TryOnMachineState,
  event: TryOnEventOf<T>
) => TryOnMachineState | null;
type TryOnHandlers = { [T in TryOnEventType]?: TryOnHandler<T> };

function resetState(): TryOnMachineState {
  return { step: 'upload', hasGarment: false, result: null, error: null };
}

/**
 * Initial state. `restoreInFlight` is true when the shared job pill still
 * reports an active try-on run (the page was remounted mid-request).
 */
export function createTryOnMachine(restoreInFlight: boolean): TryOnMachineState {
  if (restoreInFlight) {
    return { step: 'generating', hasGarment: false, result: null, error: null };
  }
  return resetState();
}

const startRun: TryOnHandler<'START'> = (s) =>
  s.hasGarment ? { ...s, step: 'generating', result: null, error: null } : null;

/**
 * Transition table: step -> accepted event -> handler. A missing entry means
 * the event is ignored on that step. A handler that returns null also means
 * ignored (for example START without a garment).
 *
 * | step       | PICK_GARMENT | START          | SUCCESS      | FAIL                 | CANCEL                    | STEP_BACK          | RESET |
 * |------------|--------------|----------------|--------------|----------------------|---------------------------|--------------------|-------|
 * | upload     | options      | ignored        | ignored      | ignored              | ignored                   | ignored            | upload|
 * | options    | ignored      | generating*    | ignored      | ignored              | ignored                   | upload             | upload|
 * | generating | ignored      | ignored        | result       | options / upload**   | options / upload**        | ignored            | upload|
 * | result     | ignored      | generating*    | ignored      | ignored              | ignored                   | options / upload   | upload|
 *
 * * needs hasGarment. ** upload when no garment is held (remounted page).
 */
const TRY_ON_TABLE: { [S in TryOnStep]: TryOnHandlers } = {
  upload: {
    PICK_GARMENT: (s) => ({ ...s, step: 'options', hasGarment: true, error: null }),
    RESET: resetState,
  },
  options: {
    START: startRun,
    STEP_BACK: (s, e) => (e.to === 'upload' ? { ...s, step: 'upload', error: null } : null),
    RESET: resetState,
  },
  generating: {
    SUCCESS: (s, e) => ({ ...s, step: 'result', result: e.result, error: null }),
    FAIL: (s, e) => ({
      ...s,
      step: s.hasGarment ? 'options' : 'upload',
      result: null,
      error: e.message,
    }),
    CANCEL: (s) => ({
      ...s,
      step: s.hasGarment ? 'options' : 'upload',
      result: null,
      error: null,
    }),
    RESET: resetState,
  },
  result: {
    START: startRun,
    STEP_BACK: (s, e) =>
      e.to === 'upload' || e.to === 'options'
        ? { ...s, step: e.to, result: null, error: null }
        : null,
    RESET: resetState,
  },
};

export function transitionTryOn(state: TryOnMachineState, event: TryOnEvent): TryOnMachineState {
  const handlers = TRY_ON_TABLE[state.step] as unknown as Record<string, AnyTryOnHandler | undefined>;
  const handler = handlers[event.type];
  if (!handler) return state;
  return handler(state, event) ?? state;
}

// Avatar sub-machine ----------------------------------------------------------

export type AvatarPhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface AvatarMachineState {
  phase: AvatarPhase;
  /** Client upload percent (0 to 100), or null when unknown. */
  percent: number | null;
}

export type AvatarEvent =
  | { type: 'PICK_AVATAR' }
  | { type: 'PROGRESS'; percent: number }
  | { type: 'UPLOADED' }
  | { type: 'UPLOAD_FAILED' };

export const AVATAR_INITIAL: AvatarMachineState = { phase: 'idle', percent: null };

/**
 * | phase      | PICK_AVATAR | PROGRESS                         | UPLOADED | UPLOAD_FAILED |
 * |------------|-------------|----------------------------------|----------|---------------|
 * | idle       | uploading   | ignored                          | ignored  | ignored       |
 * | uploading  | ignored     | uploading, or processing at 100% | done     | error         |
 * | processing | ignored     | ignored                          | done     | error         |
 * | done       | uploading   | ignored                          | ignored  | ignored       |
 * | error      | uploading   | ignored                          | ignored  | ignored       |
 */
export function transitionAvatar(state: AvatarMachineState, event: AvatarEvent): AvatarMachineState {
  switch (state.phase) {
    case 'idle':
    case 'done':
    case 'error':
      return event.type === 'PICK_AVATAR' ? { phase: 'uploading', percent: null } : state;
    case 'uploading':
      if (event.type === 'PROGRESS') {
        return { phase: event.percent >= 100 ? 'processing' : 'uploading', percent: event.percent };
      }
      if (event.type === 'UPLOADED') return { phase: 'done', percent: null };
      if (event.type === 'UPLOAD_FAILED') return { phase: 'error', percent: null };
      return state;
    case 'processing':
      if (event.type === 'UPLOADED') return { phase: 'done', percent: null };
      if (event.type === 'UPLOAD_FAILED') return { phase: 'error', percent: null };
      return state;
  }
}
