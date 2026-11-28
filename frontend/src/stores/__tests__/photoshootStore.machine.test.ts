import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPhotoshootUsage: vi.fn(),
  startPhotoshootJob: vi.fn(),
  getPhotoshootJobStatus: vi.fn(),
  cancelPhotoshootJob: vi.fn(),
  subscribeToPhotoshootEvents: vi.fn(),
}))

vi.mock('@/api/photoshoot', () => ({
  getPhotoshootUsage: mocks.getPhotoshootUsage,
  startPhotoshootJob: mocks.startPhotoshootJob,
  getPhotoshootJobStatus: mocks.getPhotoshootJobStatus,
  cancelPhotoshootJob: mocks.cancelPhotoshootJob,
  subscribeToPhotoshootEvents: mocks.subscribeToPhotoshootEvents,
}))
vi.mock('@/lib/replayable-preview', () => ({
  fileToReplayablePreview: vi.fn(async () => 'data:image/png;base64,AAAA'),
}))
vi.mock('@/lib/utils', () => ({
  fileToBase64: vi.fn(async () => 'AAAA'),
}))
vi.mock('@/lib/analytics', () => ({
  ensureSessionRecording: vi.fn(),
  setPersonProperties: vi.fn(),
  trackEvent: vi.fn(),
}))

import { usePhotoshootStore } from '../photoshootStore'

describe('photoshoot store step transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPhotoshootUsage.mockImplementation(() => new Promise(() => undefined))
    usePhotoshootStore.getState().reset()
    usePhotoshootStore.setState({
      usage: { remaining: 10 } as never,
      error: null,
      currentStep: 'configure',
    })
    usePhotoshootStore.getState().addPhotos([new File(['x'], 'look.png', { type: 'image/png' })])
  })

  it('keeps a failed start on the generating step with the error shown there', async () => {
    mocks.startPhotoshootJob.mockRejectedValue(new Error('Upstream exploded'))

    const result = await usePhotoshootStore.getState().generate()

    const state = usePhotoshootStore.getState()
    expect(result).toBeNull()
    expect(state.currentStep).toBe('generating')
    expect(state.isGenerating).toBe(false)
    expect(state.statusMessage).toBe('Generation failed')
    expect(state.error).toBeTruthy()
  })

  it('setStep rejects an illegal back-step from generating to upload', () => {
    usePhotoshootStore.setState({ currentStep: 'generating' })

    usePhotoshootStore.getState().setStep('upload')

    expect(usePhotoshootStore.getState().currentStep).toBe('generating')
  })

  it('generate from the upload step starts no run', async () => {
    usePhotoshootStore.setState({
      currentStep: 'upload',
      usage: { remaining: 10 } as never,
    })

    const result = await usePhotoshootStore.getState().generate()

    expect(result).toBeNull()
    expect(mocks.startPhotoshootJob).not.toHaveBeenCalled()
    expect(usePhotoshootStore.getState().currentStep).toBe('upload')
    expect(usePhotoshootStore.getState().isGenerating).toBe(false)
  })

  it('setStep accepts configure -> upload', () => {
    usePhotoshootStore.setState({ currentStep: 'configure' })

    usePhotoshootStore.getState().setStep('upload')

    expect(usePhotoshootStore.getState().currentStep).toBe('upload')
  })

  it('keeps a run that completed during cancel on the results step', async () => {
    usePhotoshootStore.setState({ currentStep: 'generating', isGenerating: true, jobId: 'job-1' })
    mocks.cancelPhotoshootJob.mockImplementationOnce(async () => {
      // The run finishes while the cancel request is in flight.
      usePhotoshootStore.setState({ isGenerating: false, currentStep: 'results' })
    })

    await usePhotoshootStore.getState().cancelGeneration()

    expect(usePhotoshootStore.getState().currentStep).toBe('results')
    expect(usePhotoshootStore.getState().isGenerating).toBe(false)
  })
})
