import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calculator } from 'lucide-react'

import { CrayonBox, CrayonLink, PaperCard } from '@/components/crayon/CrayonPrimitives'
import { BreadcrumbJsonLd, buildFaqSchema } from '@/components/seo/JsonLd'
import SEO from '@/components/seo/SEO'
import { SEO_CONFIG } from '@/components/seo/seo-config'
import { trialRegisterHref } from '@/lib/trial-offer'

const PATH = '/tools/cost-per-wear-calculator'
const CANONICAL = `${SEO_CONFIG.siteUrl}${PATH}`

const FAQS = [
  {
    question: 'What is cost per wear?',
    answer:
      'Cost per wear (CPW) is the item price divided by the number of times you wear it. It is the most useful number for deciding whether a purchase was worth it and what to buy next.',
  },
  {
    question: 'What is a good cost per wear?',
    answer:
      'It depends on your income and the category. A useful rule: under $1 per wear for everyday items is strong value; $1–5 is typical for quality pieces; above $10 per wear means the item is either luxury or barely worn.',
  },
  {
    question: 'How do I increase the number of wears?',
    answer:
      'Plan outfits from your real wardrobe, keep a shortlist of go-to combinations, and re-wear quality pieces before buying new ones. Wear tracking in FitCheck AI makes this automatic.',
  },
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function cpwInsight(cpw: number): { label: string; tone: string } {
  if (cpw <= 0) {
    return {
      label: 'Enter a price and wears to see your cost per wear.',
      tone: 'text-[var(--cp-ink-3)]',
    }
  }
  if (cpw < 1) {
    return {
      label: 'Excellent value — this item has earned its cost.',
      tone: 'text-[var(--cp-green)]',
    }
  }
  if (cpw <= 5) {
    return {
      label: 'Solid value — typical for quality, well-worn pieces.',
      tone: 'text-[var(--cp-ink-2)]',
    }
  }
  if (cpw <= 10) {
    return {
      label: 'On the higher side — wear it more to lower the number.',
      tone: 'text-[var(--cp-orange-deep)]',
    }
  }
  return {
    label: 'High cost per wear — wear it more or skip similar buys.',
    tone: 'text-[var(--cp-red)]',
  }
}

export default function CostPerWearCalculatorPage() {
  const [price, setPrice] = useState('')
  const [wears, setWears] = useState('')

  const priceNum = parseFloat(price)
  const wearsNum = parseInt(wears, 10)
  const cpw =
    Number.isFinite(priceNum) && Number.isFinite(wearsNum) && priceNum > 0 && wearsNum > 0
      ? priceNum / wearsNum
      : 0
  const insight = cpwInsight(cpw)
  const breadcrumbs = [
    { name: 'Home', url: `${SEO_CONFIG.siteUrl}/` },
    { name: 'Cost per wear calculator', url: CANONICAL },
  ]

  return (
    <>
      <SEO
        title="Cost Per Wear Calculator — Free & Instant | FitCheck AI"
        description="Calculate the true cost per wear of any clothing item in seconds. Free tool with wardrobe analytics tips."
        canonicalUrl={CANONICAL}
        keywords="cost per wear calculator, cost per use calculator, clothing cost calculator"
        jsonLd={buildFaqSchema(FAQS)}
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <div className="cp-wrap">
        <section className="cp-doc-head">
          <p className="cp-eyebrow inline-flex items-center justify-center gap-2">
            <Calculator className="h-4 w-4" aria-hidden="true" />
            FREE TOOL
          </p>
          <h1>Cost per wear calculator</h1>
          <p className="cp-lead">
            Cost per wear = price ÷ wears. It is the honest test of whether a purchase was worth it
            — and the number that makes “buy less, wear more” measurable.
          </p>
        </section>

        <CrayonBox fill="var(--cp-yellow-banner)" radius={30} className="cp-doc bg-[var(--cp-surface)]">
          <PaperCard className="p-6 md:p-8">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              <label className="block">
                <span className="text-sm font-bold text-[var(--cp-ink)]">Item price (USD)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="49.99"
                  className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--cp-ink)] bg-[var(--cp-paper)] px-4 font-mono text-[var(--cp-ink)] outline-none placeholder:text-[var(--cp-ink-3)]"
                  inputMode="decimal"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[var(--cp-ink)]">Expected wears</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={wears}
                  onChange={(e) => setWears(e.target.value)}
                  placeholder="30"
                  className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--cp-ink)] bg-[var(--cp-paper)] px-4 font-mono text-[var(--cp-ink)] outline-none placeholder:text-[var(--cp-ink-3)]"
                  inputMode="numeric"
                />
              </label>
            </div>

            <div
              role="status"
              aria-live="polite"
              className="mt-7 rounded-2xl bg-[var(--cp-paper)] p-5 shadow-[0_0_0_2.5px_var(--cp-ink)] sm:p-6"
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--cp-ink-3)]">
                Cost per wear
              </p>
              <p className="cp-hand mt-1 text-6xl text-[var(--cp-orange-deep)]">
                {cpw > 0 ? formatCurrency(cpw) : '—'}
              </p>
              <p className={`mt-2 text-sm font-semibold ${insight.tone}`}>{insight.label}</p>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-[var(--cp-ink-3)]">
              Tip: track high-ticket and high-guilt items first. Raising wears on what you already
              own beats buying anything new. FitCheck AI wardrobe analytics does this automatically
              from your outfits.
            </p>
          </PaperCard>

          <div className="cp-ctas">
            <CrayonLink to={trialRegisterHref()} variant="orange" size="sm">
              Track wears automatically
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
            <CrayonLink to="/guides/cost-per-wear-calculator-explained" variant="dark" size="sm">
              Read the full guide
            </CrayonLink>
          </div>
        </CrayonBox>

        <section className="mx-auto mt-14 max-w-[820px]">
          <h2 className="cp-hand text-4xl text-[var(--cp-ink)]">Frequently asked questions</h2>
          <div className="mt-5 space-y-4">
            {FAQS.map((faq, idx) => (
              <PaperCard key={faq.question} className="p-5">
                <h3 className="cp-hand flex items-baseline gap-2 text-2xl text-[var(--cp-ink)]">
                  <span className="font-mono text-xs font-bold text-[var(--cp-orange-deep)]">
                    0{idx + 1}
                  </span>
                  <span>{faq.question}</span>
                </h3>
                <p className="mt-2 text-[var(--cp-ink-2)]">{faq.answer}</p>
              </PaperCard>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/guides/what-is-wardrobe-utilization" className="cp-chip">
              Wardrobe utilization
            </Link>
            <Link to="/guides/what-is-a-capsule-wardrobe" className="cp-chip">
              Capsule wardrobes
            </Link>
            <Link to="/features/wardrobe-analytics" className="cp-chip">
              Wardrobe analytics
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
