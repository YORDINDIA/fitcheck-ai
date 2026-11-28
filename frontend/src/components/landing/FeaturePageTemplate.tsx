import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'

import { CrayonBox, CrayonLink, PaperCard } from '@/components/crayon/CrayonPrimitives'
import SEO from '@/components/seo/SEO'
import { BreadcrumbJsonLd, buildHowToSchema } from '@/components/seo/JsonLd'
import { SEO_CONFIG } from '@/components/seo/seo-config'
import { trialRegisterHref } from '@/lib/trial-offer'

export interface FeaturePageItem {
  icon: LucideIcon
  title: string
  description: string
}

export interface FeaturePageStep {
  title: string
  description: string
}

export interface RelatedFeature {
  title: string
  description: string
  href: string
}

export interface FeatureStat {
  value: string
  label: string
}

export interface FeaturePageTemplateProps {
  title: string
  description: string
  canonicalPath: string
  keywords: string
  eyebrow: string
  heroImage: string
  heroImageSrcSet?: string
  heroImageAlt: string
  preparationTitle: string
  preparation: string[]
  features: FeaturePageItem[]
  steps: FeaturePageStep[]
  contextTitle: string
  contextDescription: string
  contextItems: string[]
  relatedFeatures: RelatedFeature[]
  stats?: FeatureStat[]
}

const RELATED_FILLS = ['var(--cp-sky)', 'var(--cp-mint)', 'var(--cp-lilac)']

export function FeaturePageTemplate({
  title,
  description,
  canonicalPath,
  keywords,
  eyebrow,
  heroImage,
  heroImageSrcSet,
  heroImageAlt,
  preparationTitle,
  preparation,
  features,
  steps,
  contextTitle,
  contextDescription,
  contextItems,
  relatedFeatures,
  stats,
}: FeaturePageTemplateProps) {
  const breadcrumbs = [
    { name: 'Home', url: `${SEO_CONFIG.siteUrl}/` },
    { name: 'Features', url: `${SEO_CONFIG.siteUrl}/features` },
    { name: title, url: `${SEO_CONFIG.siteUrl}${canonicalPath}` },
  ]
  const howToSchema = buildHowToSchema({
    name: `${title}: how it works`,
    description,
    steps: steps.map((step) => ({ name: step.title, text: step.description })),
  })

  return (
    <>
      <SEO
        title={`${title} | FitCheck AI`}
        description={description}
        canonicalUrl={`${SEO_CONFIG.siteUrl}${canonicalPath}`}
        keywords={keywords}
        jsonLd={howToSchema}
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <div className="cp-wrap">
        <section className="cp-doc-head">
          <nav className="cp-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden>/</span>
            <Link to="/features">Features</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--cp-ink)]">{title}</span>
          </nav>

          <p className="cp-eyebrow inline-flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1>{title}</h1>
          <p className="cp-lead">{description}</p>

          <div className="cp-ctas">
            <CrayonLink to={trialRegisterHref()} variant="orange">
              Start free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
            <CrayonLink to="/features" variant="dark">
              Explore all features
            </CrayonLink>
          </div>

          {stats && stats.length > 0 && (
            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <PaperCard key={stat.label} className="px-4 py-3 text-left">
                  <p className="cp-hand text-3xl text-[var(--cp-orange-deep)]">{stat.value}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--cp-ink-3)]">{stat.label}</p>
                </PaperCard>
              ))}
            </div>
          )}

          <PaperCard className="mx-auto mt-10 max-w-3xl overflow-hidden p-2.5">
            <img
              src={heroImage}
              srcSet={heroImageSrcSet}
              sizes="(min-width: 1024px) 720px, 92vw"
              alt={heroImageAlt}
              className="aspect-[16/10] h-auto w-full rounded-[12px] object-cover"
              loading="eager"
              decoding="async"
            />
          </PaperCard>
        </section>

        <section className="cp-sec px-4 sm:px-6 lg:px-8">
          <div data-testid="feature-trust-strip" className="grid gap-5 md:grid-cols-3">
            {[
              ['Your inputs stay in context', 'Use your photos, wardrobe, and choices to guide the flow.'],
              ['Review before the next step', 'Keep control of what is saved, shared, or retried.'],
              ['Clear status while work runs', 'Queued, processing, completed, and failed states stay explicit.'],
            ].map(([heading, detail], i) => (
              <CrayonBox
                key={heading}
                fill={RELATED_FILLS[i % RELATED_FILLS.length]}
                radius={22}
                className="bg-[var(--cp-surface)] p-5"
              >
                <div className="cp-paper p-4">
                  <h2 className="text-base font-bold text-[var(--cp-ink)]">{heading}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--cp-ink-2)]">{detail}</p>
                </div>
              </CrayonBox>
            ))}
          </div>
        </section>

        <section className="cp-sec grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div className="cp-left">
            <p className="cp-eyebrow">BEFORE YOU START</p>
            <h2 className="cp-h2">{preparationTitle}</h2>
            <p className="cp-sub">
              A focused start produces more useful results and makes review easier.
            </p>
            <ul className="mt-6 space-y-3">
              {preparation.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm font-medium leading-relaxed text-[var(--cp-ink-2)]"
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--cp-mint)] text-[var(--cp-ink)] shadow-[0_0_0_1.5px_var(--cp-ink)]">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <PaperCard key={feature.title} className="p-5">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--cp-peach)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="cp-hand mt-4 text-2xl text-[var(--cp-ink)]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--cp-ink-2)]">
                    {feature.description}
                  </p>
                </PaperCard>
              )
            })}
          </div>
        </section>

        <section className="cp-sec">
          <p className="cp-eyebrow">STEP BY STEP</p>
          <h2 className="cp-h2">How it works</h2>
          <p className="cp-sub">A deliberate flow from input to a next useful action.</p>

          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <PaperCard className="h-full p-5">
                  <p className="font-mono text-xs font-bold tracking-[0.14em] text-[var(--cp-orange-deep)]">
                    0{index + 1}
                  </p>
                  <h3 className="cp-hand mt-3 text-2xl text-[var(--cp-ink)]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--cp-ink-2)]">
                    {step.description}
                  </p>
                </PaperCard>
              </li>
            ))}
          </ol>
        </section>

        <section className="cp-sec grid gap-6 lg:grid-cols-2">
          <PaperCard className="p-7 md:p-9">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--cp-orange-deep)]">
              In context
            </p>
            <h2 className="cp-hand mt-2 text-4xl text-[var(--cp-ink)]">{contextTitle}</h2>
            <p className="mt-3 leading-relaxed text-[var(--cp-ink-2)]">{contextDescription}</p>
            <ul className="mt-5 space-y-2.5 text-sm font-medium text-[var(--cp-ink-2)]">
              {contextItems.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </PaperCard>

          <CrayonBox
            solid="var(--cp-navy)"
            radius={26}
            showLine={false}
            className="flex flex-col justify-between p-7 text-white md:p-9"
          >
            <div>
              <h2 className="cp-hand text-4xl text-white">Make the next choice easier</h2>
              <p className="mt-3 leading-relaxed text-[var(--cp-navy-sub)]">
                Create an account to use this capability with your wardrobe. Keep working while
                supported tasks run and return to clear results.
              </p>
            </div>
            <div className="mt-7">
              <CrayonLink to={trialRegisterHref()} variant="yellow" size="sm">
                Create your free account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </CrayonLink>
            </div>
          </CrayonBox>
        </section>

        <section className="cp-sec">
          <h2 className="cp-h2">Keep building your wardrobe</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {relatedFeatures.map((feature, i) => (
              <Link key={feature.href} to={feature.href} className="block">
                <CrayonBox
                  fill={RELATED_FILLS[i % RELATED_FILLS.length]}
                  radius={24}
                  className="cp-post h-full"
                >
                  <h3>{feature.title}</h3>
                  <p className="post-box">{feature.description}</p>
                  <span className="go">
                    Explore <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </CrayonBox>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
