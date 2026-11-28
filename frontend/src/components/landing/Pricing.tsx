import { useRef, useState } from 'react'
import { Check, Minus, ShieldCheck } from 'lucide-react'

import { CrayonBox, CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { Switch } from '@/components/ui/switch'
import { trackEvent } from '@/lib/analytics'
import {
  PLAN_LIMITS,
  PLAN_PRICES,
  freePlanFeatureBullets,
  plusPlanFeatureBullets,
  proPlanFeatureBullets,
  yearlySavings,
} from '@/lib/plan-limits'
import { cn } from '@/lib/utils'
import { trialPlanHref, TRIAL_PROMO_CODE } from '@/lib/trial-offer'

type PlanKey = keyof typeof PLAN_PRICES

const tiers = [
  {
    key: 'free' as const,
    name: 'Free',
    description: 'Start a useful wardrobe at no cost',
    features: freePlanFeatureBullets(),
    cta: 'Start free',
  },
  {
    key: 'plus' as const,
    name: 'Plus',
    description: 'Every paid feature with everyday limits',
    features: plusPlanFeatureBullets(),
    cta: 'Get Plus',
  },
  {
    key: 'pro' as const,
    name: 'Pro',
    description: 'The same features at the highest limits',
    features: proPlanFeatureBullets(),
    cta: 'Upgrade to Pro',
  },
]

const comparisonRows = [
  {
    label: 'Item extractions / month',
    values: tiers.map(({ key }) => PLAN_LIMITS[key].monthlyExtractions.toLocaleString('en-US')),
  },
  {
    label: 'Outfit visualizations / month',
    values: tiers.map(({ key }) => PLAN_LIMITS[key].monthlyGenerations.toLocaleString('en-US')),
  },
  {
    label: 'Photoshoot images / day',
    values: tiers.map(({ key }) => PLAN_LIMITS[key].dailyPhotoshootImages.toLocaleString('en-US')),
  },
  {
    label: 'Virtual try-on',
    values: ['Not included', 'Included', 'Included'],
  },
  {
    label: 'Advanced wardrobe analytics',
    values: ['Not included', 'Included', 'Included'],
  },
  {
    label: 'Calendar planning & priority support',
    values: ['Not included', 'Included', 'Included'],
  },
]

function planHref(plan: PlanKey, isYearly: boolean) {
  return plan === 'free' ? '/auth/register' : trialPlanHref(plan, isYearly)
}

function displayPrice(plan: PlanKey, isYearly: boolean) {
  const price = PLAN_PRICES[plan]
  return isYearly ? price.yearly : price.monthly
}

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false)
  const [mobilePlan, setMobilePlan] = useState<PlanKey>('plus')
  const planSwitchRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectMobilePlan = (idx: number, focus = false) => {
    const next = tiers[(idx + tiers.length) % tiers.length]
    setMobilePlan(next.key)
    if (focus) {
      planSwitchRefs.current[(idx + tiers.length) % tiers.length]?.focus()
    }
  }

  const handlePlanSwitchKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectMobilePlan(idx + 1, true)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectMobilePlan(idx - 1, true)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectMobilePlan(0, true)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectMobilePlan(tiers.length - 1, true)
    }
  }

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="cp-wrap cp-sec"
    >
      <p className="cp-eyebrow">FIRST MONTH OF PRO FREE · NO CARD REQUIRED</p>
      <h2 id="pricing-heading" className="cp-h2">
        Start free. Pay for more room.
      </h2>
      <p className="cp-sub">
        Plus and Pro unlock the same features — only the limits differ. Your trial returns to Free
        unless you upgrade.
      </p>

      <div className="mt-7 flex justify-center">
        <div className="cp-paper inline-flex items-center gap-2 px-3 py-1.5 sm:gap-3.5 sm:px-4">
          <button
            type="button"
            onClick={() => setIsYearly(false)}
            className={cn(
              'min-h-11 px-1.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-ink)]',
              !isYearly ? 'text-[var(--cp-ink)]' : 'text-[var(--cp-ink-3)]',
            )}
          >
            Monthly
          </button>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            aria-label="Billing period"
            className="data-[state=checked]:bg-[var(--cp-orange)] data-[state=unchecked]:bg-[var(--cp-ink)]"
          />
          <button
            type="button"
            onClick={() => setIsYearly(true)}
            className={cn(
              'min-h-11 px-1.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-ink)]',
              isYearly ? 'text-[var(--cp-ink)]' : 'text-[var(--cp-ink-3)]',
            )}
          >
            Yearly{' '}
            <span className="ms-1 text-[var(--cp-orange-deep)]">· 2 months free</span>
          </button>
        </div>
      </div>

      {/* Mobile plan switcher (<=760px) */}
      <div className="cp-pswitch" role="radiogroup" aria-label="Choose a plan">
        {tiers.map((t, idx) => {
          const selected = mobilePlan === t.key
          return (
            <button
              key={t.key}
              ref={(el) => {
                planSwitchRefs.current[idx] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setMobilePlan(t.key)}
              onKeyDown={(e) => handlePlanSwitchKeyDown(e, idx)}
            >
              {t.name}
            </button>
          )
        })}
      </div>

      <div className="cp-plans">
        {tiers.map((tier) => {
          const isPick = tier.key === 'plus'
          const price = displayPrice(tier.key, isYearly)
          const saving = yearlySavings(tier.key)
          const fill = isPick
            ? 'var(--cp-peach-deep)'
            : tier.key === 'pro'
              ? 'var(--cp-sky)'
              : undefined

          return (
            <CrayonBox
              key={tier.key}
              as="article"
              fill={fill}
              radius={28}
              className={cn(
                'cp-plan',
                isPick && 'pick',
                mobilePlan === tier.key && 'sel',
              )}
            >
              {isPick && (
                <div className="cp-tag cp-cr">
                  <span className="cp-solid" aria-hidden="true" />
                  most popular!
                </div>
              )}

              <p className="name">{tier.name}</p>
              <p className="for">{tier.description}</p>

              <div className="price">
                <span className="amt">${price.toFixed(price % 1 === 0 ? 0 : 2)}</span>
                {price > 0 && (
                  <span className="rounded-md bg-[var(--cp-surface-inset)] px-2 py-0.5 text-sm font-semibold text-[var(--cp-ink-2)]">
                    /{isYearly ? 'year' : 'month'}
                  </span>
                )}
              </div>

              <p className="per">
                {isYearly && saving > 0
                  ? `Save $${saving} every year`
                  : price === 0
                    ? 'Free forever · no card'
                    : 'No contract · cancel anytime'}
              </p>

              <CrayonLink
                to={planHref(tier.key, isYearly)}
                variant={isPick ? 'orange' : 'dark'}
                size="sm"
                className="mt-5 w-full"
                onClick={() =>
                  trackEvent('landing_cta_click', {
                    location: 'pricing',
                    plan: tier.key,
                    promo: TRIAL_PROMO_CODE,
                  })
                }
              >
                {tier.cta}
              </CrayonLink>

              <ul>
                {tier.features.map((feat) => (
                  <li key={feat}>{feat}</li>
                ))}
              </ul>
            </CrayonBox>
          )
        })}
      </div>

      <div className="cp-inc">
        <span>
          <Check className="h-4 w-4 text-[var(--cp-green)]" aria-hidden="true" />
          1st month Pro free
        </span>
        <span>
          <Check className="h-4 w-4 text-[var(--cp-green)]" aria-hidden="true" />
          Web, iOS &amp; Android sync
        </span>
        <span>
          <Check className="h-4 w-4 text-[var(--cp-green)]" aria-hidden="true" />
          No card to start
        </span>
        <span>
          <ShieldCheck className="h-4 w-4 text-[var(--cp-orange-deep)]" aria-hidden="true" />
          Payments via Stripe &amp; App Stores
        </span>
      </div>

      {/* Desktop detailed limit comparison ledger */}
      <div className="cp-tbl mt-8 hidden lg:block">
        <table>
          <caption className="sr-only">FitCheck plan and usage limit comparison</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[34%]">
                Plan comparison
              </th>
              {tiers.map((tier) => (
                <th
                  key={tier.key}
                  scope="col"
                  className={cn('text-center', tier.key === 'plus' && 'win')}
                >
                  {tier.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="font-semibold text-[var(--cp-ink)]">
                  {row.label}
                </th>
                {row.values.map((value, idx) => (
                  <td
                    key={`${row.label}-${tiers[idx].key}`}
                    className={cn(
                      'text-center font-mono text-sm',
                      tiers[idx].key === 'plus' && 'win',
                    )}
                  >
                    {value === 'Included' ? (
                      <span className="inline-flex items-center gap-1 font-sans font-bold text-[var(--cp-green)]">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Included
                      </span>
                    ) : value === 'Not included' ? (
                      <span className="inline-flex items-center text-[var(--cp-ink-4)]">
                        <Minus className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Not included</span>
                      </span>
                    ) : (
                      value
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="font-semibold text-[var(--cp-ink)]">
                Next step
              </th>
              {tiers.map((tier) => (
                <td
                  key={tier.key}
                  className={cn('text-center', tier.key === 'plus' && 'win')}
                >
                  <CrayonLink
                    to={planHref(tier.key, isYearly)}
                    variant={tier.key === 'plus' ? 'orange' : 'dark'}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      trackEvent('landing_cta_click', {
                        location: 'pricing',
                        plan: tier.key,
                        promo: TRIAL_PROMO_CODE,
                      })
                    }
                  >
                    Choose {tier.name}
                  </CrayonLink>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
