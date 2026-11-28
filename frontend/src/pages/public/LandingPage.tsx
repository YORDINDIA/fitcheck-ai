import Hero from '@/components/landing/Hero'
import CaptureSources from '@/components/landing/CaptureSources'
import ClosetStage from '@/components/landing/ClosetStage'
import Features from '@/components/landing/Features'
import StylePreview from '@/components/landing/StylePreview'
import DemoSection from '@/components/landing/DemoSection'
import WhoItsFor from '@/components/landing/WhoItsFor'
import Pricing from '@/components/landing/Pricing'
import GuidesStrip from '@/components/landing/GuidesStrip'
import FAQ, { LANDING_FAQS } from '@/components/landing/FAQ'
import CTASection from '@/components/landing/CTASection'
import SEO from '@/components/seo/SEO'
import { PAGE_SEO, SEO_CONFIG } from '@/components/seo/seo-config'
import {
  buildFaqSchema,
  buildHowToSchema,
  buildFeatureItemListSchema,
} from '@/components/seo/JsonLd'

const HOW_TO_STEPS = [
  {
    name: 'Photograph',
    text: 'Photograph a pile, a hang, or single pieces you own. FitCheck finds every garment in the photo.',
    url: `${SEO_CONFIG.siteUrl}/#step-photograph`,
  },
  {
    name: 'Catalog',
    text: 'Each piece is cut out and tagged with its category, colors, and material. You review it before it saves.',
    url: `${SEO_CONFIG.siteUrl}/#step-catalog`,
  },
  {
    name: 'Wear',
    text: 'Get outfits from what you own, matched to the weather and your plans, and preview them before you wear them.',
    url: `${SEO_CONFIG.siteUrl}/#step-wear`,
  },
]

const FEATURE_LIST = [
  {
    name: 'AI wardrobe extraction',
    url: `${SEO_CONFIG.siteUrl}/features/ai-wardrobe-extraction`,
    description: 'Digitize clothes from photos with automatic color, category, and style tags.',
  },
  {
    name: 'Virtual try-on',
    url: `${SEO_CONFIG.siteUrl}/features/virtual-try-on`,
    description: 'Preview outfits on you before you wear them.',
  },
  {
    name: 'AI outfit recommendations',
    url: `${SEO_CONFIG.siteUrl}/features/outfit-recommendations`,
    description: 'Daily, weather-aware outfit ideas from clothes you own.',
  },
  {
    name: 'AI photoshoot generator',
    url: `${SEO_CONFIG.siteUrl}/features/ai-photoshoot-generator`,
    description: 'LinkedIn, dating, and social photos from a phone selfie.',
  },
  {
    name: 'Wardrobe analytics',
    url: `${SEO_CONFIG.siteUrl}/features/wardrobe-analytics`,
    description: 'Cost-per-wear and utilization insights for smarter buying.',
  },
]

export default function LandingPage() {
  const faqSchema = buildFaqSchema(LANDING_FAQS)
  const howToSchema = buildHowToSchema({
    name: 'How to use FitCheck AI as a virtual closet',
    description:
      'Photograph your clothes, catalog them with AI, and wear better outfits every day with FitCheck AI.',
    steps: HOW_TO_STEPS,
  })
  const featureListSchema = buildFeatureItemListSchema(FEATURE_LIST)

  return (
    <div>
      <SEO
        title={PAGE_SEO.landing.title}
        description={PAGE_SEO.landing.description}
        canonicalUrl={`${SEO_CONFIG.siteUrl}/`}
        keywords="virtual closet app, AI wardrobe organizer, AI outfit planner, digital wardrobe, virtual try-on, AI fashion, AI photoshoot, cost per wear"
        jsonLd={[faqSchema, howToSchema, featureListSchema]}
      />
      <Hero />
      <CaptureSources />
      <ClosetStage />
      <Features />
      <StylePreview />
      <DemoSection />
      <WhoItsFor />
      <Pricing />
      <GuidesStrip />
      <FAQ />
      <CTASection />
    </div>
  )
}
