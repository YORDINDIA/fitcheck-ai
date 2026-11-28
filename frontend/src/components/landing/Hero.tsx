import { ArrowDown } from 'lucide-react'

import {
  CrayonBox,
  CrayonLink,
  HeroDoodles,
  Keycap,
  PaperCard,
  UnderlineSquiggle,
} from '@/components/crayon/CrayonPrimitives'
import StoreBadges from '@/components/landing/StoreBadges'
import { GeneratedImage } from '@/components/ui/generated-image'
import { trackEvent } from '@/lib/analytics'
import { scrollToSectionId } from '@/lib/scroll'
import { trialRegisterHref, TRIAL_PROMO_CODE } from '@/lib/trial-offer'

import { SIGNATURE_ITEMS } from './signature-data'

const FILE_ORIGINALS: Record<string, string> = {
  jacket: 'IMG_4819.jpg',
  tee: 'IMG_4821.jpg',
  stripe: 'IMG_4822.jpg',
  sweater: 'IMG_4824.jpg',
  trousers: 'IMG_4825.jpg',
  sneakers: 'IMG_4826.jpg',
}

export default function Hero() {
  const handleDemoClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    trackEvent('landing_cta_click', { location: 'hero-demo', promo: TRIAL_PROMO_CODE })
    scrollToSectionId('demo')
  }

  return (
    <section
      id="how-it-works"
      aria-labelledby="landing-hero-heading"
      className="cp-wrap cp-hero"
    >
      <HeroDoodles />

      <h1 id="landing-hero-heading" className="cp-h1">
        Snap your closet.
        <br />
        <span className="o">
          One real outfit.
          <UnderlineSquiggle />
        </span>
      </h1>

      <p className="cp-lead">
        Photograph a pile of clothes once. FitCheck cuts out every piece, tags its color and
        fabric, and dresses you for the weather from what you already own.
      </p>

      <div className="cp-ctas">
        <CrayonLink
          to={trialRegisterHref()}
          variant="orange"
          onClick={() =>
            trackEvent('landing_cta_click', { location: 'hero', promo: TRIAL_PROMO_CODE })
          }
        >
          Start free — 1st month Pro
        </CrayonLink>
        <a
          href="/#demo"
          onClick={handleDemoClick}
          className="cp-btn dark cp-cr"
        >
          <span className="cp-solid" aria-hidden="true" />
          Try live demo
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <p className="text-sm font-semibold text-[var(--cp-ink-3)]">
          First month of Pro free. No credit card required.
        </p>
        <StoreBadges location="hero" className="justify-center" />
      </div>

      <CrayonBox className="cp-win sig-stage" radius={28}>
        <div className="cp-win-top">
          <span className="cp-dot" style={{ background: '#ff5f57' }} aria-hidden="true" />
          <span className="cp-dot" style={{ background: '#febc2e' }} aria-hidden="true" />
          <span className="cp-dot" style={{ background: '#28c840' }} aria-hidden="true" />
          <span className="ms-1 font-bold">FitCheck Extraction</span>
          <span className="count">6 items · 1 outfit ready</span>
        </div>

        <div className="sig-canvas grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.35fr)_minmax(0,0.72fr)] lg:items-stretch">
          {/* Source photo (LCP) */}
          <PaperCard className="flex flex-col p-2.5">
            <div className="overflow-hidden rounded-[10px]">
              <GeneratedImage
                src="/signature/pile-800.webp"
                srcSet="/signature/pile-800.webp 800w, /signature/pile-1200.webp 1200w, /signature/pile-1600.webp 1600w"
                sizes="(min-width: 768px) 640px, calc(100vw - 32px)"
                alt="A phone photo of six clothes on a bed: a denim jacket, a white t-shirt, a striped top, a mustard sweater, rust trousers and white sneakers"
                width={1600}
                height={1200}
                decoding="async"
                fallback="hide-figure"
                className="aspect-[4/3] h-auto w-full object-cover"
                {...{ fetchpriority: 'high' }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 px-1 text-xs font-semibold text-[var(--cp-ink-3)]">
              <span className="font-mono">IMG_4818.jpg</span>
              <span className="cp-chip !py-0.5 !text-[11px]">Input pile</span>
            </div>
          </PaperCard>

          {/* 6 real extracted pieces */}
          <ul
            className="sig-grid grid gap-2.5 sm:grid-cols-2"
            aria-label="Pieces FitCheck found in the photo"
          >
            {SIGNATURE_ITEMS.map((item) => (
              <li
                key={item.key}
                className="sig-cell cp-paper flex items-center gap-3 p-2.5 transition-transform duration-150 hover:-translate-y-0.5"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[var(--cp-paper)] p-1 shadow-[0_0_0_2px_var(--cp-ink)]">
                  <GeneratedImage
                    src={`/signature/${item.key}.webp`}
                    alt={item.name}
                    width={item.width}
                    height={item.height}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="sig-label min-w-0 flex-1">
                  <p className="font-mono text-[11px] text-[var(--cp-ink-subtle)] line-through">
                    {FILE_ORIGINALS[item.key] ?? `${item.key}.jpg`}
                  </p>
                  <p className="truncate text-[14px] font-bold text-[var(--cp-ink)]">
                    {item.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--cp-ink-3)]">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] shadow-[0_0_0_1.5px_var(--cp-ink)]"
                      style={{ backgroundColor: item.swatch }}
                    />
                    <span className="truncate">{item.colors}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Generated daily outfit */}
          <PaperCard className="sig-outfit flex flex-col p-2.5">
            <div className="flex-1 overflow-hidden rounded-[10px]">
              <GeneratedImage
                src="/signature/outfit-480.webp"
                srcSet="/signature/outfit-480.webp 480w, /signature/outfit-768.webp 768w"
                sizes="(min-width: 768px) 280px, 70vw"
                alt="The outfit FitCheck put together from those pieces, worn: white t-shirt, rust trousers, white sneakers"
                width={768}
                height={1024}
                loading="lazy"
                decoding="async"
                fallback="hide-figure"
                className="aspect-[3/4] h-full w-full object-cover object-top"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 px-1 text-xs">
              <span className="font-bold text-[var(--cp-ink)]">Today · Styled</span>
              <span className="font-mono text-[11px] font-semibold text-[var(--cp-orange-deep)]">
                24° Clear
              </span>
            </div>
          </PaperCard>
        </div>
      </CrayonBox>

      <ol className="cp-hints sig-steps" role="list">
        <li id="step-photograph">
          <span>
            <Keycap>01</Keycap>
            <span>Photograph a pile or hang</span>
          </span>
        </li>
        <li id="step-catalog">
          <span>
            <Keycap>02</Keycap>
            <span>Catalog cutouts &amp; tags</span>
          </span>
        </li>
        <li id="step-wear">
          <span>
            <Keycap active>03</Keycap>
            <span>Wear weather-matched looks</span>
          </span>
        </li>
      </ol>
      <p className="mt-3 text-xs font-medium text-[var(--cp-ink-3)]">
        Example photo. Cutouts, color tags, and outfit are real FitCheck AI output from it.
      </p>
    </section>
  )
}
