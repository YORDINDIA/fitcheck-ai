import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, RotateCcw, Sparkles } from 'lucide-react'

import { CrayonBox, CrayonButton, PaperCard } from '@/components/crayon/CrayonPrimitives'
import { GeneratedImage } from '@/components/ui/generated-image'
import { PLAN_LIMITS } from '@/lib/plan-limits'

import { SIGNATURE_ITEMS } from './signature-data'

const SIZE = Object.fromEntries(SIGNATURE_ITEMS.map((item) => [item.key, item]))

const PILLARS = [
  {
    verb: 'Catalog',
    body: 'Color, category, and fabric extracted from single pieces, hangs, and piles. You review before it saves.',
    href: '/features/ai-wardrobe-extraction',
    fill: 'var(--cp-peach-deep)',
    icon: 'camera',
  },
  {
    verb: 'Plan',
    body: 'Daily outfits and calendar events matched to the forecast and the occasion in seconds.',
    href: '/features/outfit-recommendations',
    fill: 'var(--cp-mint-card)',
    icon: 'calendar',
  },
  {
    verb: 'Preview',
    body: 'Try a combination on your own photo or generate studio portraits before you wear or buy.',
    href: '/features/virtual-try-on',
    fill: 'var(--cp-sky-card)',
    icon: 'sparkle',
  },
] as const

const WEEK = [
  { day: 'Mon', weather: '24° clear', pieces: ['tee', 'trousers', 'sneakers'], today: true },
  { day: 'Tue', weather: '19° cloud', pieces: ['stripe', 'trousers', 'sneakers'] },
  { day: 'Wed', weather: '16° wind', pieces: ['jacket', 'tee', 'trousers'] },
  { day: 'Thu', weather: '14° rain', pieces: ['sweater', 'jacket', 'trousers'] },
  { day: 'Fri', weather: '21° sun', pieces: ['stripe', 'jacket', 'sneakers'] },
]

const BATCH_FILES = [
  { key: 'jacket', raw: 'IMG_4819.jpg', clean: 'Denim jacket', colors: 'Blue, light blue' },
  { key: 'tee', raw: 'IMG_4821.jpg', clean: 'T-shirt', colors: 'White' },
  { key: 'trousers', raw: 'IMG_4825.jpg', clean: 'Trousers', colors: 'Brown, orange' },
]

const ALSO_IN_APP = [
  { title: 'Bulk & Instagram import', body: 'Drop dozens of photos into one review queue.' },
  { title: 'Packing lists', body: 'Generated from your real closet for any trip forecast.' },
  { title: 'Cost-per-wear & gaps', body: 'See what earns its keep and what is missing.' },
  { title: 'Share & feedback', body: 'Send a look link and collect votes before wearing.' },
]

function PillarArt({ kind }: { kind: 'camera' | 'calendar' | 'sparkle' }) {
  if (kind === 'camera') {
    return (
      <svg viewBox="0 0 104 94" fill="none" className="art" aria-hidden="true">
        <rect
          x="10"
          y="22"
          width="84"
          height="58"
          rx="14"
          fill="var(--cp-yellow)"
          stroke="var(--cp-ink)"
          strokeWidth="4.5"
        />
        <path
          d="M34 22L40 12H64L70 22"
          fill="var(--cp-yellow)"
          stroke="var(--cp-ink)"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <circle
          cx="52"
          cy="51"
          r="16"
          fill="var(--cp-sky)"
          stroke="var(--cp-ink)"
          strokeWidth="4.5"
        />
        <circle cx="77" cy="35" r="4" fill="var(--cp-ink)" />
      </svg>
    )
  }
  if (kind === 'calendar') {
    return (
      <svg viewBox="0 0 104 94" fill="none" className="art" aria-hidden="true">
        <rect
          x="12"
          y="18"
          width="80"
          height="64"
          rx="14"
          fill="var(--cp-surface)"
          stroke="var(--cp-ink)"
          strokeWidth="4.5"
        />
        <path
          d="M12 34H92"
          stroke="var(--cp-ink)"
          strokeWidth="4.5"
        />
        <line x1="34" y1="10" x2="34" y2="24" stroke="var(--cp-ink)" strokeWidth="5" strokeLinecap="round" />
        <line x1="70" y1="10" x2="70" y2="24" stroke="var(--cp-ink)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="38" cy="54" r="9" fill="var(--cp-orange)" />
        <rect x="56" y="48" width="22" height="12" rx="6" fill="var(--cp-mint)" stroke="var(--cp-ink)" strokeWidth="3" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 104 94" fill="none" className="art" aria-hidden="true">
      <rect
        x="16"
        y="12"
        width="72"
        height="70"
        rx="16"
        fill="var(--cp-surface)"
        stroke="var(--cp-ink)"
        strokeWidth="4.5"
      />
      <path
        d="M52 24L57 40L73 45L57 50L52 66L47 50L31 45L47 40L52 24Z"
        fill="var(--cp-yellow)"
        stroke="var(--cp-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Features() {
  const [extracted, setExtracted] = useState(true)
  const [activeCard, setActiveCard] = useState(0)
  const swipeRef = useRef<HTMLDivElement>(null)

  const handleSwipeScroll = () => {
    const container = swipeRef.current
    if (!container) return
    const center = container.scrollLeft + container.clientWidth / 2
    let nearest = 0
    let minDist = Number.POSITIVE_INFINITY
    Array.from(container.children).forEach((child, idx) => {
      const el = child as HTMLElement
      const childCenter = el.offsetLeft + el.offsetWidth / 2
      const dist = Math.abs(center - childCenter)
      if (dist < minDist) {
        minDist = dist
        nearest = idx
      }
    })
    setActiveCard(nearest)
  }

  const scrollToCard = (idx: number) => {
    setActiveCard(idx)
    const target = swipeRef.current?.children[idx] as HTMLElement | undefined
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }

  return (
    <section id="features" className="cp-wrap cp-sec" aria-labelledby="features-heading">
      <p className="cp-eyebrow">BUILT FOR FAST MORNINGS</p>
      <h2 id="features-heading" className="cp-h2">
        Get dressed faster.
      </h2>
      <p className="cp-sub">
        No spreadsheet chores. Snap your clothes like always, and your digital wardrobe builds
        itself with outfits ready for the forecast.
      </p>

      {/* 3 crayon-filled pillar cards */}
      <div ref={swipeRef} onScroll={handleSwipeScroll} className="cp-cards3 cp-swipe">
        {PILLARS.map((pillar, idx) => (
          <CrayonBox
            key={pillar.verb}
            fill={pillar.fill}
            radius={28}
            className="cp-card"
          >
            <PillarArt kind={pillar.icon} />
            <div className="flex items-center justify-between gap-2">
              <h3>{pillar.verb}</h3>
              <Link
                to={pillar.href}
                onClick={() => setActiveCard(idx)}
                aria-label={`Explore ${pillar.verb}`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)] transition-colors hover:bg-[var(--cp-orange)] hover:text-white"
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="card-copy">{pillar.body}</p>
          </CrayonBox>
        ))}
      </div>

      <div className="cp-dots" role="group" aria-label="Feature pillars carousel">
        {PILLARS.map((p, idx) => (
          <button
            key={p.verb}
            type="button"
            className={activeCard === idx ? 'on' : undefined}
            onClick={() => scrollToCard(idx)}
            aria-label={`Show feature ${idx + 1} of ${PILLARS.length}: ${p.verb}`}
            aria-pressed={activeCard === idx}
          />
        ))}
      </div>

      {/* 2x2 Rich Half Cards */}
      <div className="cp-pair">
        {/* Card 1: Batch Extraction interactive toggle */}
        <CrayonBox fill="var(--cp-lilac)" radius={30} className="cp-half">
          <h3>Extract a whole pile in one click.</h3>
          <p>
            Drop a messy bed photo or hanging rack. FitCheck separates every garment and keeps what
            you confirm.
          </p>
          <PaperCard className="mt-auto">
            <div className="mb-2 flex items-center gap-2 pb-2">
              <span className="text-sm font-bold text-[var(--cp-ink)]">Closet Queue</span>
              <CrayonButton
                size="sm"
                variant="orange"
                className="cp-tidy-btn"
                onClick={() => setExtracted((v) => !v)}
              >
                {extracted ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Undo
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Extract all
                  </>
                )}
              </CrayonButton>
            </div>
            <ul>
              {BATCH_FILES.map((row) => {
                const item = SIZE[row.key]
                return (
                  <li key={row.key} className="cp-li">
                    <span className="sw">
                      <GeneratedImage
                        src={`/signature/${row.key}.webp`}
                        alt={row.clean}
                        width={item.width}
                        height={item.height}
                        loading="lazy"
                        className="h-full w-full object-contain p-0.5"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      {extracted ? (
                        <>
                          <span className="block truncate font-bold text-[var(--cp-ink)]">
                            {row.clean} · {row.colors}
                          </span>
                          <s>was {row.raw}</s>
                        </>
                      ) : (
                        <span className="font-mono text-sm text-[var(--cp-ink-2)]">{row.raw}</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </PaperCard>
        </CrayonBox>

        {/* Card 2: Weekly Outfit Planner */}
        <CrayonBox fill="var(--cp-yellow-banner)" radius={30} className="cp-half">
          <h3>A full week from six pieces.</h3>
          <p>
            Outfits matched to your local weather and calendar. Here is Mon–Fri styled from the
            hero pile.
          </p>
          <PaperCard className="mt-auto">
            <ul>
              {WEEK.map((day) => (
                <li key={day.day} className="cp-li">
                  <span className="w-12 shrink-0 font-bold text-[var(--cp-ink)]">
                    {day.today ? 'Today' : day.day}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {day.pieces.map((p) => (
                      <span
                        key={p}
                        className="grid h-8 w-8 place-items-center rounded-md bg-[var(--cp-paper)] p-0.5 shadow-[0_0_0_1.5px_var(--cp-ink)]"
                      >
                        <GeneratedImage
                          src={`/signature/${p}.webp`}
                          alt={SIZE[p].name}
                          width={SIZE[p].width}
                          height={SIZE[p].height}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </span>
                    ))}
                  </span>
                  <span className="ms-auto font-mono text-xs text-[var(--cp-ink-3)]">
                    {day.weather}
                  </span>
                </li>
              ))}
            </ul>
          </PaperCard>
        </CrayonBox>

        {/* Card 3: AI Photoshoot Showcase (#photoshoot-showcase) */}
        <CrayonBox
          id="photoshoot-showcase"
          fill="var(--cp-sky)"
          radius={30}
          className="cp-half"
        >
          <h3>See it on yourself first.</h3>
          <p>
            Preview combinations with virtual try-on, or shoot LinkedIn and editorial portraits from
            one selfie ({PLAN_LIMITS.free.dailyPhotoshootImages} free daily).
          </p>
          <PaperCard className="mt-auto">
            <div className="grid grid-cols-2 gap-3">
              <figure className="overflow-hidden rounded-xl shadow-[0_0_0_2px_var(--cp-ink)]">
                <GeneratedImage
                  src="/generated/lifestyle-jaipur-3x4-640.webp"
                  alt="Golden-hour portrait example in a rust slip dress"
                  width={640}
                  height={853}
                  loading="lazy"
                  className="aspect-[3/4] h-auto w-full object-cover object-top"
                  fallback="hide-figure"
                />
              </figure>
              <figure className="overflow-hidden rounded-xl shadow-[0_0_0_2px_var(--cp-ink)]">
                <GeneratedImage
                  src="/generated/photoshoot-studio-3x4-640.webp"
                  alt="Studio-style portrait example in a navy blazer"
                  width={640}
                  height={853}
                  loading="lazy"
                  className="aspect-[3/4] h-auto w-full object-cover object-top"
                  fallback="hide-figure"
                />
              </figure>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 pt-1 text-xs font-semibold text-[var(--cp-ink-3)]">
              <span>AI-generated examples</span>
              <Link
                to="/features/ai-photoshoot-generator"
                className="inline-flex min-h-11 items-center gap-1 font-bold text-[var(--cp-orange-deep)] hover:underline"
              >
                Photoshoot Studio
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </PaperCard>
        </CrayonBox>

        {/* Card 4: Also in the app (#also-in-app) */}
        <CrayonBox
          id="also-in-app"
          fill="var(--cp-pink)"
          radius={30}
          className="cp-half"
        >
          <h3>Everything else in your pocket.</h3>
          <p>
            Built for everyday use across web, iOS, and Android — with tools that help you wear
            more and buy less.
          </p>
          <PaperCard className="mt-auto">
            <ul>
              {ALSO_IN_APP.map((item) => (
                <li key={item.title} className="cp-li">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--cp-mint)] text-[var(--cp-ink)] shadow-[0_0_0_1.5px_var(--cp-ink)]">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block font-bold text-[var(--cp-ink)]">{item.title}</span>
                    <span className="block text-xs font-normal text-[var(--cp-ink-3)]">
                      {item.body}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end border-t-2 border-dashed border-[var(--cp-rule-dashed)] pt-2.5">
              <Link
                to="/features"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[var(--cp-orange-deep)] hover:underline"
              >
                Every feature
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </PaperCard>
        </CrayonBox>
      </div>
    </section>
  )
}
