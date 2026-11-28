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

vi.mock('@/lib/analytics', () => ({
  ensureSessionRecording: vi.fn(),
  setPersonProperties: vi.fn(),
  trackEvent: vi.fn(),
}))

import { usePhotoshootStore } from '../photoshootStore'

const image = (index: number) => ({
  id: `img_${index}`,
  index,
  image_url: `https://cdn.example/${index}.png`,
})

describe('photoshoot poll fallback', () => {
  beforeEach(() => {
    mocks.getPhotoshootUsage.mockReset()
    mocks.startPhotoshootJob.mockReset()
    mocks.getPhotoshootJobStatus.mockReset()
    mocks.cancelPhotoshootJob.mockReset()
    mocks.subscribeToPhotoshootEvents.mockReset()
    mocks.getPhotoshootUsage.mockImplementation(() => new Promise(() => undefined))
    usePhotoshootStore.getState().reset()
    usePhotoshootStore.setState({ usage: null, error: null })
  })

  it.each(['complete', 'completed'])('settles the run to results when polling reports "%s"', async (wire) => {
    mocks.startPhotoshootJob.mockResolvedValue({ job_id: 'job-1', status: 'pending', message: '' })
    mocks.subscribeToPhotoshootEvents.mockImplementation(
      (_jobId: string, _onMessage: unknown, onError?: (error: Error) => void) => {
        setTimeout(() => onError?.(new Error('stream dropped')), 0)
        return () => undefined
      }
    )
    mocks.getPhotoshootJobStatus.mockResolvedValue({
      job_id: 'job-1',
      status: wire,
      generated_count: 2,
      failed_count: 0,
      failed_indices: [],
      partial_success: false,
      total_count: 2,
      current_batch: 1,
      total_batches: 1,
      images: [image(0), image(1)],
      usage: null,
      error: null,
    })
    usePhotoshootStore.setState({
      currentStep: 'configure',
      photos: [new File(['image'], 'look.png', { type: 'image/png' })],
      usage: { used_today: 0, limit_today: 10, remaining: 10, plan_type: 'free' },
    })

    await usePhotoshootStore.getState().generate()

    expect(usePhotoshootStore.getState().currentStep).toBe('results')
    expect(usePhotoshootStore.getState().generatedImages).toHaveLength(2)
    expect(usePhotoshootStore.getState().isGenerating).toBe(false)
  })
})
