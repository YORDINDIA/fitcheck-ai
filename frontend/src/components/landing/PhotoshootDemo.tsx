/**
 * PhotoshootDemo Component
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Camera,
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { CrayonButton } from '@/components/crayon/CrayonPrimitives'
import { cn, downloadBlob } from '@/lib/utils'
import { isPhotoshootComplete } from '@/lib/photoshoot-status'
import { logger } from '@/lib/logger'
import { GeneratedImage } from '@/components/ui/generated-image'
import { EditorialPanel } from './EditorialPanel'
import { LoginPromptModal } from './LoginPromptModal'
import {
  demoPhotoshoot,
  getDemoPhotoshootStatus,
  DemoPhotoshootResult,
  DemoPhotoshootStatus,
  DemoApiError,
} from '@/api/demo'
import { ensureSessionRecording, trackEvent } from '@/lib/analytics'

type DemoState = 'idle' | 'processing' | 'results' | 'error'

const DEMO_POLL_INTERVAL_MS = 2500
const DEMO_POLL_MAX_ATTEMPTS = 120

function sameImageList(a: Array<{ id: string }>, b: Array<{ id: string }>) {
  return a.length === b.length && a.every((img, i) => img.id === b[i]?.id)
}

function isDemoApiError(err: unknown): err is DemoApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as DemoApiError).message === 'string'
  )
}

async function handleDownload(imageData: string, index: number) {
  try {
    const response = await fetch(imageData)
    downloadBlob(await response.blob(), `photoshoot_demo_${index + 1}.png`)
  } catch (e) {
    logger.error('Download failed:', e)
  }
}

function getImageSrc(img: { image_url?: string; image_base64?: string }) {
  if (img.image_url) return img.image_url
  if (img.image_base64) return `data:image/png;base64,${img.image_base64}`
  return ''
}

async function pollDemoJob(
  jobId: string,
  onProgress: (status: DemoPhotoshootStatus) => void,
  signal?: AbortSignal,
): Promise<DemoPhotoshootStatus> {
  for (let attempt = 0; attempt < DEMO_POLL_MAX_ATTEMPTS; attempt++) {
    const status = await getDemoPhotoshootStatus(jobId, signal)
    onProgress(status)
    if (
      isPhotoshootComplete(status.status) ||
      status.status === 'failed' ||
      status.status === 'cancelled'
    ) {
      return status
    }
    await new Promise((resolve) => setTimeout(resolve, DEMO_POLL_INTERVAL_MS))
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }
  throw new Error('Demo generation timed out. Please try again.')
}

export function PhotoshootDemo() {
  const [state, setState] = useState<DemoState>('idle')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [result, setResult] = useState<DemoPhotoshootResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [retryingFailedIndex, setRetryingFailedIndex] = useState<number | null>(null)
  const [partialImages, setPartialImages] = useState<DemoPhotoshootStatus['images']>([])
  const runIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        if (photoPreview) {
          URL.revokeObjectURL(photoPreview)
        }
        setPhoto(file)
        setPhotoPreview(URL.createObjectURL(file))
        setError(null)
      }
    },
    [photoPreview],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'] },
    maxFiles: 1,
    disabled: state === 'processing',
  })

  const handleGenerate = async () => {
    if (!photo) return

    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState('processing')
    setError(null)
    setPartialImages([])
    ensureSessionRecording()
    trackEvent('photoshoot_session_started', {
      use_case: 'aesthetic',
      num_images: 2,
      photo_count: 1,
      source: 'web_demo',
    })

    try {
      const start = await demoPhotoshoot(photo)

      const final = await pollDemoJob(
        start.job_id,
        (status) => {
          if (runIdRef.current !== runId) return
          setPartialImages((prev) => {
            const next = status.images ?? []
            return sameImageList(prev, next) ? prev : next
          })
        },
        controller.signal,
      )

      if (runIdRef.current !== runId) return

      if (final.status === 'failed') {
        throw new Error(final.error ?? 'Generation failed')
      }

      const failedIndices = final.failed_indices ?? []
      const response: DemoPhotoshootResult = {
        session_id: final.job_id,
        status: isPhotoshootComplete(final.status) ? 'completed' : 'failed',
        images: (final.images ?? []).sort((a, b) => a.index - b.index),
        generated_count: final.generated_count,
        failed_count: final.failed_count,
        image_failures: failedIndices.map((index) => ({ index, error: '' })),
        partial_success: final.partial_success,
        remaining_today: start.remaining_today,
        signup_cta: start.signup_cta,
      }

      setResult(response)
      setState('results')
      trackEvent('photoshoot_session_completed', {
        session_id: response.session_id,
        use_case: 'aesthetic',
        num_images: 2,
        generated_count: response.generated_count ?? response.images?.length ?? 0,
        failed_count: response.failed_count ?? 0,
        partial_success: Boolean(response.partial_success),
        source: 'web_demo',
      })
    } catch (err) {
      if (runIdRef.current !== runId || controller.signal.aborted) return
      const errorMessage = isDemoApiError(err)
        ? err.isRateLimit
          ? 'Daily demo limit reached. Sign up for 10 free images per day!'
          : err.message || 'Failed to generate images'
        : 'Failed to generate images'
      setError(errorMessage)
      setState('error')
      trackEvent('photoshoot_session_failed', {
        use_case: 'aesthetic',
        num_images: 2,
        error_message: errorMessage,
        is_rate_limit: isDemoApiError(err) ? Boolean(err.isRateLimit) : false,
        source: 'web_demo',
      })
    }
  }

  const handleReset = () => {
    runIdRef.current++
    abortRef.current?.abort()
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview)
    }
    setState('idle')
    setPhoto(null)
    setPhotoPreview(null)
    setResult(null)
    setError(null)
    setRetryingFailedIndex(null)
    setPartialImages([])
  }

  const failedIndices = result?.image_failures?.map((f) => f.index).sort((a, b) => a - b) ?? []
  const failedCount = result?.failed_count ?? 0

  const retryFailedSlot = async (failedIndex: number) => {
    if (!photo) return

    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRetryingFailedIndex(failedIndex)
    setError(null)

    try {
      const start = await demoPhotoshoot(photo)
      const final = await pollDemoJob(start.job_id, () => {}, controller.signal)
      if (runIdRef.current !== runId) return

      const replacement = (final.images ?? []).sort((a, b) => a.index - b.index)[0]
      if (replacement && result) {
        const nextImages = [...result.images, { ...replacement, index: failedIndex }]
          .filter((img, i, arr) => arr.findIndex((x) => x.index === img.index) === i)
          .sort((a, b) => a.index - b.index)
        const nextFailed = failedIndices.filter((i) => i !== failedIndex)

        setResult({
          ...result,
          images: nextImages,
          failed_count: nextFailed.length,
          partial_success: nextFailed.length > 0,
          image_failures: nextFailed.map((index) => ({ index, error: '' })),
          remaining_today: start.remaining_today,
        })
      } else {
        setError('Could not generate replacement image')
      }
    } catch (err) {
      if (runIdRef.current !== runId || controller.signal.aborted) return
      const errorMessage = isDemoApiError(err)
        ? err.isRateLimit
          ? 'Daily demo limit reached. Sign up for 10 free images per day!'
          : err.message || 'Retry failed'
        : 'Retry failed'
      setError(errorMessage)
      setState('error')
    } finally {
      setRetryingFailedIndex(null)
    }
  }

  return (
    <EditorialPanel fill="var(--cp-lilac)" className="h-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--cp-lilac)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="cp-hand text-[28px] leading-none text-[var(--cp-ink)]">
            AI photoshoot
          </h3>
          <p className="mt-1 text-xs font-medium text-[var(--cp-ink-3)]">2 free images</p>
        </div>
      </div>

      <div className="min-h-[300px] flex-1">
        {state === 'idle' && !photo && (
          <div className="flex h-full flex-col gap-3">
            <figure className="flex shrink-0 items-center gap-3 rounded-xl bg-[var(--cp-paper)] p-3 shadow-[0_0_0_2px_var(--cp-ink)]">
              <GeneratedImage
                src="/generated/photoshoot-studio-3x4-640.webp"
                alt="Example result: a studio-style portrait in a navy blazer"
                width={640}
                height={853}
                loading="lazy"
                decoding="async"
                className="h-20 w-16 shrink-0 rounded-lg object-cover object-top shadow-[0_0_0_1.5px_var(--cp-ink)]"
                fallback="hide-figure"
              />
              <figcaption className="text-xs leading-relaxed text-[var(--cp-ink-3)]">
                <span className="font-bold text-[var(--cp-ink)]">Example result.</span> One selfie
                in, studio-style portraits out. AI-generated.
              </figcaption>
            </figure>

            <div
              {...getRootProps()}
              className={cn(
                'flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--cp-ink)] bg-[var(--cp-paper)] p-6 text-center',
                'transition-colors duration-150 hover:bg-[var(--cp-surface-muted)]',
                isDragActive && 'bg-[var(--cp-lilac)]/30',
              )}
            >
              <input {...getInputProps({ 'aria-label': 'Upload your photo' })} />
              <Camera
                className={cn(
                  'mb-2.5 h-6 w-6 text-[var(--cp-orange-deep)] transition-transform duration-200',
                  isDragActive && 'scale-110',
                )}
                aria-hidden="true"
              />
              <p className="mb-1 text-sm font-bold text-[var(--cp-ink)]">
                {isDragActive ? 'Drop your photo here' : 'Upload your photo'}
              </p>
              <p className="text-xs text-[var(--cp-ink-3)]">
                Clear face photo for best results
              </p>
            </div>
          </div>
        )}

        {state === 'idle' && photo && photoPreview && (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--cp-mint)] p-3 shadow-[0_0_0_2px_var(--cp-ink)]">
              <img
                src={photoPreview}
                alt=""
                className="h-12 w-12 rounded-lg object-cover shadow-[0_0_0_1.5px_var(--cp-ink)]"
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-[var(--cp-ink)]">Photo uploaded</p>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--cp-orange-deep)] hover:underline"
                  onClick={handleReset}
                >
                  Change photo
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center">
              <p className="mb-4 text-center text-sm font-medium text-[var(--cp-ink-2)]">
                Ready to generate 2 AI-styled photos
              </p>
              <CrayonButton variant="orange" size="sm" onClick={handleGenerate}>
                Generate 2 Images
              </CrayonButton>
            </div>
          </div>
        )}

        {state === 'processing' && (
          <div className="flex h-full flex-col items-center justify-center text-center" role="status">
            {photoPreview && (
              <img
                src={photoPreview}
                alt="Preview"
                className="mb-4 max-h-40 rounded-lg object-contain shadow-[0_0_0_2px_var(--cp-ink)]"
              />
            )}
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-[var(--cp-orange)]" aria-hidden="true" />
            <p className="font-semibold text-[var(--cp-ink-2)]">
              {partialImages.length > 0
                ? `${partialImages.length}/2 images ready…`
                : 'Creating your AI photos...'}
            </p>
            <p className="mt-1 text-xs text-[var(--cp-ink-3)]">
              Generation time can vary. You can keep exploring while this runs.
            </p>

            {partialImages.length > 0 && (
              <div className="mt-4 grid w-full max-w-xs grid-cols-2 gap-2">
                {partialImages.map((img) => (
                  <img
                    key={img.id}
                    src={getImageSrc(img)}
                    alt="Generated preview"
                    className="aspect-[3/4] w-full rounded-lg object-cover shadow-[0_0_0_2px_var(--cp-ink)]"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {state === 'results' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--cp-green)]" role="status">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              <span className="text-sm font-bold">{result.images.length} images generated!</span>
            </div>

            {result.partial_success && failedCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-[var(--cp-yellow-note)] p-3 text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cp-orange-deep)]" aria-hidden="true" />
                <p className="text-xs font-medium">
                  {failedCount} slot{failedCount > 1 ? 's' : ''} failed. Retry each failed slot.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {result.images.map((img, idx) => (
                <div key={img.id} className="group relative">
                  <img
                    src={getImageSrc(img)}
                    alt={`Generated ${idx + 1}`}
                    className="aspect-[3/4] w-full rounded-lg object-cover shadow-[0_0_0_2px_var(--cp-ink)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleDownload(getImageSrc(img), idx)}
                    aria-label={`Download image ${idx + 1}`}
                    className="touch-target absolute bottom-2 end-2 grid min-h-11 min-w-11 place-items-center rounded-full bg-on-image/90 p-2 opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Download className="h-4 w-4 text-on-image-foreground" aria-hidden="true" />
                  </button>
                </div>
              ))}

              {failedIndices.map((failedIndex) => (
                <div
                  key={`demo-failed-${failedIndex}`}
                  className="flex aspect-[3/4] flex-col justify-between rounded-lg border-2 border-dashed border-[var(--cp-ink)] bg-[var(--cp-yellow-note)] p-3"
                >
                  <div>
                    <div className="mb-2 inline-flex rounded-full bg-[var(--cp-surface)] px-2 py-0.5 text-xs font-bold text-[var(--cp-ink)] shadow-[0_0_0_1.5px_var(--cp-ink)]">
                      Failed #{failedIndex + 1}
                    </div>
                    <p className="text-xs text-[var(--cp-ink-2)]">Retry to generate this slot.</p>
                  </div>
                  <CrayonButton
                    size="sm"
                    variant="paper"
                    disabled={retryingFailedIndex !== null}
                    onClick={() => void retryFailedSlot(failedIndex)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {retryingFailedIndex === failedIndex ? 'Retrying...' : 'Retry'}
                  </CrayonButton>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <CrayonButton variant="paper" size="sm" onClick={handleReset}>
                Try Another
              </CrayonButton>
              <CrayonButton
                variant="orange"
                size="sm"
                className="flex-1"
                onClick={() => setShowLoginModal(true)}
              >
                Get More Images
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </CrayonButton>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center rounded-xl bg-[var(--cp-pink)]/30 p-6 text-center shadow-[0_0_0_2px_var(--cp-ink)]"
          >
            <AlertCircle className="mb-3 h-9 w-9 text-[var(--cp-red)]" aria-hidden="true" />
            <p className="mb-4 text-sm font-semibold text-[var(--cp-red)]">{error}</p>
            <CrayonButton variant="dark" size="sm" onClick={handleReset}>
              Try Again
            </CrayonButton>
          </div>
        )}
      </div>

      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        feature="get 10 free AI photoshoot images per day"
      />
    </EditorialPanel>
  )
}
