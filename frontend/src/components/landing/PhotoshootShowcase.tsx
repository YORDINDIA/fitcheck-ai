import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

import { CrayonBox, CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { GeneratedImage } from '@/components/ui/generated-image'
import { PLAN_LIMITS } from '@/lib/plan-limits'

const facts = [
  { term: 'Try-on', detail: 'A combination from your closet, on your own photo.' },
  { term: 'Photoshoot', detail: 'LinkedIn, dating, social or a custom scene, from one selfie.' },
  {
    term: 'On Free',
    detail: `${PLAN_LIMITS.free.dailyPhotoshootImages} photoshoot images a day.`,
  },
]

const PRINTS = [
  {
    src: '/generated/lifestyle-jaipur-3x4-640.webp',
    srcSet: '/generated/lifestyle-jaipur-3x4-640.webp 640w, /generated/lifestyle-jaipur-3x4.webp 900w',
    alt: 'Golden-hour portrait example in a rust slip dress on a market street',
    width: 900,
    height: 1200,
    frame: 'sm:-rotate-2 sm:translate-y-4',
  },
  {
    src: '/generated/photoshoot-studio-3x4-640.webp',
    srcSet: '/generated/photoshoot-studio-3x4-640.webp 640w, /generated/photoshoot-studio-3x4.webp 1728w',
    alt: 'Studio-style portrait example in a navy blazer, generated from a phone selfie',
    width: 1728,
    height: 2304,
    frame: 'sm:rotate-[1.5deg]',
  },
]

export default function PhotoshootShowcase() {
  return (
    <section
      id="photoshoot-showcase"
      aria-labelledby="photoshoot-showcase-heading"
      className="cp-wrap cp-sec"
    >
      <CrayonBox fill="var(--cp-peach)" radius={32} className="bg-[var(--cp-surface)] p-6 sm:p-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="cp-left min-w-0 lg:col-span-5">
            <p className="cp-eyebrow">TRY-ON &amp; PHOTOSHOOT</p>
            <h2 id="photoshoot-showcase-heading" className="cp-h2">
              See it before you wear it.
            </h2>
            <p className="cp-sub">
              Preview an outfit on yourself, or shoot it like a campaign. The pictures on the right
              are AI-generated examples.
            </p>
            <dl className="mt-6 grid gap-3">
              {facts.map((fact) => (
                <div
                  key={fact.term}
                  className="cp-paper grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 p-3.5"
                >
                  <dt className="cp-hand text-xl text-[var(--cp-orange-deep)]">{fact.term}</dt>
                  <dd className="text-sm leading-relaxed text-[var(--cp-ink-2)]">{fact.detail}</dd>
                </div>
              ))}
            </dl>
            <CrayonLink
              to="/features/ai-photoshoot-generator"
              variant="dark"
              size="sm"
              className="mt-7"
            >
              Explore Photoshoot Studio
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-4 sm:gap-6 lg:col-span-7">
            {PRINTS.map((print) => (
              <figure key={print.src} className={`cp-paper min-w-0 p-2 sm:p-3 ${print.frame}`}>
                <GeneratedImage
                  src={print.src}
                  srcSet={print.srcSet}
                  sizes="(min-width: 1024px) 28vw, 45vw"
                  alt={print.alt}
                  className="aspect-[4/5] h-auto w-full rounded-[10px] object-cover object-top"
                  loading="lazy"
                  decoding="async"
                  width={print.width}
                  height={print.height}
                  fallback="hide-figure"
                />
                <figcaption className="flex items-baseline justify-between gap-2 px-1 pb-1 pt-2.5 text-xs text-[var(--cp-ink-3)]">
                  <span className="font-bold text-[var(--cp-ink-2)]">Example result</span>
                  <Link
                    to="/features/ai-photoshoot-generator"
                    className="font-mono text-[11px] hover:underline"
                  >
                    AI-generated
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </CrayonBox>
    </section>
  )
}
