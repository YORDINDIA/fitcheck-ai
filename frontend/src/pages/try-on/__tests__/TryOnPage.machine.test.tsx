/**
 * Page-level behaviour of the try-on state machine: cancel, remount-restore
 * failure, and the single-request guard. Pure transition rules live in
 * tryOnMachine.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

let dropClothes: ((file: File) => void) | null = null

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:test-stub'
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {}
  }
})

vi.mock('react-dropzone', () => ({
  useDropzone: (opts: { onDrop: (files: File[]) => void }) => {
    dropClothes = (file: File) => opts.onDrop([file])
    return {
      getRootProps: () => ({ 'data-testid': 'dropzone' }),
      getInputProps: () => ({}),
      isDragActive: false,
    }
  },
}))

vi.mock('@/api/ai', () => ({ generateTryOn: vi.fn() }))
vi.mock('@/api/users', () => ({ uploadAvatar: vi.fn() }))
vi.mock('@/api/images', () => ({ getPresignedUrl: vi.fn() }))
vi.mock('@/lib/replayable-preview', () => ({
  fileToReplayablePreview: async () => 'data:image/jpeg;base64,preview',
}))

const authState = { setUser: vi.fn(), user: { id: 'u1' } }
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
  useCurrentUser: () => authState.user,
  useUserAvatar: () => 'https://example.test/avatar.png',
}))

import { generateTryOn } from '@/api/ai'
import { useJobUiStore } from '@/stores/jobUiStore'
import TryOnPage from '@/pages/try-on/TryOnPage'

const RESULT = {
  image_base64: '',
  image_url: 'https://cdn.test/result.webp',
  storage_path: 'generated/u1/try-on/abc.webp',
}

async function reachOptionsStep() {
  render(<TryOnPage />)
  expect(dropClothes).toBeTruthy()
  await act(async () => {
    dropClothes!(new File(['x'], 'cloth.png', { type: 'image/png' }))
  })
  await screen.findByRole('button', { name: /Generate Try-On/i })
}

beforeEach(() => {
  vi.clearAllMocks()
  useJobUiStore.setState({ job: null })
  dropClothes = null
})

describe('TryOnPage state machine', () => {
  it('Cancel on the generating surface returns to Options with the garment kept', async () => {
    vi.mocked(generateTryOn).mockImplementation(() => new Promise(() => {}) as never)

    await reachOptionsStep()
    fireEvent.click(screen.getByRole('button', { name: /Generate Try-On/i }))
    expect(await screen.findByText(/Generating your try-on/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))

    expect(await screen.findByRole('button', { name: /Generate Try-On/i })).toBeTruthy()
    expect(screen.queryByText(/Generating your try-on/i)).toBeNull()
    expect(useJobUiStore.getState().job).toBeNull()
  })

  it('a second Generate click while a run is in flight issues one request', async () => {
    vi.mocked(generateTryOn).mockImplementation(() => new Promise(() => {}) as never)

    await reachOptionsStep()
    const button = screen.getByRole('button', { name: /Generate Try-On/i })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(await screen.findByText(/Generating your try-on/i)).toBeTruthy()
    expect(generateTryOn).toHaveBeenCalledTimes(1)
  })

  it('a failed run that resolves on a remounted page shows its error on Upload', async () => {
    // Current code: the live instance unwedges to Upload with no message, a
    // silent failure. Required: the error text is visible.
    let rejectGen: ((e: unknown) => void) | null = null
    vi.mocked(generateTryOn).mockImplementation(
      () => new Promise((_res, rej) => { rejectGen = rej }) as never
    )

    const first = render(<TryOnPage />)
    await act(async () => {
      dropClothes!(new File(['x'], 'cloth.png', { type: 'image/png' }))
    })
    await screen.findByRole('button', { name: /Generate Try-On/i })
    fireEvent.click(screen.getByRole('button', { name: /Generate Try-On/i }))
    expect(await screen.findByText(/Generating your try-on/i)).toBeTruthy()

    first.unmount()
    render(<TryOnPage />)
    expect(await screen.findByText(/Generating your try-on/i)).toBeTruthy()

    await act(async () => {
      rejectGen!(Object.assign(new Error('Unexpected response format from image generation API'), {
        code: 'UNEXPECTED_RESPONSE_FORMAT',
      }))
    })

    await waitFor(() => {
      expect(screen.queryByText(/Generating your try-on/i)).toBeNull()
    })
    expect(await screen.findByText(/unexpected response format/i)).toBeTruthy()
    expect(useJobUiStore.getState().job).toBeNull()
  })

  it('a successful run that resolves after a cancel does not land a result', async () => {
    let resolveGen: ((v: typeof RESULT) => void) | null = null
    vi.mocked(generateTryOn).mockImplementation(
      () => new Promise((res) => { resolveGen = res }) as never
    )

    await reachOptionsStep()
    fireEvent.click(screen.getByRole('button', { name: /Generate Try-On/i }))
    expect(await screen.findByText(/Generating your try-on/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
    expect(await screen.findByRole('button', { name: /Generate Try-On/i })).toBeTruthy()

    await act(async () => {
      resolveGen!(RESULT)
    })

    expect(screen.queryByText(/Your Try-On Result/i)).toBeNull()
    expect(screen.getByRole('button', { name: /Generate Try-On/i })).toBeTruthy()
  })
})
