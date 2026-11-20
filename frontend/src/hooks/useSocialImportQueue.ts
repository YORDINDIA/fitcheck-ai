import { useCallback, useEffect, useRef, useState } from 'react'
import {
  approveSocialImportPhoto,
  API_BASE_URL,
  cancelSocialImportJob,
  createSocialImportSSEConnection,
  getSocialImportOAuthConnectUrl,
  getSocialImportStatus,
  patchSocialImportItem,
  rejectSocialImportPhoto,
  startSocialImportJob,
  submitSocialImportOAuth,
  submitSocialImportScraperLogin,
} from '@/api/socialImport'
import type { SocialImportJobData, SocialImportItem, SocialImportSSEEvent } from '@/types'
import { useUpgradePromptStore } from '@/stores/upgradePromptStore'
import {
  canTransition,
  isTerminalSocialImportStatus,
  resolveSocialImportStatus,
} from './socialImportMachine'

const SOCIAL_IMPORT_ACTIVE_JOB_KEY = 'fitcheck.socialImport.activeJobId'
const SOCIAL_IMPORT_OAUTH_MESSAGE_SOURCE = 'fitcheck-social-oauth'
const SOCIAL_IMPORT_OAUTH_WINDOW_NAME = 'fitcheck-social-import-oauth'

interface SocialImportQueueState {
  jobId: string | null
  job: SocialImportJobData | null
  awaitingPhotoId: string | null
  bufferedPhotoId: string | null
  processingPhotoId: string | null
  status: SocialImportJobData['status'] | null
  authRequired: boolean
  isConnected: boolean
  lastEventId: number | null
  isLoading: boolean
  error: string | null
}

const initialState: SocialImportQueueState = {
  jobId: null,
  job: null,
  awaitingPhotoId: null,
  bufferedPhotoId: null,
  processingPhotoId: null,
  status: null,
  authRequired: false,
  isConnected: false,
  lastEventId: null,
  isLoading: false,
  error: null,
}

function setActiveJobId(jobId: string | null): void {
  if (typeof window === 'undefined') return
  if (!jobId) {
    window.localStorage.removeItem(SOCIAL_IMPORT_ACTIVE_JOB_KEY)
    return
  }
  window.localStorage.setItem(SOCIAL_IMPORT_ACTIVE_JOB_KEY, jobId)
}

export interface UseSocialImportQueue {
  state: SocialImportQueueState
  startJob: (sourceUrl: string) => Promise<void>
  startOAuthConnect: () => Promise<void>
  refreshStatus: () => Promise<void>
  submitOAuthAuth: (payload: {
    provider_access_token: string
    provider_refresh_token?: string
    provider_user_id?: string
    expires_at?: string
  }) => Promise<void>
  submitScraperAuth: (payload: { username: string; password: string; otp_code?: string }) => Promise<void>
  updateItem: (photoId: string, itemId: string, updates: Partial<SocialImportItem>) => Promise<void>
  approveAwaiting: () => Promise<import('@/api/socialImport').ApprovedSavedItem[]>
  rejectAwaiting: () => Promise<void>
  cancelJob: () => Promise<void>
  reset: (options?: { cancelActiveJob?: boolean }) => Promise<void>
}

export function useSocialImportQueue(): UseSocialImportQueue {
  const [state, setState] = useState<SocialImportQueueState>(initialState)
  const disconnectRef = useRef<(() => void) | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)
  const lastEventIdRef = useRef<number | null>(null)
  // Tracks whether we've already shown the plan-limit upgrade prompt for the
  // current paused_rate_limited period (avoids re-prompting on each status poll).
  const rateLimitPromptedRef = useRef(false)
  // Mirrors state.status synchronously so callbacks read the status that was
  // last applied, not a stale render closure.
  const statusRef = useRef<SocialImportJobData['status'] | null>(null)

  const applyJobData = useCallback((incoming: SocialImportJobData) => {
    // Terminal states are sticky: a late snapshot cannot revive a finished job.
    const status = resolveSocialImportStatus(statusRef.current, incoming.status)
    const job: SocialImportJobData = status === incoming.status ? incoming : { ...incoming, status }
    statusRef.current = status
    const terminal = isTerminalSocialImportStatus(status)
    setActiveJobId(terminal ? null : job.id)
    // paused_rate_limited = the user hit THEIR OWN plan limit (app-level daily
    // cap). That's the "show upgrade" condition. Dedupe so repeated status
    // polls don't re-open the dialog. (Upstream AI capacity is a different,
    // non-upsell path handled in the batch flow.)
    if (status === 'paused_rate_limited') {
      if (!rateLimitPromptedRef.current) {
        rateLimitPromptedRef.current = true
        useUpgradePromptStore.getState().open('rate_limit', job.error_message)
      }
    } else {
      rateLimitPromptedRef.current = false
    }
    setState((prev) => ({
      ...prev,
      jobId: job.id,
      job,
      status,
      authRequired: job.auth_required || status === 'awaiting_auth',
      awaitingPhotoId: job.awaiting_review_photo?.id || null,
      bufferedPhotoId: job.buffered_photo?.id || null,
      processingPhotoId: job.processing_photo?.id || null,
      error: job.error_message || null,
    }))
  }, [])

  // Applies a local, client-side transition the server has not confirmed yet
  // (for example, OAuth success resumes the job). Illegal edges are ignored.
  // The next server snapshot overwrites the optimistic value.
  const applyOptimisticStatus = useCallback((next: SocialImportJobData['status']) => {
    const current = statusRef.current
    if (!current || !canTransition(current, next)) return
    statusRef.current = next
    setState((prev) => ({
      ...prev,
      status: next,
      job: prev.job ? { ...prev.job, status: next } : prev.job,
      authRequired: next === 'awaiting_auth',
    }))
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (disconnectRef.current) {
      disconnectRef.current()
      disconnectRef.current = null
    }
    setState((prev) => ({ ...prev, isConnected: false }))
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!state.jobId) return
    const job = await getSocialImportStatus(state.jobId)
    applyJobData(job)
  }, [applyJobData, state.jobId])

  const connect = useCallback(
    (jobId: string) => {
      disconnect()

      disconnectRef.current = createSocialImportSSEConnection(
        jobId,
        (event: SocialImportSSEEvent) => {
          reconnectAttempts.current = 0
          if (typeof event.id === 'number') {
            lastEventIdRef.current = event.id
          }
          setState((prev) => ({
            ...prev,
            isConnected: true,
            lastEventId: event.id ?? prev.lastEventId,
          }))

          if (event.type === 'heartbeat') {
            return
          }

          if (event.type === 'connected') {
            return
          }

          // Keep client state authoritative by re-fetching compact status snapshot.
          void getSocialImportStatus(jobId)
            .then((job) => {
              applyJobData(job)
              if (isTerminalSocialImportStatus(job.status)) {
                disconnect()
              }
            })
            .catch((err) => {
              setState((prev) => ({
                ...prev,
                error: err instanceof Error ? err.message : 'Failed to refresh status',
              }))
            })
        },
        (error) => {
          setState((prev) => ({
            ...prev,
            isConnected: false,
            error: error.message,
          }))

          if (reconnectAttempts.current < 3) {
            reconnectAttempts.current += 1
            if (reconnectTimerRef.current !== null && typeof window !== 'undefined') {
              window.clearTimeout(reconnectTimerRef.current)
            }
            reconnectTimerRef.current = window.setTimeout(
              () => connect(jobId),
              1000 * reconnectAttempts.current
            )
          }
        },
        lastEventIdRef.current ?? undefined
      )
    },
    [applyJobData, disconnect]
  )

  const startJob = useCallback(
    async (sourceUrl: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }))
      try {
        const started = await startSocialImportJob(sourceUrl)
        const jobId = started.job_id
        setActiveJobId(jobId)
        const job = await getSocialImportStatus(jobId)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          jobId,
        }))
        applyJobData(job)
        reconnectAttempts.current = 0
        connect(jobId)
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to start import',
        }))
      }
    },
    [applyJobData, connect]
  )

  const startOAuthConnect = useCallback(async () => {
    if (!state.jobId) return

    const jobId = state.jobId
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const oauth = await getSocialImportOAuthConnectUrl(jobId)
      const popup = window.open(
        oauth.auth_url,
        SOCIAL_IMPORT_OAUTH_WINDOW_NAME,
        'width=520,height=740'
      )
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups to connect your social account.')
      }
      popup.focus()

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const expectedOrigin =
          API_BASE_URL === ''
            ? window.location.origin
            : new URL(API_BASE_URL).origin

        const cleanup = () => {
          if (settled) return
          settled = true
          window.clearTimeout(timeoutId)
          window.clearInterval(closePollId)
          window.removeEventListener('message', onMessage)
        }

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== expectedOrigin) return

          const data = event.data as Record<string, unknown> | null
          if (!data || data.source !== SOCIAL_IMPORT_OAUTH_MESSAGE_SOURCE) return

          const eventJobId = typeof data.job_id === 'string' ? data.job_id : null
          if (eventJobId && eventJobId !== jobId) return

          cleanup()

          const oauthStatus = typeof data.status === 'string' ? data.status : 'error'
          const message =
            typeof data.message === 'string'
              ? data.message
              : 'Social account authorization failed'
          if (oauthStatus === 'success') {
            resolve()
            return
          }
          reject(new Error(message))
        }

        const timeoutId = window.setTimeout(() => {
          cleanup()
          reject(new Error('Social login timed out. Please retry.'))
        }, 120000)

        const closePollId = window.setInterval(() => {
          if (popup.closed) {
            cleanup()
            reject(new Error('Social login window was closed before completion.'))
          }
        }, 300)

        window.addEventListener('message', onMessage)
      })

      // OAuth success resumes the job on the server. Show that now; the
      // refresh below replaces it with the server's status.
      applyOptimisticStatus('processing')
      await refreshStatus()
      connect(jobId)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to connect social account',
      }))
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }))
    }
  }, [applyOptimisticStatus, connect, refreshStatus, state.jobId])

  const submitOAuthAuth = useCallback(
    async (payload: {
      provider_access_token: string
      provider_refresh_token?: string
      provider_user_id?: string
      expires_at?: string
    }) => {
      if (!state.jobId) return
      await submitSocialImportOAuth(state.jobId, payload)
      await refreshStatus()
      connect(state.jobId)
    },
    [connect, refreshStatus, state.jobId]
  )

  const submitScraperAuth = useCallback(
    async (payload: { username: string; password: string; otp_code?: string }) => {
      if (!state.jobId) return
      setState((prev) => ({ ...prev, isLoading: true, error: null }))
      try {
        await submitSocialImportScraperLogin(state.jobId, payload)
        await refreshStatus()
        connect(state.jobId)
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to submit login details',
        }))
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }))
      }
    },
    [connect, refreshStatus, state.jobId]
  )

  const updateItem = useCallback(
    async (photoId: string, itemId: string, updates: Partial<SocialImportItem>) => {
      if (!state.jobId) return
      try {
        await patchSocialImportItem(state.jobId, photoId, itemId, updates)
        await refreshStatus()
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to update item',
        }))
      }
    },
    [refreshStatus, state.jobId]
  )

  const approveAwaiting = useCallback(async () => {
    if (!state.jobId || !state.awaitingPhotoId) return []
    const savedItems = await approveSocialImportPhoto(state.jobId, state.awaitingPhotoId)
    // Status refresh is best-effort: the approval itself already succeeded
    // server-side, so a transient refresh failure must not lose the saved
    // items (BatchExtractionFlow auto-creates an outfit from them).
    try {
      await refreshStatus()
    } catch {
      // Ignore; the item is saved and the caller can still proceed.
    }
    return savedItems
  }, [refreshStatus, state.awaitingPhotoId, state.jobId])

  const rejectAwaiting = useCallback(async () => {
    if (!state.jobId || !state.awaitingPhotoId) return
    await rejectSocialImportPhoto(state.jobId, state.awaitingPhotoId)
    await refreshStatus()
  }, [refreshStatus, state.awaitingPhotoId, state.jobId])

  const cancelJob = useCallback(async () => {
    if (!state.jobId) return
    await cancelSocialImportJob(state.jobId)
    await refreshStatus()
    setActiveJobId(null)
    disconnect()
  }, [disconnect, refreshStatus, state.jobId])

  const reset = useCallback(async (options?: { cancelActiveJob?: boolean }) => {
    const shouldCancel = options?.cancelActiveJob ?? true
    const activeJobId = state.jobId
    const activeStatus = statusRef.current
    if (shouldCancel && activeJobId && !isTerminalSocialImportStatus(activeStatus)) {
      try {
        await cancelSocialImportJob(activeJobId)
      } catch {
        // Even if cancel fails, continue resetting local state to prevent stale UI.
      }
    }

    disconnect()
    reconnectAttempts.current = 0
    if (reconnectTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    lastEventIdRef.current = null
    // A fresh job must be able to prompt once for its own paused period; the
    // previous job's dedupe must not carry over across reset().
    rateLimitPromptedRef.current = false
    statusRef.current = null
    setActiveJobId(null)
    setState(initialState)
  }, [disconnect, state.jobId])

  useEffect(() => {
    lastEventIdRef.current = state.lastEventId
  }, [state.lastEventId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const cachedJobId = window.localStorage.getItem(SOCIAL_IMPORT_ACTIVE_JOB_KEY)
    if (!cachedJobId) return

    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    void getSocialImportStatus(cachedJobId)
      .then((job) => {
        applyJobData(job)
        setState((prev) => ({ ...prev, isLoading: false }))
        reconnectAttempts.current = 0
        if (!isTerminalSocialImportStatus(job.status)) {
          connect(job.id)
        }
      })
      .catch((error) => {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to resume social import job',
        }))
        // Only a definitive "job gone" (404) should drop the resume marker — a
        // transient network blip must not make a live job unreachable next mount.
        if ((error as { status?: number } | undefined)?.status === 404) {
          setActiveJobId(null)
        }
      })
  }, [applyJobData, connect])

  useEffect(
    () => () => {
      disconnect()
    },
    [disconnect]
  )

  return {
    state,
    startJob,
    startOAuthConnect,
    refreshStatus,
    submitOAuthAuth,
    submitScraperAuth,
    updateItem,
    approveAwaiting,
    rejectAwaiting,
    cancelJob,
    reset,
  }
}

export default useSocialImportQueue
