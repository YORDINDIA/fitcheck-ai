/**
 * ExtractionDemo Component
 */

import { useEffect, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Camera,
  Upload,
  Loader2,
  AlertCircle,
  ArrowRight,
  Shirt,
} from 'lucide-react'
import { CrayonButton } from '@/components/crayon/CrayonPrimitives'
import { cn } from '@/lib/utils'
import { trackLandingCta } from '@/lib/analytics'
import { SIGNATURE_ITEMS } from './signature-data'
import { EditorialPanel } from './EditorialPanel'
import { LoginPromptModal } from './LoginPromptModal'
import {
  demoExtractItems,
  DemoDetectedItem,
  DemoExtractItemsResult,
  DemoApiError,
} from '@/api/demo'

type DemoState = 'idle' | 'processing' | 'results' | 'error'

export function ExtractionDemo() {
  const [state, setState] = useState<DemoState>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [results, setResults] = useState<DemoExtractItemsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setState('processing')
    setError(null)
    trackLandingCta('demo-play', { demo: 'extraction' })

    try {
      const result = await demoExtractItems(file)
      setResults(result)
      setState('results')
    } catch (err) {
      const demoError = err as DemoApiError
      setError(
        demoError.isRateLimit
          ? 'Daily demo limit reached. Sign up free to keep using extraction.'
          : demoError.message || 'Failed to analyze image',
      )
      setState('error')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'] },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  })

  const handleReset = () => {
    setPreviewUrl(null)
    setResults(null)
    setError(null)
    setState('idle')
  }

  return (
    <EditorialPanel fill="var(--cp-sky)" className="h-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--cp-sky)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="cp-hand text-[28px] leading-none text-[var(--cp-ink)]">
            Item extraction
          </h3>
          <p className="mt-1 text-xs font-medium text-[var(--cp-ink-3)]">
            Upload a photo to detect clothing
          </p>
        </div>
      </div>

      <div className="min-h-[300px] flex-1">
        {state === 'idle' && (
          <div
            {...getRootProps()}
            className={cn(
              'flex h-full cursor-pointer flex-col rounded-xl border-2 border-dashed border-[var(--cp-ink)] bg-[var(--cp-paper)] p-4',
              'transition-colors duration-150 hover:bg-[var(--cp-surface-muted)]',
              isDragActive && 'bg-[var(--cp-sky)]/30',
            )}
          >
            <input {...getInputProps({ 'aria-label': 'Upload a clothing photo' })} />
            <div className="flex items-center gap-3">
              <img
                src="/signature/pile-160.webp"
                alt="Example photo: six clothes on a bed"
                width={160}
                height={120}
                loading="lazy"
                decoding="async"
                className="h-16 w-20 shrink-0 rounded-lg object-cover shadow-[0_0_0_2px_var(--cp-ink)]"
              />
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase text-[var(--cp-ink-3)]">
                  Example result
                </p>
                <p className="text-sm font-bold text-[var(--cp-ink)]">
                  Found {SIGNATURE_ITEMS.length} items
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {SIGNATURE_ITEMS.slice(0, 4).map((item) => (
                <li key={item.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-[var(--cp-ink)]">{item.name}</span>
                  <span className="truncate font-mono text-xs text-[var(--cp-ink-3)]">
                    {item.colors}
                  </span>
                </li>
              ))}
              <li className="text-xs font-medium text-[var(--cp-ink-3)]">
                and {SIGNATURE_ITEMS.length - 4} more
              </li>
            </ul>
            <p className="mt-auto flex items-center justify-center gap-2 pt-5 text-sm font-bold text-[var(--cp-orange-deep)]">
              <Upload
                className={cn('h-4 w-4 transition-transform duration-200', isDragActive && 'scale-110')}
                aria-hidden="true"
              />
              {isDragActive ? 'Drop your photo here' : 'Try it with your photo'}
            </p>
            <p className="mt-1 text-center text-xs text-[var(--cp-ink-3)]">
              Drop a clothing photo or click to browse
            </p>
          </div>
        )}

        {state === 'processing' && previewUrl && (
          <div className="flex h-full flex-col items-center justify-center" role="status">
            <img
              src={previewUrl}
              alt="Preview"
              className="mb-4 max-h-48 rounded-lg object-contain shadow-[0_0_0_2px_var(--cp-ink)]"
            />
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-[var(--cp-orange)]" aria-hidden="true" />
            <p className="font-semibold text-[var(--cp-ink-2)]">Analyzing clothing items...</p>
          </div>
        )}

        {state === 'results' && results && (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex gap-4">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Original"
                  className="h-20 w-20 rounded-lg object-cover shadow-[0_0_0_2px_var(--cp-ink)]"
                />
              )}
              <div>
                <p className="text-sm font-bold text-[var(--cp-ink)]">
                  Found {results.item_count} item{results.item_count !== 1 ? 's' : ''}
                </p>
                <p className="font-mono text-xs text-[var(--cp-ink-3)]">
                  {Math.round(results.overall_confidence * 100)}% confidence
                </p>
              </div>
            </div>

            <div className="mb-4 flex-1 space-y-2.5 overflow-y-auto">
              {results.items.map((item, idx) => (
                <ExtractedItemCard key={idx} item={item} />
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
                Save to Closet
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
        feature="save items to your wardrobe"
      />
    </EditorialPanel>
  )
}

function ExtractedItemCard({ item }: { item: DemoDetectedItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--cp-paper)] p-3 shadow-[0_0_0_2px_var(--cp-ink)]">
      <Shirt className="h-4 w-4 shrink-0 text-[var(--cp-orange)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--cp-ink)] capitalize">
          {item.sub_category || item.category}
        </p>
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--cp-ink-3)]">
          {item.colors.length > 0 && (
            <span className="capitalize">{item.colors.slice(0, 2).join(', ')}</span>
          )}
          {item.material && <span>{item.material}</span>}
        </div>
      </div>
      <span className="font-mono text-xs font-semibold text-[var(--cp-ink-3)]">
        {Math.round(item.confidence * 100)}%
      </span>
    </div>
  )
}
