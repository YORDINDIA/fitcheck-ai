import { describe, it, expect } from 'vitest'
import {
  AVATAR_INITIAL,
  TRY_ON_STEPS,
  createTryOnMachine,
  transitionAvatar,
  transitionTryOn,
  type AvatarEvent,
  type TryOnEvent,
  type TryOnMachineState,
} from '../tryOnMachine'

const RESULT = { image_url: 'https://cdn.test/r.webp' } as never

const upload: TryOnMachineState = createTryOnMachine(false)
const options: TryOnMachineState = transitionTryOn(upload, { type: 'PICK_GARMENT' })
const generating: TryOnMachineState = transitionTryOn(options, { type: 'START' })

describe('try-on step machine', () => {
  it('PICK_GARMENT moves upload to options and records a garment', () => {
    expect(options.step).toBe('options')
    expect(options.hasGarment).toBe(true)
  })

  it('START from options moves to generating and clears error and result', () => {
    expect(generating.step).toBe('generating')
    expect(generating.error).toBeNull()
    expect(generating.result).toBeNull()
  })

  it('START while generating is ignored (same state reference)', () => {
    expect(transitionTryOn(generating, { type: 'START' })).toBe(generating)
  })

  it('START without a garment is rejected', () => {
    expect(transitionTryOn(upload, { type: 'START' })).toBe(upload)
  })

  it('PICK_GARMENT while generating is ignored', () => {
    expect(transitionTryOn(generating, { type: 'PICK_GARMENT' })).toBe(generating)
  })

  it('STEP_BACK while generating is ignored (the wizard is locked)', () => {
    expect(transitionTryOn(generating, { type: 'STEP_BACK', to: 'upload' })).toBe(generating)
    expect(transitionTryOn(generating, { type: 'STEP_BACK', to: 'options' })).toBe(generating)
  })

  it('SUCCESS from generating goes to result and stores the result', () => {
    const done = transitionTryOn(generating, { type: 'SUCCESS', result: RESULT })
    expect(done.step).toBe('result')
    expect(done.result).toBe(RESULT)
  })

  it('FAIL from generating goes to options with the message', () => {
    const failed = transitionTryOn(generating, { type: 'FAIL', message: 'boom' })
    expect(failed.step).toBe('options')
    expect(failed.error).toBe('boom')
    expect(failed.result).toBeNull()
  })

  it('CANCEL from generating returns to options when a garment is held', () => {
    expect(transitionTryOn(generating, { type: 'CANCEL' }).step).toBe('options')
  })

  it('CANCEL from generating on a remounted page (no garment) returns to upload', () => {
    const restored = createTryOnMachine(true)
    expect(restored.step).toBe('generating')
    expect(restored.hasGarment).toBe(false)
    expect(transitionTryOn(restored, { type: 'CANCEL' }).step).toBe('upload')
  })

  it('FAIL on a remounted page (no garment) returns to upload, keeping the message', () => {
    const failed = transitionTryOn(createTryOnMachine(true), { type: 'FAIL', message: 'boom' })
    expect(failed.step).toBe('upload')
    expect(failed.error).toBe('boom')
  })

  it('RESET from any step returns to upload and clears the garment and result', () => {
    for (const s of [options, generating, transitionTryOn(generating, { type: 'SUCCESS', result: RESULT })]) {
      const reset = transitionTryOn(s, { type: 'RESET' })
      expect(reset.step).toBe('upload')
      expect(reset.hasGarment).toBe(false)
      expect(reset.result).toBeNull()
      expect(reset.error).toBeNull()
    }
  })

  it('STEP_BACK from options to upload keeps the garment; forward jumps are rejected', () => {
    const back = transitionTryOn(options, { type: 'STEP_BACK', to: 'upload' })
    expect(back.step).toBe('upload')
    expect(back.hasGarment).toBe(true)
    expect(transitionTryOn(upload, { type: 'STEP_BACK', to: 'options' })).toBe(upload)
  })

  it('START from result (regenerate) moves to generating', () => {
    const done = transitionTryOn(generating, { type: 'SUCCESS', result: RESULT })
    expect(transitionTryOn(done, { type: 'START' }).step).toBe('generating')
  })

  it('SUCCESS, FAIL and CANCEL are ignored outside generating', () => {
    for (const s of [upload, options]) {
      expect(transitionTryOn(s, { type: 'SUCCESS', result: RESULT })).toBe(s)
      expect(transitionTryOn(s, { type: 'FAIL', message: 'x' })).toBe(s)
      expect(transitionTryOn(s, { type: 'CANCEL' })).toBe(s)
    }
  })

  it('every step/event pair either transitions or returns the same reference', () => {
    const events: TryOnEvent[] = [
      { type: 'PICK_GARMENT' },
      { type: 'START' },
      { type: 'SUCCESS', result: RESULT },
      { type: 'FAIL', message: 'x' },
      { type: 'CANCEL' },
      { type: 'RESET' },
      { type: 'STEP_BACK', to: 'upload' },
    ]
    const starts: TryOnMachineState[] = TRY_ON_STEPS.map((step) => ({
      step,
      hasGarment: step !== 'upload',
      result: step === 'result' ? (RESULT as never) : null,
      error: null,
    }))
    for (const s of starts) {
      for (const e of events) {
        const next = transitionTryOn(s, e)
        expect(TRY_ON_STEPS).toContain(next.step)
      }
    }
  })
})

describe('try-on avatar machine', () => {
  const pick = transitionAvatar(AVATAR_INITIAL, { type: 'PICK_AVATAR' })

  it('starts idle and PICK_AVATAR moves to uploading', () => {
    expect(AVATAR_INITIAL.phase).toBe('idle')
    expect(pick.phase).toBe('uploading')
  })

  it('progress below 100 stays uploading and records the percent', () => {
    const p = transitionAvatar(pick, { type: 'PROGRESS', percent: 40 })
    expect(p.phase).toBe('uploading')
    expect(p.percent).toBe(40)
  })

  it('progress at 100 moves to processing', () => {
    expect(transitionAvatar(pick, { type: 'PROGRESS', percent: 100 }).phase).toBe('processing')
  })

  it('PICK_AVATAR while uploading or processing is ignored', () => {
    expect(transitionAvatar(pick, { type: 'PICK_AVATAR' })).toBe(pick)
    const processing = transitionAvatar(pick, { type: 'PROGRESS', percent: 100 })
    expect(transitionAvatar(processing, { type: 'PICK_AVATAR' })).toBe(processing)
  })

  it('UPLOADED ends in done; UPLOAD_FAILED ends in error', () => {
    expect(transitionAvatar(pick, { type: 'UPLOADED' }).phase).toBe('done')
    expect(transitionAvatar(pick, { type: 'UPLOAD_FAILED' }).phase).toBe('error')
  })

  it('a new pick is allowed from idle, done and error', () => {
    const done = transitionAvatar(pick, { type: 'UPLOADED' })
    const failed = transitionAvatar(pick, { type: 'UPLOAD_FAILED' })
    for (const s of [AVATAR_INITIAL, done, failed]) {
      expect(transitionAvatar(s, { type: 'PICK_AVATAR' }).phase).toBe('uploading')
    }
  })

  it('PROGRESS, UPLOADED and UPLOAD_FAILED are ignored when idle', () => {
    const events: AvatarEvent[] = [
      { type: 'PROGRESS', percent: 100 },
      { type: 'UPLOADED' },
      { type: 'UPLOAD_FAILED' },
    ]
    for (const e of events) {
      expect(transitionAvatar(AVATAR_INITIAL, e)).toBe(AVATAR_INITIAL)
    }
  })
})
