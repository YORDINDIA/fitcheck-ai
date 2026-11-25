import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

// The global error interceptor reports through these helpers. Mock them so the
// tests can count toasts for one failed request.
vi.mock('@/lib/toast-utils', () => ({
  showApiError: vi.fn(),
  showWarning: vi.fn(),
  showNetworkError: vi.fn(),
}))

import { apiClient } from '@/api/client'
import { getPublicOutfit } from '@/api/outfits'
import { showApiError } from '@/lib/toast-utils'

describe('getPublicOutfit', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    vi.clearAllMocks()
  })

  afterEach(() => {
    mock.restore()
  })

  it('does not toast a missing shared outfit, because the page renders its own error', async () => {
    mock.onGet('/api/v1/outfits/public/missing').reply(404, { detail: 'Shared outfit not found' })

    await expect(getPublicOutfit('missing')).rejects.toBeDefined()
    expect(showApiError).not.toHaveBeenCalled()
  })

  it('control: the global handler still toasts a 404 on other requests', async () => {
    mock.onGet('/api/v1/outfits/private/missing').reply(404, { detail: 'Not found' })

    await expect(apiClient.get('/api/v1/outfits/private/missing')).rejects.toBeDefined()
    expect(showApiError).toHaveBeenCalledTimes(1)
  })
})
