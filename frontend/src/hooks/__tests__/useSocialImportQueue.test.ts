import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { SocialImportJobData, SocialImportJobStatus, SocialImportSSEEvent } from '@/types'

const mocks = vi.hoisted(() => ({
  getSocialImportStatus: vi.fn(),
  createSocialImportSSEConnection: vi.fn(),
  getSocialImportOAuthConnectUrl: vi.fn(),
  openUpgradePrompt: vi.fn(),
}))

vi.mock('@/api/socialImport', () => ({
  API_BASE_URL: '',
  approveSocialImportPhoto: vi.fn(),
  cancelSocialImportJob: vi.fn(),
  createSocialImportSSEConnection: mocks.createSocialImportSSEConnection,
  getSocialImportOAuthConnectUrl: mocks.getSocialImportOAuthConnectUrl,
  getSocialImportStatus: mocks.getSocialImportStatus,
  patchSocialImportItem: vi.fn(),
  rejectSocialImportPhoto: vi.fn(),
  startSocialImportJob: vi.fn(),
  submitSocialImportOAuth: vi.fn(),
  submitSocialImportScraperLogin: vi.fn(),
}))

vi.mock('@/stores/upgradePromptStore', () => ({
  useUpgradePromptStore: { getState: () => ({ open: mocks.openUpgradePrompt }) },
}))

import { cancelSocialImportJob, startSocialImportJob } from '@/api/socialImport'
import { useSocialImportQueue } from '../useSocialImportQueue'

const JOB_KEY = 'fitcheck.socialImport.activeJobId'

function makeJob(status: SocialImportJobStatus, overrides: Partial<SocialImportJobData> = {}): SocialImportJobData {
  return {
    id: 'job-1',
    status,
    platform: 'instagram',
    source_url: 'https://instagram.com/example',
    normalized_url: 'https://instagram.com/example',
    total_photos: 0,
    discovered_photos: 0,
    processed_photos: 0,
    approved_photos: 0,
    rejected_photos: 0,
    failed_photos: 0,
    auth_required: status === 'awaiting_auth',
    discovery_completed: false,
    queued_count: 0,
    ...overrides,
  }
}

let sseHandler: ((event: SocialImportSSEEvent) => void) | null = null

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mountWithJob(status: SocialImportJobStatus) {
  mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob(status))
  const hook = renderHook(() => useSocialImportQueue())
  await waitFor(() => expect(hook.result.current.state.status).toBe(status))
  return hook
}

function openPopup() {
  const popup = { closed: false, focus: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  mocks.getSocialImportOAuthConnectUrl.mockResolvedValue({ auth_url: 'https://example.com/oauth' })
}

function postOAuthMessage(data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      data: { source: 'fitcheck-social-oauth', job_id: 'job-1', ...data },
    })
  )
}

function installMemoryStorage(): void {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key) },
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
}

describe('useSocialImportQueue', () => {
  beforeEach(() => {
    installMemoryStorage()
    window.localStorage.clear()
    window.localStorage.setItem(JOB_KEY, 'job-1')
    sseHandler = null
    mocks.getSocialImportStatus.mockReset()
    mocks.getSocialImportOAuthConnectUrl.mockReset()
    mocks.openUpgradePrompt.mockReset()
    mocks.createSocialImportSSEConnection.mockReset()
    mocks.createSocialImportSSEConnection.mockImplementation(
      (_jobId: string, onEvent: (event: SocialImportSSEEvent) => void) => {
        sseHandler = onEvent
        return vi.fn()
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a terminal job terminal when a later stale snapshot reports processing', async () => {
    const { result } = await mountWithJob('awaiting_auth')

    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('completed'))
    await act(async () => { sseHandler!({ type: 'job_completed', data: {} }) })
    await waitFor(() => expect(result.current.state.status).toBe('completed'))

    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('processing'))
    await act(async () => { sseHandler!({ type: 'job_updated', data: {} }) })
    await flush()

    expect(mocks.getSocialImportStatus).toHaveBeenCalledTimes(3)
    expect(result.current.state.status).toBe('completed')
    expect(result.current.state.job?.status).toBe('completed')
  })

  it('moves awaiting_auth to processing when the OAuth callback reports success', async () => {
    const { result } = await mountWithJob('awaiting_auth')
    let resolveRefresh!: (job: SocialImportJobData) => void
    mocks.getSocialImportStatus.mockImplementationOnce(
      () => new Promise<SocialImportJobData>((resolve) => { resolveRefresh = resolve })
    )
    openPopup()

    let flow!: Promise<void>
    act(() => { flow = result.current.startOAuthConnect() })
    await waitFor(() => expect(window.open).toHaveBeenCalled())
    postOAuthMessage({ status: 'success', message: 'Account connected. Import resumed.' })

    // Wait for the refresh request, then let the server answer before asserting.
    await waitFor(() => expect(mocks.getSocialImportStatus).toHaveBeenCalledTimes(2))
    await act(async () => {
      resolveRefresh(makeJob('processing'))
      await flow
    })

    expect(result.current.state.status).toBe('processing')
    expect(result.current.state.authRequired).toBe(false)
    // Only applyJobData writes job.auth_required, so this proves the refresh landed.
    expect(result.current.state.job?.auth_required).toBe(false)
  })

  it('does not change status when the OAuth callback reports an error', async () => {
    const { result } = await mountWithJob('awaiting_auth')
    openPopup()

    let flow!: Promise<void>
    act(() => { flow = result.current.startOAuthConnect() })
    await waitFor(() => expect(window.open).toHaveBeenCalled())
    postOAuthMessage({ status: 'error', message: 'Access denied' })
    await act(async () => { await flow })

    expect(result.current.state.status).toBe('awaiting_auth')
    expect(result.current.state.error).toBe('Access denied')
    expect(mocks.getSocialImportStatus).toHaveBeenCalledTimes(1)
  })

  it('opens the upgrade prompt once per paused_rate_limited period', async () => {
    await mountWithJob('paused_rate_limited')
    expect(mocks.openUpgradePrompt).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 2; i += 1) {
      mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('paused_rate_limited'))
      await act(async () => { sseHandler!({ type: 'rate_limit_paused', data: {} }) })
      await flush()
    }
    expect(mocks.openUpgradePrompt).toHaveBeenCalledTimes(1)

    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('processing'))
    await act(async () => { sseHandler!({ type: 'job_updated', data: {} }) })
    await flush()

    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('paused_rate_limited'))
    await act(async () => { sseHandler!({ type: 'rate_limit_paused', data: {} }) })
    await flush()
    expect(mocks.openUpgradePrompt).toHaveBeenCalledTimes(2)
  })

  it('keeps a completed job completed when cancel is requested', async () => {
    const { result } = await mountWithJob('completed')
    vi.mocked(cancelSocialImportJob).mockResolvedValueOnce(undefined as never)
    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('completed'))

    await act(async () => { await result.current.cancelJob() })
    await flush()

    expect(cancelSocialImportJob).toHaveBeenCalledWith('job-1')
    expect(result.current.state.status).toBe('completed')
    expect(result.current.state.job?.status).toBe('completed')
  })

  it('refreshes and shows the real status when cancel returns 409 for a finished job', async () => {
    const { result } = await mountWithJob('processing')
    vi.mocked(cancelSocialImportJob).mockRejectedValueOnce({ status: 409 } as never)
    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('completed'))

    await act(async () => { await result.current.cancelJob() })
    await flush()

    expect(result.current.state.status).toBe('completed')
    expect(result.current.state.job?.status).toBe('completed')
  })

  it('keeps the terminal payload when a stale snapshot arrives after completion', async () => {
    const { result } = await mountWithJob('awaiting_auth')

    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('completed'))
    await act(async () => { sseHandler!({ type: 'job_completed', data: {} }) })
    await waitFor(() => expect(result.current.state.status).toBe('completed'))

    // Out-of-order snapshot from before completion still reports auth required.
    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('awaiting_auth'))
    await act(async () => { sseHandler!({ type: 'job_updated', data: {} }) })
    await flush()

    expect(result.current.state.status).toBe('completed')
    expect(result.current.state.authRequired).toBe(false)
    expect(result.current.state.job?.auth_required).toBe(false)
  })

  it('does not carry a terminal status from job A into a new job B', async () => {
    const { result } = await mountWithJob('completed')
    vi.mocked(startSocialImportJob).mockResolvedValueOnce({ job_id: 'job-2' } as never)
    mocks.getSocialImportStatus.mockResolvedValueOnce(makeJob('created', { id: 'job-2' }))

    await act(async () => { await result.current.startJob('https://instagram.com/new') })
    await flush()

    expect(result.current.state.jobId).toBe('job-2')
    expect(result.current.state.job?.id).toBe('job-2')
    expect(result.current.state.status).toBe('created')
    expect(window.localStorage.getItem(JOB_KEY)).toBe('job-2')
  })
})
