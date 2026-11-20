import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  onEvent: undefined as undefined | ((event: { type: string; data: unknown }) => void),
  cancelBatchJob: vi.fn(),
}))

vi.mock('../useBatchSSE', () => ({
  useBatchSSE: (options: { onEvent: (event: { type: string; data: unknown }) => void }) => {
    mocks.onEvent = options.onEvent
    return { isConnected: false, disconnect: () => {} }
  },
}))

vi.mock('@/api/batch', () => ({
  startBatchExtractionMultipart: vi.fn(),
  cancelBatchJob: mocks.cancelBatchJob,
  getBatchJobStatus: vi.fn(),
}))

import useBatchExtraction from '../useBatchExtraction'
import { resetBatchExtractionStore, useBatchExtractionStore } from '@/stores/batchExtractionStore'

const JOB = 'job-1'
const TS = '2025-01-01T00:00:00Z'

function emit(type: string, data: Record<string, unknown> = {}) {
  act(() => {
    mocks.onEvent?.({ type, data: { job_id: JOB, timestamp: TS, ...data } })
  })
}

const extractedItem = {
  temp_id: 't1',
  category: 'tops',
  colors: ['blue'],
  confidence: 0.9,
  status: 'detected',
}

function imageExtractionComplete() {
  emit('image_extraction_complete', {
    image_id: 'img-1',
    items: [extractedItem],
    items_count: 1,
    completed_count: 1,
    total_images: 1,
  })
}

function generationStarted() {
  emit('generation_started', { total_items: 1, batch_size: 5, total_batches: 1 })
}

function itemGenerationComplete() {
  emit('item_generation_complete', {
    temp_id: 't1',
    image_id: 'img-1',
    generated_image_url: 'https://cdn.example/t1.png',
    completed_count: 1,
    total_items: 1,
  })
}

const step = () => useBatchExtractionStore.getState().step
const itemStatus = () =>
  useBatchExtractionStore.getState().allDetectedItems.find((i) => i.tempId === 't1')?.status

describe('useBatchExtraction step and replay guards', () => {
  let hook: { current: ReturnType<typeof useBatchExtraction> }

  beforeEach(() => {
    resetBatchExtractionStore()
    mocks.cancelBatchJob.mockReset().mockResolvedValue(undefined)
    URL.revokeObjectURL = vi.fn()
    useBatchExtractionStore.setState({
      step: 'extracting',
      jobId: JOB,
      images: [
        {
          imageId: 'img-1',
          file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
          previewUrl: '',
          status: 'extracting',
        },
      ],
    })
    hook = renderHook(() => useBatchExtraction()).result
  })

  afterEach(() => {
    resetBatchExtractionStore()
  })

  it('a replayed extraction_started cannot pull review back to extracting', () => {
    imageExtractionComplete()
    expect(step()).toBe('review')

    emit('extraction_started', { total_images: 1 })

    expect(step()).toBe('review')
  })

  it('a replayed extraction_started cannot interrupt saving', () => {
    imageExtractionComplete()
    act(() => hook.current.proceedToSaving())
    expect(step()).toBe('saving')

    emit('extraction_started', { total_images: 1 })

    expect(step()).toBe('saving')
  })

  it('a replayed image_extraction_complete cannot move a generating item back to detected', () => {
    imageExtractionComplete()
    generationStarted()
    expect(itemStatus()).toBe('generating')

    imageExtractionComplete()

    expect(itemStatus()).toBe('generating')
    expect(useBatchExtractionStore.getState().allDetectedItems).toHaveLength(1)
  })

  it('a replayed image_extraction_complete cannot move a generated item back to detected', () => {
    imageExtractionComplete()
    generationStarted()
    itemGenerationComplete()
    expect(itemStatus()).toBe('generated')

    imageExtractionComplete()

    expect(itemStatus()).toBe('generated')
    expect(step()).toBe('review')
  })

  it('proceedToSaving is rejected outside review', () => {
    act(() => hook.current.proceedToSaving())
    expect(step()).toBe('extracting')
  })

  it('job_cancelled returns the step to select', () => {
    imageExtractionComplete()
    emit('job_cancelled')
    expect(step()).toBe('select')
  })

  it('cancel() resets the store to the select step', async () => {
    imageExtractionComplete()
    await act(async () => {
      await hook.current.cancel()
    })
    const state = useBatchExtractionStore.getState()
    expect(state.step).toBe('select')
    expect(state.jobId).toBeNull()
    expect(state.allDetectedItems).toEqual([])
    expect(state.images).toEqual([])
  })

  it('reset() (save complete path) returns the store to the select step', () => {
    imageExtractionComplete()
    act(() => hook.current.reset())
    expect(step()).toBe('select')
    expect(useBatchExtractionStore.getState().jobId).toBeNull()
  })
})

function serverItem(status: string, extra: Record<string, unknown> = {}) {
  return {
    temp_id: 't1',
    image_id: 'img-1',
    category: 'tops',
    colors: ['blue'],
    confidence: 0.9,
    status,
    ...extra,
  }
}

function jobComplete(items: Record<string, unknown>[]) {
  emit('job_complete', { items, total_items: items.length, status: 'completed' })
}

describe('useBatchExtraction merge with server snapshots', () => {
  let hook: { current: ReturnType<typeof useBatchExtraction> }

  beforeEach(() => {
    resetBatchExtractionStore()
    mocks.cancelBatchJob.mockReset().mockResolvedValue(undefined)
    URL.revokeObjectURL = vi.fn()
    useBatchExtractionStore.setState({
      step: 'extracting',
      jobId: JOB,
      images: [
        {
          imageId: 'img-1',
          file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
          previewUrl: '',
          status: 'extracting',
        },
      ],
    })
    hook = renderHook(() => useBatchExtraction()).result
  })

  afterEach(() => {
    resetBatchExtractionStore()
  })

  it('a stale server item at detected cannot move a local generated item back to detected', () => {
    imageExtractionComplete()
    generationStarted()
    itemGenerationComplete()
    expect(itemStatus()).toBe('generated')

    jobComplete([serverItem('detected')])

    expect(itemStatus()).toBe('generated')
    expect(useBatchExtractionStore.getState().allDetectedItems[0].generatedImageUrl).toBe(
      'https://cdn.example/t1.png'
    )
  })

  it('a stale server item at detected cannot move a local failed item back to detected', () => {
    imageExtractionComplete()
    generationStarted()
    emit('item_generation_failed', {
      temp_id: 't1',
      image_id: 'img-1',
      error: 'boom',
      completed_count: 0,
      failed_count: 1,
      total_items: 1,
    })
    expect(itemStatus()).toBe('failed')

    jobComplete([serverItem('detected')])

    expect(itemStatus()).toBe('failed')
  })

  it('a server item at generated moves a local detected item forward to generated', () => {
    imageExtractionComplete()
    expect(itemStatus()).toBe('detected')

    jobComplete([
      serverItem('generated', { generated_image_url: 'https://cdn.example/t1.png' }),
    ])

    expect(itemStatus()).toBe('generated')
  })

  it('a user-deleted item stays deleted after a merge with any server status', () => {
    imageExtractionComplete()
    act(() => hook.current.deleteItem('t1'))
    expect(itemStatus()).toBe('deleted')

    for (const status of ['detected', 'generating', 'generated', 'failed']) {
      jobComplete([serverItem(status, status === 'generated' ? { generated_image_url: 'https://cdn.example/t1.png' } : {})])
      expect(itemStatus()).toBe('deleted')
    }
  })
})
