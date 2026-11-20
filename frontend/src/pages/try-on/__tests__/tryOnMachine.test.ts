import { describe, it, expect } from 'vitest'
import {
  AVATAR_INITIAL,
  createTryOnMachine,
  transitionAvatar,
  transitionTryOn,
  type AvatarEvent,
  type TryOnEvent,
  type TryOnMachineState,
  type TryOnStep,
} from '../tryOnMachine'

const RESULT = { image_url: 'https://cdn.test/r.webp' } as never

const upload: TryOnMachineState = createTryOnMachine(false)
const options: TryOnMachineState = transitionTryOn(upload, { type: 'PICK_GARMENT' })
const generating: TryOnMachineState = transitionTryOn(options, { type: 'START' })
const resultWithGarment: TryOnMachineState = transitionTryOn(generating, { type: 'SUCCESS', result: RESULT })
// A remounted page restores generating with no garment, then lands a result.
const restoredGenerating: TryOnMachineState = createTryOnMachine(true)
const restoredResult: TryOnMachineState = transitionTryOn(restoredGenerating, { type: 'SUCCESS', result: RESULT })

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
    expect(restoredGenerating.step).toBe('generating')
    expect(restoredGenerating.hasGarment).toBe(false)
    expect(transitionTryOn(restoredGenerating, { type: 'CANCEL' }).step).toBe('upload')
  })

  it('FAIL on a remounted page (no garment) returns to upload, keeping the message', () => {
    const failed = transitionTryOn(restoredGenerating, { type: 'FAIL', message: 'boom' })
    expect(failed.step).toBe('upload')
    expect(failed.error).toBe('boom')
  })

  it('RESET from any step returns to upload and clears the garment and result', () => {
    for (const s of [options, generating, resultWithGarment]) {
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

  it('STEP_BACK from result to options with a garment goes to options', () => {
    const back = transitionTryOn(resultWithGarment, { type: 'STEP_BACK', to: 'options' })
    expect(back.step).toBe('options')
    expect(back.hasGarment).toBe(true)
    expect(back.result).toBeNull()
  })

  it('STEP_BACK from result to options with no garment goes to upload', () => {
    const back = transitionTryOn(restoredResult, { type: 'STEP_BACK', to: 'options' })
    expect(back.step).toBe('upload')
    expect(back.hasGarment).toBe(false)
    expect(back.result).toBeNull()
  })

  it('START from result (regenerate) moves to generating', () => {
    expect(transitionTryOn(resultWithGarment, { type: 'START' }).step).toBe('generating')
  })

  it('SUCCESS, FAIL and CANCEL are ignored outside generating', () => {
    for (const s of [upload, options]) {
      expect(transitionTryOn(s, { type: 'SUCCESS', result: RESULT })).toBe(s)
      expect(transitionTryOn(s, { type: 'FAIL', message: 'x' })).toBe(s)
      expect(transitionTryOn(s, { type: 'CANCEL' })).toBe(s)
    }
  })
})

describe('try-on step/event table', () => {
  // `to` is the expected step after the event, or 'same' when the event is
  // rejected and the machine must return the exact input reference.
  type Case = { name: string; from: TryOnMachineState; event: TryOnEvent; to: TryOnStep | 'same' }

  const PICK: TryOnEvent = { type: 'PICK_GARMENT' }
  const START: TryOnEvent = { type: 'START' }
  const SUCCESS: TryOnEvent = { type: 'SUCCESS', result: RESULT }
  const FAIL: TryOnEvent = { type: 'FAIL', message: 'x' }
  const CANCEL: TryOnEvent = { type: 'CANCEL' }
  const RESET: TryOnEvent = { type: 'RESET' }
  const BACK_UPLOAD: TryOnEvent = { type: 'STEP_BACK', to: 'upload' }
  const BACK_OPTIONS: TryOnEvent = { type: 'STEP_BACK', to: 'options' }

  const cases: Case[] = [
    // upload (no garment)
    { name: 'upload + PICK_GARMENT', from: upload, event: PICK, to: 'options' },
    { name: 'upload + START', from: upload, event: START, to: 'same' },
    { name: 'upload + SUCCESS', from: upload, event: SUCCESS, to: 'same' },
    { name: 'upload + FAIL', from: upload, event: FAIL, to: 'same' },
    { name: 'upload + CANCEL', from: upload, event: CANCEL, to: 'same' },
    { name: 'upload + RESET', from: upload, event: RESET, to: 'upload' },
    { name: 'upload + STEP_BACK upload', from: upload, event: BACK_UPLOAD, to: 'same' },
    { name: 'upload + STEP_BACK options', from: upload, event: BACK_OPTIONS, to: 'same' },
    // options (garment held)
    { name: 'options + PICK_GARMENT', from: options, event: PICK, to: 'same' },
    { name: 'options + START', from: options, event: START, to: 'generating' },
    { name: 'options + SUCCESS', from: options, event: SUCCESS, to: 'same' },
    { name: 'options + FAIL', from: options, event: FAIL, to: 'same' },
    { name: 'options + CANCEL', from: options, event: CANCEL, to: 'same' },
    { name: 'options + RESET', from: options, event: RESET, to: 'upload' },
    { name: 'options + STEP_BACK upload', from: options, event: BACK_UPLOAD, to: 'upload' },
    { name: 'options + STEP_BACK options', from: options, event: BACK_OPTIONS, to: 'same' },
    // generating (garment held)
    { name: 'generating + PICK_GARMENT', from: generating, event: PICK, to: 'same' },
    { name: 'generating + START', from: generating, event: START, to: 'same' },
    { name: 'generating + SUCCESS', from: generating, event: SUCCESS, to: 'result' },
    { name: 'generating + FAIL', from: generating, event: FAIL, to: 'options' },
    { name: 'generating + CANCEL', from: generating, event: CANCEL, to: 'options' },
    { name: 'generating + RESET', from: generating, event: RESET, to: 'upload' },
    { name: 'generating + STEP_BACK upload', from: generating, event: BACK_UPLOAD, to: 'same' },
    { name: 'generating + STEP_BACK options', from: generating, event: BACK_OPTIONS, to: 'same' },
    // generating after remount (no garment)
    { name: 'remounted generating + START', from: restoredGenerating, event: START, to: 'same' },
    { name: 'remounted generating + SUCCESS', from: restoredGenerating, event: SUCCESS, to: 'result' },
    { name: 'remounted generating + FAIL', from: restoredGenerating, event: FAIL, to: 'upload' },
    { name: 'remounted generating + CANCEL', from: restoredGenerating, event: CANCEL, to: 'upload' },
    // result (garment held)
    { name: 'result + PICK_GARMENT', from: resultWithGarment, event: PICK, to: 'same' },
    { name: 'result + START', from: resultWithGarment, event: START, to: 'generating' },
    { name: 'result + SUCCESS', from: resultWithGarment, event: SUCCESS, to: 'same' },
    { name: 'result + FAIL', from: resultWithGarment, event: FAIL, to: 'same' },
    { name: 'result + CANCEL', from: resultWithGarment, event: CANCEL, to: 'same' },
    { name: 'result + RESET', from: resultWithGarment, event: RESET, to: 'upload' },
    { name: 'result + STEP_BACK upload', from: resultWithGarment, event: BACK_UPLOAD, to: 'upload' },
    { name: 'result + STEP_BACK options', from: resultWithGarment, event: BACK_OPTIONS, to: 'options' },
    // result after remount (no garment)
    { name: 'remounted result + START', from: restoredResult, event: START, to: 'same' },
    { name: 'remounted result + STEP_BACK upload', from: restoredResult, event: BACK_UPLOAD, to: 'upload' },
    { name: 'remounted result + STEP_BACK options', from: restoredResult, event: BACK_OPTIONS, to: 'upload' },
  ]

  it.each(cases)('$name', ({ from, event, to }) => {
    const next = transitionTryOn(from, event)
    if (to === 'same') {
      expect(next).toBe(from)
    } else {
      expect(next.step).toBe(to)
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
