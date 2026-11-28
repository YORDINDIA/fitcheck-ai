import { useState } from 'react'
import { Link } from 'react-router-dom'
import { freeVsProSummary, platformsSummary, PLAN_LIMITS } from '@/lib/plan-limits'

/** Shared with LandingPage FAQ schema so visible copy and JSON-LD stay in sync. */
export const LANDING_FAQS = [
  {
    question: 'What is FitCheck AI?',
    answer:
      'FitCheck AI is an AI virtual closet and outfit planner. Photograph your clothes to build a digital wardrobe, then get weather-aware outfit ideas, virtual try-on, AI photoshoots, and wardrobe analytics from the clothes you already own. It runs on web, iOS, and Android.',
  },
  {
    question: 'What is a virtual closet app?',
    answer:
      'A virtual closet app digitizes your real clothes so you can browse, mix, and plan outfits without digging through a physical wardrobe. FitCheck goes further with AI item extraction from photos, generative try-on and photoshoots, and daily recommendations grounded in your inventory.',
  },
  {
    question: 'How does AI wardrobe extraction work?',
    answer:
      'Upload a photo of your clothes: single pieces, a flat lay, a hang or a pile. FitCheck identifies each item, extracts colors, categorizes it (tops, bottoms, shoes, and more), and adds style tags. Review the extracted details before saving. Multi-item photos and batch uploads are supported in the app.',
  },
  {
    question: 'Is FitCheck AI free?',
    answer: freeVsProSummary(),
  },
  {
    question: 'How does the first month of Pro free work?',
    answer:
      'Every new account can claim its first month of Pro free. No credit card is required. Sign up through the offer link (or enter the code at signup) and Pro is applied to your account. After the free month, the account returns to the Free plan unless you choose to upgrade, so nothing is charged automatically.',
  },
  {
    question: 'How is FitCheck different from Acloset or Whering?',
    answer:
      'FitCheck focuses on photo-to-wardrobe AI extraction, generative virtual try-on, AI photoshoot generation, weather-aware recommendations, and cost-per-wear analytics in one product. Side-by-side comparisons: https://fitcheckaiapp.com/compare/fitcheck-vs-acloset and https://fitcheckaiapp.com/compare/fitcheck-vs-whering. Also see https://fitcheckaiapp.com/best/virtual-closet-apps.',
  },
  {
    question: 'Does virtual try-on use my real clothes?',
    answer: `Yes. Try-on is built around pieces in your wardrobe or photos you provide, so you visualize combinations of clothes you actually own, not only brand catalog garments. Monthly generation limits apply per plan: ${PLAN_LIMITS.free.monthlyGenerations} on Free, ${PLAN_LIMITS.plus.monthlyGenerations} on Plus, ${PLAN_LIMITS.pro.monthlyGenerations.toLocaleString()} on Pro.`,
  },
  {
    question: 'What can I use the AI photoshoot for?',
    answer: `Create professional-looking images from selfies for LinkedIn, dating apps, Instagram, portfolios, or a custom prompt. Daily limits: ${PLAN_LIMITS.free.dailyPhotoshootImages} photoshoot images on Free, ${PLAN_LIMITS.plus.dailyPhotoshootImages} on Plus, ${PLAN_LIMITS.pro.dailyPhotoshootImages} on Pro. A short unauthenticated demo is available on the homepage.`,
  },
  {
    question: 'Who is FitCheck for?',
    answer:
      'Busy professionals who want faster mornings, content creators planning looks, festive and wedding guests digitizing occasion wear, and anyone with a full closet who still feels stuck. More at https://fitcheckaiapp.com/for/busy-professionals, https://fitcheckaiapp.com/for/content-creators, and https://fitcheckaiapp.com/for/festive-and-wedding-outfits.',
  },
  {
    question: 'Is my wardrobe data private?',
    answer:
      'Yes. Photos and wardrobe data are encrypted in transit and at rest. We do not sell your data. You can delete your account and data at any time. Full details: https://fitcheckaiapp.com/privacy.',
  },
  {
    question: 'Can I use FitCheck on mobile?',
    answer: platformsSummary(),
  },
  {
    question: 'Do you have a referral program?',
    answer:
      'Yes. Share your referral link from the app. When a friend joins, you both get one month of Pro. Details appear in your dashboard after you sign up.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Cancel whenever you want. Pro access continues through the end of the billing period, then the account returns to Free.',
  },
]

function FAQItem({
  index,
  question,
  answer,
  defaultOpen = false,
}: {
  index: number
  question: string
  answer: string
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const num = String(index + 1).padStart(2, '0')
  const triggerId = `landing-faq-btn-${index}`
  const panelId = `landing-faq-panel-${index}`

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
          <div className="cp-faq-body space-y-2">
            <p>{answer}</p>
            {question.includes('Acloset') && (
              <p className="text-sm font-semibold">
                <Link
                  to="/compare/fitcheck-vs-acloset"
                  className="text-[var(--cp-orange-deep)] underline"
                >
                  FitCheck vs Acloset
                </Link>
                {' · '}
                <Link
                  to="/compare/fitcheck-vs-whering"
                  className="text-[var(--cp-orange-deep)] underline"
                >
                  FitCheck vs Whering
                </Link>
                {' · '}
                <Link
                  to="/best/virtual-closet-apps"
                  className="text-[var(--cp-orange-deep)] underline"
                >
                  Best virtual closet apps
                </Link>
              </p>
            )}
            {question.includes('Who is FitCheck') && (
              <p className="text-sm font-semibold">
                <Link
                  to="/for/busy-professionals"
                  className="text-[var(--cp-orange-deep)] underline"
                >
                  Professionals
                </Link>
                {' · '}
                <Link
                  to="/for/content-creators"
                  className="text-[var(--cp-orange-deep)] underline"
                >
                  Creators
                </Link>
                {' · '}
                <Link
                  to="/for/festive-and-wedding-outfits"
                  className="text-[var(--cp-orange-deep)] underline"
                >
                  Festive &amp; wedding
                </Link>
              </p>
            )}
            {question.includes('private') && (
              <p className="text-sm font-semibold">
                <Link to="/privacy" className="text-[var(--cp-orange-deep)] underline">
                  Privacy Policy
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

export default function FAQ() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="cp-wrap cp-sec"
    >
      <p className="cp-eyebrow">FAQ</p>
      <h2 id="faq-heading" className="cp-h2">
        Questions, answered.
      </h2>
      <p className="cp-sub">
        Product, privacy, billing, and platform answers in one place.{' '}
        <Link
          to="/faq"
          className="font-bold text-[var(--cp-orange-deep)] underline underline-offset-4"
        >
          Open the full FAQ →
        </Link>
      </p>

      <ol className="cp-faq">
        {LANDING_FAQS.map((faq, index) => (
          <FAQItem key={faq.question} index={index} defaultOpen={index === 0} {...faq} />
        ))}
      </ol>
    </section>
  )
}
