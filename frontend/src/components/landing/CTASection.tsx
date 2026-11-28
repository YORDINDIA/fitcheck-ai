import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { joinWaitlist } from '@/api/waitlist'
import { CrayonBox, CrayonButton, CrayonLink, PaperCard } from '@/components/crayon/CrayonPrimitives'
import StoreBadges from '@/components/landing/StoreBadges'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trackEvent } from '@/lib/analytics'
import { trialRegisterHref, TRIAL_PROMO_CODE } from '@/lib/trial-offer'

export default function CTASection() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)
    setIsSubmitting(true)

    try {
      await joinWaitlist({ email: trimmedEmail, full_name: fullName.trim() || undefined })
      setIsSuccess(true)
      setEmail('')
      setFullName('')
    } catch (caught) {
      const apiError = caught as { code?: string; message?: string }
      setError(
        apiError.code === 'WAITLIST_EMAIL_EXISTS'
          ? 'This email is already on the waitlist.'
          : apiError.message || 'Something went wrong. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="cp-wrap cp-sec" aria-labelledby="final-cta-heading">
      <CrayonBox
        solid="var(--cp-yellow-banner)"
        radius={36}
        showLine={false}
        className="cp-end"
      >
        <h2 id="final-cta-heading" className="cp-h2">
          Start with one photo.
        </h2>
        <p className="cp-sub">
          On the web, iPhone, or Android. Your first month of Pro is free with no card, and the
          account returns to Free unless you upgrade.
        </p>

        <div className="cp-ctas items-center">
          <CrayonLink
            to={trialRegisterHref()}
            variant="dark"
            onClick={() =>
              trackEvent('landing_cta_click', { location: 'bottom', promo: TRIAL_PROMO_CODE })
            }
          >
            Start free on web
          </CrayonLink>
          <StoreBadges location="bottom" />
        </div>

        <p className="mt-4 text-sm font-semibold text-[var(--cp-ink-2)]">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-[var(--cp-orange-deep)] underline">
            Log in
          </Link>
        </p>

        <PaperCard className="mx-auto mt-10 max-w-xl p-6 text-left sm:p-7">
          <p className="cp-hand text-3xl text-[var(--cp-ink)]">Product updates</p>
          <p className="mt-1 text-sm font-medium text-[var(--cp-ink-2)]">
            One email when something big ships.
          </p>

          {isSuccess ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-[var(--cp-mint)] p-4 shadow-[0_0_0_2px_var(--cp-ink)]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cp-green)]" aria-hidden="true" />
              <div>
                <p className="font-bold text-[var(--cp-ink)]">You are on the list</p>
                <p className="mt-1 text-sm text-[var(--cp-ink-2)]">
                  We will email you about major product updates.
                </p>
              </div>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={handleSubmit}
              className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div>
                <Label htmlFor="waitlist-email" className="sr-only">
                  Email address
                </Label>
                <Input
                  id="waitlist-email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (error) setError(null)
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'waitlist-error' : undefined}
                  required
                  disabled={isSubmitting}
                  className="h-12 rounded-xl border-2 border-[var(--cp-ink)] bg-[var(--cp-paper)] text-[var(--cp-ink)] shadow-none placeholder:text-[var(--cp-ink-3)]"
                />
              </div>
              <div>
                <Label htmlFor="waitlist-name" className="sr-only">
                  Full name (optional)
                </Label>
                <Input
                  id="waitlist-name"
                  type="text"
                  placeholder="Name (optional)"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={isSubmitting}
                  className="h-12 rounded-xl border-2 border-[var(--cp-ink)] bg-[var(--cp-paper)] text-[var(--cp-ink)] shadow-none placeholder:text-[var(--cp-ink-3)]"
                />
              </div>
              <CrayonButton
                type="submit"
                variant="orange"
                size="sm"
                disabled={isSubmitting}
                className="h-12"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Joining...
                  </>
                ) : (
                  'Get updates'
                )}
              </CrayonButton>
              {error && (
                <p
                  id="waitlist-error"
                  role="alert"
                  className="rounded-xl bg-[var(--cp-pink)] px-3 py-2 text-sm font-semibold text-[var(--cp-ink)] sm:col-span-3"
                >
                  {error}
                </p>
              )}
            </form>
          )}
        </PaperCard>
      </CrayonBox>
    </section>
  )
}
