import { useState } from 'react'
import { Mail } from 'lucide-react'

import { CrayonBox, CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import SEO from '@/components/seo/SEO'
import { freeVsProSummary, platformsSummary } from '@/lib/plan-limits'
import { trialRegisterHref } from '@/lib/trial-offer'

const faqCategories = [
  {
    category: 'Getting Started',
    questions: [
      {
        q: 'How does FitCheck AI work?',
        a: 'FitCheck AI uses advanced computer vision and machine learning to help you organize your wardrobe and create outfits. Simply upload photos of your clothes, and our AI automatically catalogs them with details like color, category, and style. You can then create outfits, get AI-powered recommendations, and visualize looks with our virtual try-on feature.',
      },
      {
        q: 'Is FitCheck AI free to use?',
        a: `Yes. ${freeVsProSummary()}`,
      },
      {
        q: 'Do I need to download an app?',
        a: platformsSummary(),
      },
      {
        q: 'What devices and browsers are supported?',
        a: 'FitCheck AI works on modern browsers including Chrome, Safari, Firefox, and Edge. The iOS app is on the App Store and the Android app is on Google Play. The web app is fully responsive on phones, tablets, and desktops.',
      },
    ],
  },
  {
    category: 'AI Features',
    questions: [
      {
        q: 'How accurate is the AI item extraction?',
        a: 'AI item extraction can suggest clothing items, colors, and categories from a photo. Use clear, well-lit images and review every suggested detail before saving it to your wardrobe.',
      },
      {
        q: 'What is the AI Photoshoot Generator?',
        a: 'The AI Photoshoot Generator creates professional-quality photos from your uploaded selfies. Choose from styles like LinkedIn professional, dating app photos, Instagram lifestyle, or model portfolio shots. Upload 1-4 reference photos, and our AI generates stunning images perfect for your needs.',
      },
      {
        q: 'How do outfit recommendations work?',
        a: 'Our AI analyzes your entire wardrobe, style preferences, past outfit choices, weather conditions, and even your calendar events to suggest perfect outfits. Recommendations consider color coordination, occasion appropriateness, weather suitability, and your personal style patterns.',
      },
      {
        q: 'What is virtual try-on?',
        a: 'Virtual try-on uses generative AI to visualize how outfit combinations would look when worn. Upload a photo of yourself or use your AI photoshoot avatar, and see realistic renderings of any outfit from your wardrobe before you wear it.',
      },
      {
        q: 'Can the AI extract multiple items from one photo?',
        a: 'Yes! Our advanced AI can detect and separate multiple clothing items from a single photograph. This makes cataloging your wardrobe much faster—you can lay out several items, take one photo, and the AI will identify each piece individually.',
      },
    ],
  },
  {
    category: 'Privacy & Security',
    questions: [
      {
        q: 'Is my wardrobe data private?',
        a: 'Absolutely. Your wardrobe data is private by default and encrypted both in transit and at rest. We never sell your data to third parties. Only you can see your wardrobe unless you explicitly choose to share specific outfits via public links.',
      },
      {
        q: 'What happens to my photos?',
        a: 'Your photos are stored securely in encrypted cloud storage. They are used solely to provide FitCheck AI services to you. You can delete your photos and account data at any time, and we will permanently remove all associated data within 30 days.',
      },
      {
        q: 'Can I export my data?',
        a: 'Yes! You can export your complete wardrobe data, including item details and photos, at any time. We provide exports in standard formats like CSV and JSON for easy portability.',
      },
      {
        q: 'Is my payment information secure?',
        a: 'Yes. On iOS, subscriptions are purchased through Apple In-App Purchase and billed by Apple; on Android, through Google Play Billing. On the web, payments are handled by Stripe, a PCI-compliant payment processor. Your card details are never stored on our servers, and all transactions are encrypted.',
      },
    ],
  },
  {
    category: 'Account & Billing',
    questions: [
      {
        q: 'How do I upgrade to Pro?',
        a: 'You can upgrade to Pro from your account settings or by clicking "Upgrade" in the app. In the mobile apps, purchases go through the App Store or Google Play; on the web, through our checkout. Your subscription automatically renews monthly or annually depending on your chosen plan.',
      },
      {
        q: 'Can I cancel my subscription?',
        a: "Yes. Subscriptions purchased through the App Store or Google Play are managed in the store's subscription settings; web subscriptions can be cancelled from your account settings. You will continue to have access to Pro features until the end of your current billing period, after which your account will revert to the free plan.",
      },
      {
        q: 'Do you offer refunds?',
        a: "For web purchases, we offer a 14-day money-back guarantee for new Pro subscriptions — contact our support team within 14 days of your purchase for a full refund. Purchases made through the App Store or Google Play are subject to the store's refund terms.",
      },
      {
        q: 'How does the referral program work?',
        a: 'When you refer friends to FitCheck AI, both you and your friend receive 1 month of Pro free when they sign up using your referral code. There is no limit to how many friends you can refer!',
      },
    ],
  },
  {
    category: 'Comparisons & Buying Decisions',
    questions: [
      {
        q: 'What is the best free virtual closet app?',
        a: 'The best free virtual closet is the one that lets you digitize real clothes quickly and still get outfit help. FitCheck AI offers a free plan with wardrobe item limits and monthly AI generations so you can validate value before upgrading. Compare options on our best virtual closet apps guide.',
      },
      {
        q: 'How is FitCheck AI different from Acloset or Whering?',
        a: 'FitCheck AI emphasizes AI photo extraction, generative virtual try-on, AI photoshoot generation, and cost-per-wear style analytics in one product. Acloset and Whering are strong digital wardrobe apps with different feature mixes — see our comparison pages for a side-by-side overview.',
      },
      {
        q: 'Can virtual try-on replace trying clothes in a store?',
        a: 'Virtual try-on is decision support, not a perfect fit guarantee. It helps you visualize color, silhouette, and full outfits with clothes you already own. Always check size charts for purchases; use try-on to reduce obvious mismatches before you buy or pack.',
      },
      {
        q: 'Does FitCheck AI work for festive and wedding guest outfits?',
        a: 'Yes. Digitize ethnic and formal pieces, tag occasions, and generate event-ready looks from your real wardrobe. See our festive and wedding outfit planning page for a practical workflow.',
      },
    ],
  },
]

function generateFaqSchema() {
  const allQuestions = faqCategories.flatMap((cat) =>
    cat.questions.map((q) => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.a,
      },
    })),
  )

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allQuestions,
  }
}

function FAQItem({
  index,
  question,
  answer,
}: {
  index: number
  question: string
  answer: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const num = String(index + 1).padStart(2, '0')
  const triggerId = `faq-page-btn-${index}`
  const panelId = `faq-page-panel-${index}`

  return (
    <li className="cp-faq-item" data-open={isOpen}>
      <button
        id={triggerId}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((v) => !v)}
        className="cp-faq-btn"
      >
        <span className="cp-faq-n">{num}</span>
        <span className="cp-faq-q">{question}</span>
        <span className="cp-pm" aria-hidden="true">
          {isOpen ? '−' : '+'}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="cp-faq-a"
        ref={(el) => {
          if (el) {
            const panel = el as HTMLDivElement & { inert: boolean }
            panel.inert = !isOpen
          }
        }}
      >
        <div>
          <p className="cp-faq-body">{answer}</p>
        </div>
      </div>
    </li>
  )
}

const breadcrumbs = [
  { name: 'Home', url: 'https://fitcheckaiapp.com/' },
  { name: 'FAQ', url: 'https://fitcheckaiapp.com/faq' },
]

export default function FAQPage() {
  const faqSchema = generateFaqSchema()
  let counter = 0

  return (
    <>
      <SEO
        title="FAQ | FitCheck AI Virtual Closet & Outfit Planner"
        description="Answers about AI wardrobe extraction, virtual try-on, photoshoots, pricing, privacy, and how FitCheck AI organizes your clothes."
        canonicalUrl="https://fitcheckaiapp.com/faq"
        keywords="FitCheck AI FAQ, virtual closet questions, AI outfit planner help"
        jsonLd={faqSchema}
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <div className="cp-wrap">
        <section className="cp-doc-head">
          <p className="cp-eyebrow">FAQ</p>
          <h1>Frequently Asked Questions</h1>
          <p className="cp-lead">Everything you need to know about FitCheck AI.</p>
        </section>

        <div className="mx-auto mt-12 max-w-[820px] space-y-12">
          {faqCategories.map((category) => (
            <section key={category.category}>
              <h2 className="cp-hand text-3xl text-[var(--cp-ink)]">{category.category}</h2>
              <ol className="cp-faq !mt-4">
                {category.questions.map((q) => {
                  const idx = counter++
                  return <FAQItem key={q.q} index={idx} question={q.q} answer={q.a} />
                })}
              </ol>
            </section>
          ))}

          <CrayonBox fill="var(--cp-sky)" radius={26} className="cp-mailcard">
            <h2 className="cp-hand text-3xl text-[var(--cp-ink)]">Still have questions?</h2>
            <p className="text-sm font-medium text-[var(--cp-ink-2)]">
              Our support team is here to help you get the most out of FitCheck AI.
            </p>
            <a
              href="mailto:support@fitcheckaiapp.com"
              className="addr inline-flex min-h-11 items-center gap-2 hover:text-[var(--cp-orange-deep)]"
            >
              <Mail className="h-6 w-6" aria-hidden="true" />
              support@fitcheckaiapp.com
            </a>
          </CrayonBox>

          <CrayonBox solid="var(--cp-yellow-banner)" radius={32} showLine={false} className="cp-doc-cta">
            <h2>Ready to transform your wardrobe?</h2>
            <p className="mx-auto max-w-xl text-base font-medium text-[var(--cp-ink-2)]">
              Start with the clothes you already own.
            </p>
            <div className="cp-ctas">
              <CrayonLink to={trialRegisterHref()} variant="dark">
                Get Started Free
              </CrayonLink>
            </div>
          </CrayonBox>
        </div>
      </div>
    </>
  )
}
