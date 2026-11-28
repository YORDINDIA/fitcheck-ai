/**
 * TryOnDemo Component
 */

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Wand2,
  Loader2,
  AlertCircle,
  User,
  Shirt,
  ArrowRight,
} from 'lucide-react'
import { CrayonButton } from '@/components/crayon/CrayonPrimitives'
import { GeneratedImage } from '@/components/ui/generated-image'
import { cn } from '@/lib/utils'
import { trackLandingCta } from '@/lib/analytics'
import { EditorialPanel } from './EditorialPanel'
import { LoginPromptModal } from './LoginPromptModal'
import { demoTryOn, DemoTryOnResult, DemoApiError } from '@/api/demo'

type DemoState = 'person' | 'outfit' | 'processing' | 'results' | 'error'

export function TryOnDemo() {
  const [state, setState] = useState<DemoState>('person')
  const [personFile, setPersonFile] = useState<File | null>(null)
  const [personPreview, setPersonPreview] = useState<string | null>(null)
  const [outfitPreview, setOutfitPreview] = useState<string | null>(null)
  const [result, setResult] = useState<DemoTryOnResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    return () => {
      if (personPreview) URL.revokeObjectURL(personPreview)
    }
  }, [personPreview])

  useEffect(() => {
    return () => {
      if (outfitPreview) URL.revokeObjectURL(outfitPreview)
    }
  }, [outfitPreview])

  const onDropPerson = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setPersonFile(file)
    setPersonPreview(URL.createObjectURL(file))
    setState('outfit')
  }, [])

  const onDropOutfit = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0 || !personFile) return

      const file = acceptedFiles[0]
      setOutfitPreview(URL.createObjectURL(file))
      setState('processing')
      setError(null)
      trackLandingCta('demo-play', { demo: 'try-on' })

      try {
        const tryOnResult = await demoTryOn(personFile, file)
        setResult(tryOnResult)
        setState('results')
      } catch (err) {
        const demoError = err as DemoApiError
        setError(
          demoError.isRateLimit
            ? 'Daily demo limit reached. Sign up free to keep using try-on.'
            : demoError.message || 'Failed to generate try-on',
        )
        setState('error')
      }
    },
    [personFile],
  )

  const personDropzone = useDropzone({
    onDrop: onDropPerson,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'] },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  })

  const outfitDropzone = useDropzone({
    onDrop: onDropOutfit,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'] },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  })

  const handleReset = () => {
    setPersonFile(null)
    setPersonPreview(null)
    setOutfitPreview(null)
    setResult(null)
    setError(null)
    setState('person')
  }

  return (
    <EditorialPanel fill="var(--cp-mint)" className="h-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--cp-mint)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
          <Wand2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="cp-hand text-[28px] leading-none text-[var(--cp-ink)]">
            Virtual try-on
          </h3>
          <p className="mt-1 text-xs font-medium text-[var(--cp-ink-3)]">
            See yourself in any outfit
          </p>
        </div>
      </div>

      <div className="min-h-[300px] flex-1">
        {state === 'person' && (
          <div className="flex h-full flex-col gap-3">
            <figure className="flex shrink-0 items-center gap-3 rounded-xl bg-[var(--cp-paper)] p-3 shadow-[0_0_0_2px_var(--cp-ink)]">
              <GeneratedImage
                src="/generated/demo-beforeafter-base-4x3-640.webp"
                alt=""
                aria-hidden="true"
                className="h-20 w-16 shrink-0 rounded-lg object-cover shadow-[0_0_0_1.5px_var(--cp-ink)]"
                loading="lazy"
                fallback="hide-figure"
              />
              <figcaption className="text-xs leading-relaxed text-[var(--cp-ink-3)]">
                <span className="font-bold text-[var(--cp-ink)]">Example input.</span>{' '}
                A clear full-body photo works best. Your result uses your own photo.
              </figcaption>
            </figure>

            <div
              {...personDropzone.getRootProps()}
              className={cn(
                'flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--cp-ink)] bg-[var(--cp-paper)] p-6 text-center',
                'transition-colors duration-150 hover:bg-[var(--cp-surface-muted)]',
                personDropzone.isDragActive && 'bg-[var(--cp-mint)]/30',
              )}
            >
              <input {...personDropzone.getInputProps({ 'aria-label': 'Upload your photo' })} />
              <User
                className={cn(
                  'mb-2.5 h-6 w-6 text-[var(--cp-orange-deep)] transition-transform duration-200',
                  personDropzone.isDragActive && 'scale-110',
                )}
                aria-hidden="true"
              />
              <p className="mb-1 text-sm font-bold text-[var(--cp-ink)]">
                Step 1: Upload your photo
              </p>
              <p className="text-xs text-[var(--cp-ink-3)]">
                A clear full-body or half-body photo works best
              </p>
            </div>
          </div>
        )}

        {state === 'outfit' && (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--cp-mint)] p-3 shadow-[0_0_0_2px_var(--cp-ink)]">
              {personPreview && (
                <img
                  src={personPreview}
                  alt="You"
                  className="h-12 w-12 rounded-lg object-cover shadow-[0_0_0_1.5px_var(--cp-ink)]"
                />
              )}
              <div className="flex-1">
                <p className="text-sm font-bold text-[var(--cp-ink)]">Your photo uploaded</p>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--cp-orange-deep)] hover:underline"
                  onClick={handleReset}
                >
                  Change photo
                </button>
              </div>
            </div>

            <div
              {...outfitDropzone.getRootProps()}
              className={cn(
                'flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--cp-ink)] bg-[var(--cp-paper)] p-6 text-center',
                'transition-colors duration-150 hover:bg-[var(--cp-surface-muted)]',
                outfitDropzone.isDragActive && 'bg-[var(--cp-mint)]/30',
              )}
            >
              <input {...outfitDropzone.getInputProps({ 'aria-label': 'Upload an outfit to try on' })} />
              <Shirt
                className={cn(
                  'mb-2.5 h-6 w-6 text-[var(--cp-orange-deep)] transition-transform duration-200',
                  outfitDropzone.isDragActive && 'scale-110',
                )}
                aria-hidden="true"
              />
              <p className="mb-1 text-sm font-bold text-[var(--cp-ink)]">
                Step 2: Upload outfit to try on
              </p>
              <p className="text-xs text-[var(--cp-ink-3)]">
                Drop a clothing image or outfit photo
              </p>
            </div>
          </div>
        )}

        {state === 'processing' && (
          <div className="flex h-full flex-col items-center justify-center text-center" role="status">
            <div className="mb-6 flex gap-4">
              {personPreview && (
                <img
                  src={personPreview}
                  alt="You"
                  className="h-20 w-20 rounded-lg object-cover shadow-[0_0_0_2px_var(--cp-ink)]"
                />
              )}
              <span className="self-center text-2xl font-bold text-[var(--cp-ink-3)]">+</span>
              {outfitPreview && (
                <img
                  src={outfitPreview}
                  alt="Outfit"
                  className="h-20 w-20 rounded-lg object-cover shadow-[0_0_0_2px_var(--cp-ink)]"
                />
              )}
            </div>
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-[var(--cp-orange)]" aria-hidden="true" />
            <p className="font-semibold text-[var(--cp-ink-2)]">Creating your look...</p>
            <p className="mt-1 text-xs text-[var(--cp-ink-3)]">
              Generation time can vary. You can keep exploring while this runs.
            </p>
          </div>
        )}

        {state === 'results' && result && (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex flex-1 items-center justify-center">
              <img
                src={`data:image/png;base64,${result.image_base64}`}
                alt="Try-on result"
                className="max-h-64 rounded-xl object-contain shadow-[0_0_0_2.5px_var(--cp-ink)]"
              />
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
                Save &amp; continue free
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
        feature="save try-ons and keep building outfits free"
      />
    </EditorialPanel>
  )
}
