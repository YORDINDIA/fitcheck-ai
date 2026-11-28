import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Camera,
  Shirt,
  Sparkles,
  Sun,
  User,
} from 'lucide-react'

import { CrayonBox, CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import SEO from '@/components/seo/SEO'
import { PAGE_SEO, SEO_CONFIG } from '@/components/seo/seo-config'
import { trialRegisterHref } from '@/lib/trial-offer'

const features = [
  {
    icon: Camera,
    title: 'AI Wardrobe Extraction',
    description:
      'Photograph clothes and review detected items, colors, and categories before saving a digital closet.',
    href: '/features/ai-wardrobe-extraction',
    keyword: 'AI wardrobe organizer',
    fill: 'var(--cp-peach-deep)',
  },
  {
    icon: User,
    title: 'Virtual Try-On',
    description:
      'See outfits on yourself with AI visualization before you leave the house or buy something new.',
    href: '/features/virtual-try-on',
    keyword: 'AI virtual try-on',
    fill: 'var(--cp-mint)',
  },
  {
    icon: Sparkles,
    title: 'AI Photoshoot Generator',
    description:
      'Create LinkedIn, dating, and social-ready images from your selfies without a studio session.',
    href: '/features/ai-photoshoot-generator',
    keyword: 'AI photoshoot',
    fill: 'var(--cp-lilac)',
  },
  {
    icon: Sun,
    title: 'Outfit Recommendations',
    description:
      'Daily “what to wear” ideas from clothes you own, with weather and occasion context.',
    href: '/features/outfit-recommendations',
    keyword: 'AI outfit planner',
    fill: 'var(--cp-sky)',
  },
  {
    icon: BarChart3,
    title: 'Wardrobe Analytics',
    description:
      'Cost-per-wear style insights and utilization so you buy less and wear more of what you own.',
    href: '/features/wardrobe-analytics',
    keyword: 'wardrobe analytics',
    fill: 'var(--cp-yellow-banner)',
  },
]

const breadcrumbs = [
  { name: 'Home', url: `${SEO_CONFIG.siteUrl}/` },
  { name: 'Features', url: `${SEO_CONFIG.siteUrl}/features` },
]

export default function FeaturesIndexPage() {
  return (
    <>
      <SEO
        title={PAGE_SEO.features.title}
        description={PAGE_SEO.features.description}
        canonicalUrl={`${SEO_CONFIG.siteUrl}/features`}
        keywords="AI wardrobe features, virtual try-on, outfit planner, digital closet app"
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <div className="cp-wrap">
        <section className="cp-doc-head">
          <p className="cp-eyebrow inline-flex items-center justify-center gap-2">
            <Shirt className="h-4 w-4" aria-hidden="true" />
            PRODUCT FEATURES
          </p>
          <h1>Everything in your AI virtual closet.</h1>
          <p className="cp-lead">
            {SEO_CONFIG.positioning} Explore each capability below — then start free with a few
            photos of clothes you already own.
          </p>
          <div className="cp-ctas">
            <CrayonLink to={trialRegisterHref()} variant="orange">
              Start free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
            <CrayonLink to="/best/virtual-closet-apps" variant="dark">
              Compare virtual closet apps
            </CrayonLink>
          </div>
        </section>

        <section className="cp-sec">
          <div className="cp-posts">
            {features.map((feature) => (
              <Link key={feature.href} to={feature.href} className="block">
                <CrayonBox fill={feature.fill} radius={26} className="cp-post h-full">
                  <div className="flex items-center justify-between gap-3">
                    <span className="kind">{feature.keyword}</span>
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                      <feature.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <h3>{feature.title}</h3>
                  <p className="post-box">{feature.description}</p>
                  <span className="go">
                    Learn more <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </CrayonBox>
              </Link>
            ))}
          </div>

          <CrayonBox solid="var(--cp-yellow-banner)" radius={30} showLine={false} className="cp-doc-cta">
            <h2>Guides &amp; comparisons</h2>
            <p className="mx-auto max-w-xl text-base font-medium text-[var(--cp-ink-2)]">
              Researching the category? Start here before you commit a full wardrobe to any app.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <CrayonLink to="/guides/how-to-digitize-your-wardrobe" variant="paper" size="sm">
                Digitize your wardrobe
              </CrayonLink>
              <CrayonLink to="/compare/fitcheck-vs-acloset" variant="paper" size="sm">
                FitCheck vs Acloset
              </CrayonLink>
              <CrayonLink to="/tools/cost-per-wear-calculator" variant="dark" size="sm">
                Cost-per-wear calculator
              </CrayonLink>
            </div>
          </CrayonBox>
        </section>
      </div>
    </>
  )
}
