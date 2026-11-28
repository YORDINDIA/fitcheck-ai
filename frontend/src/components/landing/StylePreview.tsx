import { useRef, useState } from 'react'

import { CrayonBox, PaperCard } from '@/components/crayon/CrayonPrimitives'
import { GeneratedImage } from '@/components/ui/generated-image'

import { SIGNATURE_ITEMS } from './signature-data'

const ITEM_MAP = Object.fromEntries(SIGNATURE_ITEMS.map((item) => [item.key, item]))

const OCCASION_STYLES = [
  {
    id: 'workday',
    label: 'Workday Smart',
    preview: '22° · T-shirt + Trousers + Denim Jacket',
    pill: 'Workday Smart',
    rows: [
      { key: 'jacket', name: 'Denim jacket', note: 'Layer · 22° breeze' },
      { key: 'tee', name: 'T-shirt', note: 'Base · breathable cotton' },
      { key: 'trousers', name: 'Trousers', note: 'Bottom · tailored rust' },
      { key: 'sneakers', name: 'Sneakers', note: 'Shoes · clean white' },
    ],
  },
  {
    id: 'weekend',
    label: 'Casual Weekend',
    preview: '24° · Long sleeve + Trousers + Sneakers',
    pill: 'Casual Weekend',
    rows: [
      { key: 'stripe', name: 'Long sleeve shirt', note: 'Top · relaxed stripe' },
      { key: 'trousers', name: 'Trousers', note: 'Bottom · everyday fit' },
      { key: 'sneakers', name: 'Sneakers', note: 'Shoes · walk-ready' },
      { key: 'jacket', name: 'Denim jacket', note: 'Evening backup' },
    ],
  },
  {
    id: 'rainy',
    label: 'Cool & Rainy',
    preview: '14° · Mustard Sweater + Denim Jacket',
    pill: 'Cool & Rainy',
    rows: [
      { key: 'sweater', name: 'Sweater', note: 'Mid · warm mustard knit' },
      { key: 'jacket', name: 'Denim jacket', note: 'Outer · wind protection' },
      { key: 'trousers', name: 'Trousers', note: 'Bottom · full length' },
      { key: 'sneakers', name: 'Sneakers', note: 'Shoes · wipe-clean' },
    ],
  },
  {
    id: 'evening',
    label: 'Dinner & Date',
    preview: '19° · White Tee + Denim Jacket + Trousers',
    pill: 'Dinner & Date',
    rows: [
      { key: 'tee', name: 'T-shirt', note: 'Base · crisp white' },
      { key: 'jacket', name: 'Denim jacket', note: 'Layer · structured' },
      { key: 'trousers', name: 'Trousers', note: 'Bottom · statement rust' },
      { key: 'stripe', name: 'Long sleeve shirt', note: 'Alt · draped shoulders' },
    ],
  },
] as const

export default function StylePreview() {
  const [selectedId, setSelectedId] = useState<(typeof OCCASION_STYLES)[number]['id']>('workday')
  const active = OCCASION_STYLES.find((s) => s.id === selectedId) ?? OCCASION_STYLES[0]

  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectOption = (idx: number, focus = false) => {
    const next = OCCASION_STYLES[(idx + OCCASION_STYLES.length) % OCCASION_STYLES.length]
    setSelectedId(next.id)
    if (focus) {
      optionRefs.current[(idx + OCCASION_STYLES.length) % OCCASION_STYLES.length]?.focus()
    }
  }

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectOption(idx + 1, true)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectOption(idx - 1, true)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectOption(0, true)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectOption(OCCASION_STYLES.length - 1, true)
    }
  }

  return (
    <section className="cp-wrap cp-sec cp-two" aria-labelledby="style-preview-heading">
      <div className="cp-left">
        <p className="cp-eyebrow">OUTFIT STYLING</p>
        <h2 id="style-preview-heading" className="cp-h2">
          Your weather.
          <br />
          Your calendar.
        </h2>
        <p className="cp-sub">
          Pick the occasion and forecast once. FitCheck picks from the pieces you actually own — and
          adapts when you swap a garment.
        </p>

        <div className="cp-opts" role="radiogroup" aria-label="Outfit occasion presets">
          {OCCASION_STYLES.map((opt, idx) => {
            const checked = opt.id === selectedId
            return (
              <button
                key={opt.id}
                ref={(el) => {
                  optionRefs.current[idx] = el
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className="cp-opt"
                onClick={() => setSelectedId(opt.id)}
                onKeyDown={(e) => handleOptionKeyDown(e, idx)}
              >
                <i aria-hidden="true" />
                <span className="min-w-0 overflow-hidden">
                  <span className="block">{opt.label}</span>
                  <small>{opt.preview}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <CrayonBox fill="var(--cp-peach-stage)" radius={30} className="cp-stage">
        <PaperCard className="cp-finder" role="status" aria-live="polite">
          <div className="mb-3 flex items-center gap-2 border-b-2 border-dashed border-[var(--cp-rule-dashed)] pb-3">
            <span className="cp-dot" style={{ background: '#ff5f57' }} aria-hidden="true" />
            <span className="cp-dot" style={{ background: '#febc2e' }} aria-hidden="true" />
            <span className="cp-dot" style={{ background: '#28c840' }} aria-hidden="true" />
            <span className="ms-1 font-bold text-[var(--cp-ink)]">Today&apos;s Look</span>
            <span className="cp-chip ms-auto !bg-[var(--cp-peach)] !text-xs">{active.pill}</span>
          </div>

          <ul>
            {active.rows.map((row) => {
              const item = ITEM_MAP[row.key]
              return (
                <li key={`${active.id}-${row.key}`} className="cp-li">
                  <span className="sw">
                    <GeneratedImage
                      src={`/signature/${row.key}.webp`}
                      alt={row.name}
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      className="h-full w-full object-contain p-0.5"
                    />
                  </span>
                  <span key={`${active.id}-${row.key}-nm`} className="nm font-bold">
                    {row.name}
                  </span>
                  <span className="when">{row.note}</span>
                </li>
              )
            })}
          </ul>
        </PaperCard>
      </CrayonBox>
    </section>
  )
}
