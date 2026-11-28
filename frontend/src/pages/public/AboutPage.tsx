import { ArrowRight, Heart, Shield, Sparkles, Users } from 'lucide-react'

import { CrayonBox, CrayonLink, PaperCard } from '@/components/crayon/CrayonPrimitives'
import SEO from '@/components/seo/SEO'
import { PAGE_SEO, SEO_CONFIG } from '@/components/seo/seo-config'
import { trialRegisterHref } from '@/lib/trial-offer'

const values = [
  {
    icon: Sparkles,
    title: 'Innovation first',
    description:
      'We push AI and fashion tech so everyday dressing gets easier—not more complicated.',
    fill: 'var(--cp-peach-deep)',
  },
  {
    icon: Users,
    title: 'User-centric',
    description:
      'Every feature starts with real closet friction. Your feedback shapes the roadmap.',
    fill: 'var(--cp-sky)',
  },
  {
    icon: Shield,
    title: 'Privacy matters',
    description:
      'Your wardrobe is personal. We do not sell your data and you control what you share.',
    fill: 'var(--cp-mint)',
  },
  {
    icon: Heart,
    title: 'Sustainability',
    description:
      'Helping you wear what you own reduces waste and impulse buys that do not fit your life.',
    fill: 'var(--cp-pink)',
  },
]

export default function AboutPage() {
  return (
    <>
      <SEO
        title={PAGE_SEO.about.title}
        description={PAGE_SEO.about.description}
        canonicalUrl={`${SEO_CONFIG.siteUrl}/about`}
        keywords="about FitCheck AI, AI wardrobe company, virtual closet app"
      />
      <div className="cp-wrap">
        <section className="cp-doc-head">
          <p className="cp-eyebrow">ABOUT US</p>
          <h1>Making everyday outfits effortless.</h1>
          <p className="cp-lead">
            We believe everyone deserves to feel confident in what they wear. FitCheck AI helps you
            digitize the closet you already own and get AI outfit ideas that fit the day.
          </p>
        </section>

        <CrayonBox className="cp-doc" radius={30}>
          <div className="inner cp-prose">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[var(--cp-orange-deep)]">
              Our story
            </p>
            <h2 className="!mt-2">Born from a simple frustration</h2>
            <p>
              Like many people, our founders stood in front of full closets every morning and still
              felt like they had nothing to wear—cycling through the same few outfits.
            </p>
            <p>
              FitCheck AI started as a question: what if AI could help you see and use what you
              already own? Photograph clothes once, get outfits for weather, occasions, and try-on
              previews when you need them.
            </p>

            <PaperCard className="mt-6 p-6">
              <h3 className="!mt-0">What we build for</h3>
              <ul className="mt-3">
                <li>Busy people who want a faster morning decision</li>
                <li>Creators and professionals who need reliable looks</li>
                <li>Anyone trying to buy less and wear more of what fits</li>
              </ul>
            </PaperCard>
          </div>
        </CrayonBox>

        <section className="cp-sec">
          <p className="cp-eyebrow">OUR PRINCIPLES</p>
          <h2 className="cp-h2">What we value</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <CrayonBox key={value.title} fill={value.fill} radius={24} className="cp-card">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                  <value.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-4 !text-[32px]">{value.title}</h3>
                <p className="card-copy">{value.description}</p>
              </CrayonBox>
            ))}
          </div>
        </section>

        <CrayonBox solid="var(--cp-yellow-banner)" radius={32} showLine={false} className="cp-end cp-sec">
          <h2 className="cp-h2">Start free today.</h2>
          <p className="cp-sub">
            Create an account on the web, or get the app on the App Store or Google Play.
          </p>
          <div className="cp-ctas">
            <CrayonLink to={trialRegisterHref()} variant="dark">
              Start free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
          </div>
        </CrayonBox>
      </div>
    </>
  )
}
