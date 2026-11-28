import { Link } from 'react-router-dom'
import { ArrowRight, Check, Play } from 'lucide-react'

import { CrayonBox, CrayonLink, PaperCard } from '@/components/crayon/CrayonPrimitives'
import { BreadcrumbJsonLd, buildFaqSchema } from '@/components/seo/JsonLd'
import SEO from '@/components/seo/SEO'
import { SEO_CONFIG } from '@/components/seo/seo-config'
import { trialRegisterHref } from '@/lib/trial-offer'

export interface SeoFaq {
  question: string
  answer: string
}

export interface SeoStat {
  value: string
  label: string
}

export interface SeoSource {
  label: string
  url: string
}

export interface SeoSection {
  heading: string
  body: string | string[]
  bullets?: string[]
}

export interface SeoRelatedLink {
  label: string
  href: string
}

export interface SeoPageContent {
  path: string
  title: string
  description: string
  h1: string
  lede: string
  breadcrumbs: Array<{ name: string; path: string }>
  sections: SeoSection[]
  faqs: SeoFaq[]
  relatedLinks?: SeoRelatedLink[]
  keywords?: string
  ctaPrimary?: { label: string; href: string }
  ctaSecondary?: { label: string; href: string; external?: boolean }
  stats?: SeoStat[]
  sources?: SeoSource[]
  lastUpdated?: string
}

const PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.fitcheckaiapp.fitcheckai&hl=en_IN'

export function SeoPageLayout({ content }: { content: SeoPageContent }) {
  const canonical = `${SEO_CONFIG.siteUrl}${content.path}`
  const breadcrumbItems = content.breadcrumbs.map((b) => ({
    name: b.name,
    url: b.path.startsWith('http') ? b.path : `${SEO_CONFIG.siteUrl}${b.path}`,
  }))

  const faqSchema = content.faqs.length ? buildFaqSchema(content.faqs) : undefined
  const primary = content.ctaPrimary || { label: 'Start free', href: trialRegisterHref() }
  const secondary = content.ctaSecondary || {
    label: 'Get the app',
    href: PLAY_STORE,
    external: true,
  }

  return (
    <>
      <SEO
        title={content.title}
        description={content.description}
        canonicalUrl={canonical}
        keywords={content.keywords}
        jsonLd={faqSchema}
      />
      <BreadcrumbJsonLd items={breadcrumbItems} />

      <div className="cp-wrap">
        <section className="cp-doc-head">
          <nav className="cp-crumbs" aria-label="Breadcrumb">
            {content.breadcrumbs.map((b, i) => (
              <span key={b.path} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {i < content.breadcrumbs.length - 1 ? (
                  <Link to={b.path}>{b.name}</Link>
                ) : (
                  <span className="text-[var(--cp-ink)]">{b.name}</span>
                )}
              </span>
            ))}
          </nav>

          <h1>{content.h1}</h1>
          <p className="cp-lead">{content.lede}</p>
          {content.lastUpdated && (
            <p className="meta">Last updated {formatLastUpdated(content.lastUpdated)}</p>
          )}

          {content.stats && content.stats.length > 0 && (
            <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              {content.stats.map((stat) => (
                <PaperCard key={stat.label} className="px-4 py-3 text-left">
                  <p className="cp-hand text-3xl text-[var(--cp-orange-deep)]">{stat.value}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--cp-ink-3)]">{stat.label}</p>
                </PaperCard>
              ))}
            </div>
          )}

          <div className="cp-ctas">
            <CrayonLink to={primary.href} variant="orange">
              {primary.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
            {secondary.external ? (
              <a
                href={secondary.href}
                target="_blank"
                rel="noopener noreferrer"
                className="cp-btn dark cp-cr"
              >
                <span className="cp-solid" aria-hidden="true" />
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {secondary.label}
              </a>
            ) : (
              <CrayonLink to={secondary.href} variant="dark">
                {secondary.label}
              </CrayonLink>
            )}
          </div>
          <p className="mt-4 text-sm font-medium text-[var(--cp-ink-3)]">
            Free plan available. No credit card required to start.
          </p>
        </section>

        <CrayonBox as="aside" className="cp-doc" radius={30}>
          <article className="inner cp-prose">
            {content.sections.map((section) => (
              <div key={section.heading}>
                <h2>{section.heading}</h2>
                {Array.isArray(section.body) ? (
                  section.body.map((p) => <p key={p.slice(0, 40)}>{p}</p>)
                ) : (
                  <p>{section.body}</p>
                )}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="cp-wins mt-4 !grid">
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {content.faqs.length > 0 && (
              <div>
                <h2>Frequently asked questions</h2>
                <div className="mt-4 space-y-4">
                  {content.faqs.map((faq, idx) => (
                    <PaperCard key={faq.question} className="p-5">
                      <h3 className="!mt-0 flex items-baseline gap-2 text-2xl">
                        <span className="font-mono text-xs font-bold text-[var(--cp-orange-deep)]">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span>{faq.question}</span>
                      </h3>
                      <p className="mt-2 text-base text-[var(--cp-ink-2)]">{faq.answer}</p>
                    </PaperCard>
                  ))}
                </div>
              </div>
            )}

            {content.sources && content.sources.length > 0 && (
              <div>
                <h2>Sources</h2>
                <ul>
                  {content.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {content.relatedLinks && content.relatedLinks.length > 0 && (
              <div>
                <h2>Related</h2>
                <div className="flex flex-wrap gap-2.5 pt-2">
                  {content.relatedLinks.map((link) => (
                    <Link
                      key={link.href}
                      to={link.href}
                      className="cp-chip transition-transform hover:-translate-y-0.5"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>
        </CrayonBox>

        <CrayonBox
          solid="var(--cp-yellow-banner)"
          radius={30}
          showLine={false}
          className="cp-doc-cta mx-auto max-w-[820px]"
        >
          <h2>Ready to try FitCheck AI?</h2>
          <p className="mx-auto max-w-xl text-base font-medium text-[var(--cp-ink-2)]">
            Photograph a few pieces, build your digital closet, and see an outfit idea from clothes
            you own.
          </p>
          <div className="cp-ctas">
            <CrayonLink to={trialRegisterHref()} variant="dark">
              Start free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
            <CrayonLink to="/features" variant="paper">
              Explore features
            </CrayonLink>
          </div>
        </CrayonBox>
      </div>
    </>
  )
}

export default SeoPageLayout

export function formatLastUpdated(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
