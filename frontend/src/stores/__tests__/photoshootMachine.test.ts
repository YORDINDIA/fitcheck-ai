import { describe, expect, it } from 'vitest'
import { canTransition, transition, type PhotoshootStep } from '../photoshootMachine'

const STEPS: PhotoshootStep[] = ['upload', 'configure', 'generating', 'results']

// Legal edges when the run is idle (running: false, cancel: false).
const LEGAL_IDLE: Array<[PhotoshootStep, PhotoshootStep]> = [
  ['upload', 'configure'],
  ['configure', 'upload'],
  ['configure', 'generating'],
  ['generating', 'results'],
  ['generating', 'generating'],
  ['generating', 'configure'],
  ['results', 'configure'],
  ['results', 'upload'],
]

describe('photoshoot step machine (idle)', () => {
  it.each(LEGAL_IDLE)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
    expect(transition(from, to)).toBe(to)
  })

  it('rejects every other pair', () => {
    const legal = new Set(LEGAL_IDLE.map(([f, t]) => f + '>' + t))
    const illegal = STEPS.flatMap((from) => STEPS.map((to) => [from, to] as const)).filter(
      ([from, to]) => !legal.has(from + '>' + to)
    )
    expect(illegal).toHaveLength(16 - LEGAL_IDLE.length)
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false)
      expect(transition(from, to)).toBe(from)
    }
  })

  it('rejects a back-step from generating to upload', () => {
    expect(canTransition('generating', 'upload')).toBe(false)
  })
})

describe('photoshoot step machine (run in flight)', () => {
  it('rejects a second start while running (generating -> generating)', () => {
    expect(canTransition('generating', 'generating', { running: true })).toBe(false)
  })

  it('rejects a back-step to configure while running', () => {
    expect(canTransition('generating', 'configure', { running: true })).toBe(false)
    expect(transition('generating', 'configure', { running: true })).toBe('generating')
  })

  it('allows cancel (generating -> configure) while running', () => {
    expect(canTransition('generating', 'configure', { running: true, cancel: true })).toBe(true)
  })

  it('allows completion while running', () => {
    expect(canTransition('generating', 'results', { running: true })).toBe(true)
  })

  it('rejects starting from configure while a run is in flight', () => {
    expect(canTransition('configure', 'generating', { running: true })).toBe(false)
  })
})
