import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'

import { CrayonBox } from '@/components/crayon/CrayonPrimitives'
import { GeneratedImage } from '@/components/ui/generated-image'
import { cn } from '@/lib/utils'

import { SIGNATURE_ITEMS } from './signature-data'

const RAW_FILES: Record<string, string> = {
  jacket: 'IMG_2208.jpg',
  tee: 'Screenshot_09.png',
  stripe: 'IMG_4471.jpg',
  sweater: 'Untitled-3.png',
  trousers: 'photo_11.jpg',
  sneakers: 'image (2).png',
}

const INITIAL_TAGGED: Record<string, boolean> = {
  tee: true,
  trousers: true,
}

export default function ClosetStage() {
  const [taggedKeys, setTaggedKeys] = useState<Record<string, boolean>>(INITIAL_TAGGED)
  const [lastTagged, setLastTagged] = useState<(typeof SIGNATURE_ITEMS)[number] | null>(
    SIGNATURE_ITEMS[1],
  )
  const [showNotif, setShowNotif] = useState(false)

  const handleToggleItem = (item: (typeof SIGNATURE_ITEMS)[number]) => {
    setTaggedKeys((prev) => {
      const nextValue = !prev[item.key]
      if (nextValue) {
        setLastTagged(item)
        setShowNotif(true)
      } else if (lastTagged?.key === item.key) {
        setShowNotif(false)
      }
      return { ...prev, [item.key]: nextValue }
    })
  }

  const handleReset = () => {
    setTaggedKeys(INITIAL_TAGGED)
    setLastTagged(SIGNATURE_ITEMS[1])
    setShowNotif(false)
  }

  const taggedCount = Object.values(taggedKeys).filter(Boolean).length

  return (
    <section className="cp-wrap cp-sec" aria-labelledby="closet-stage-heading">
      <p className="cp-eyebrow">INTERACTIVE CLOSET</p>
      <h2 id="closet-stage-heading" className="cp-h2">
        Your closet, finally wearable.
      </h2>
      <p className="cp-sub">
        Every messy wardrobe photo becomes a clean, searchable piece. Tap any item below to tag it
        live.
      </p>

      <CrayonBox className="cp-desk" radius={30}>
        <div className="cp-screen flex flex-col justify-between px-4 pb-4 pt-14 sm:px-6 sm:pb-6 sm:pt-14">
          <div className="cp-bgs bgs" aria-hidden="true" />
          <div className="hill" aria-hidden="true" />
          <div className="sun" aria-hidden="true" />

          <div className="cp-menubar">
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--cp-orange)]" aria-hidden="true" />
              <span>FitCheck Studio</span>
            </span>
            <span className="font-medium text-[var(--cp-ink-2)]">
              {taggedCount}/{SIGNATURE_ITEMS.length} cataloged
            </span>
            <span className="ms-auto flex items-center gap-2 font-mono text-xs font-semibold text-[var(--cp-ink-2)]">
              <span className="hidden sm:inline">24° Clear · Fri</span>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-bold text-[var(--cp-orange-deep)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-ink)]"
              >
                Reset
              </button>
            </span>
          </div>

          <div className="relative z-[3] mb-4 flex min-h-[76px] items-start justify-start pt-2">
            <div
              className="cp-notif"
              data-show={showNotif}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-hidden={!showNotif}
            >
              {lastTagged && (
                <>
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[var(--cp-paper)] p-1 shadow-[0_0_0_2px_var(--cp-ink)]">
                    <GeneratedImage
                      src={`/signature/${lastTagged.key}.webp`}
                      alt=""
                      width={lastTagged.width}
                      height={lastTagged.height}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="flex items-center gap-1.5 text-sm">
                      <Check className="h-3.5 w-3.5 text-[var(--cp-green)]" aria-hidden="true" />
                      <span>{lastTagged.name}</span>
                    </b>
                    <small className="text-xs text-[var(--cp-ink-2)]">
                      Tagged {lastTagged.colors} · Ready for outfits
                    </small>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative z-[2] grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SIGNATURE_ITEMS.map((item) => {
              const isTagged = Boolean(taggedKeys[item.key])
              const isHighlighted = showNotif && lastTagged?.key === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleToggleItem(item)}
                  aria-pressed={isTagged}
                  className="cp-ic focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-ink)]"
                >
                  <span className="th">
                    <GeneratedImage
                      src={`/signature/${item.key}.webp`}
                      alt={item.name}
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span
                    className={cn(
                      'lb',
                      !isTagged && 'messy',
                      isHighlighted && 'ed',
                    )}
                  >
                    {isTagged ? item.name : RAW_FILES[item.key]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </CrayonBox>
      <p className="mt-4 text-center text-sm font-semibold text-[var(--cp-ink-3)]">
        Tap any untagged file above to rename and catalog it.
      </p>
    </section>
  )
}
