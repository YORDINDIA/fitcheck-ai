import { beforeEach, describe, expect, it } from 'vitest'
import { BATCH_INITIAL_STEP } from '../batchExtractionMachine'
import {
  initialState,
  resetBatchExtractionStore,
  useBatchExtractionStore,
} from '../batchExtractionStore'

describe('batch extraction store reset', () => {
  beforeEach(() => {
    resetBatchExtractionStore()
  })

  it('initial state starts at the machine initial step', () => {
    expect(initialState.step).toBe(BATCH_INITIAL_STEP)
    expect(initialState.step).toBe('select')
  })

  it('resetBatchExtractionStore returns the step to select and clears the job', () => {
    useBatchExtractionStore.setState({
      step: 'review',
      jobId: 'job-9',
      error: 'boom',
      images: [
        { imageId: 'img-1', file: new File(['x'], 'a.jpg'), previewUrl: '', status: 'completed' },
      ],
    })

    resetBatchExtractionStore()

    const state = useBatchExtractionStore.getState()
    expect(state.step).toBe('select')
    expect(state.jobId).toBeNull()
    expect(state.error).toBeNull()
    expect(state.images).toEqual([])
  })
})
