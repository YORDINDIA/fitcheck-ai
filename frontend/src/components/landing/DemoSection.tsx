/**
 * DemoSection - interactive product demos on the landing page.
 */

import { AnimatedSection } from './AnimatedSection'
import { ExtractionDemo } from './ExtractionDemo'
import { TryOnDemo } from './TryOnDemo'
import { PhotoshootDemo } from './PhotoshootDemo'
import { DEMO_RATE_LIMITS } from '@/lib/demo-limits'

export default function DemoSection() {
  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="cp-wrap cp-sec"
    >
      <p className="cp-eyebrow">TRY IT LIVE</p>
      <h2 id="demo-heading" tabIndex={-1} className="cp-h2 outline-none">
        Try it on your own photos.
      </h2>
      <p className="cp-sub">
        No account needed. Test up to {DEMO_RATE_LIMITS.extraction} extractions,{' '}
        {DEMO_RATE_LIMITS.tryOn} try-ons, and {DEMO_RATE_LIMITS.photoshoot} photoshoot a day.
      </p>

      <div className="mt-12 min-w-0 max-w-full overflow-hidden [contain:paint]">
        <div
          data-testid="demo-rail"
          className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pe-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:pb-0 lg:pe-0"
        >
          <AnimatedSection
            delay={60}
            className="w-full min-w-0 shrink-0 snap-start sm:w-[24rem] lg:w-auto lg:shrink"
          >
            <ExtractionDemo />
          </AnimatedSection>
          <AnimatedSection
            delay={120}
            className="w-full min-w-0 shrink-0 snap-start sm:w-[24rem] lg:w-auto lg:shrink"
          >
            <TryOnDemo />
          </AnimatedSection>
          <AnimatedSection
            delay={180}
            className="w-full min-w-0 shrink-0 snap-start sm:w-[24rem] lg:w-auto lg:shrink"
          >
            <PhotoshootDemo />
          </AnimatedSection>
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold text-[var(--cp-ink-3)] lg:hidden">
        Swipe to test all three demos.
      </p>
    </section>
  )
}
