import { Link } from 'react-router-dom'
import { ArrowRight, Flag, HelpCircle, Mail, Shield } from 'lucide-react'

import { CrayonBox } from '@/components/crayon/CrayonPrimitives'
import SEO from '@/components/seo/SEO'
import { PAGE_SEO, SEO_CONFIG } from '@/components/seo/seo-config'

export default function SupportPage() {
  return (
    <>
      <SEO
        title={PAGE_SEO.support.title}
        description={PAGE_SEO.support.description}
        canonicalUrl={`${SEO_CONFIG.siteUrl}/support`}
      />
      <div className="cp-wrap">
        <section className="cp-doc-head">
          <p className="cp-eyebrow">HELP &amp; CONTACT</p>
          <h1>Support</h1>
          <p className="cp-lead">
            Get help with FitCheck AI, report a problem, or contact us about privacy and account
            requests.
          </p>
        </section>

        <section className="cp-sec mx-auto max-w-4xl">
          <div className="cp-posts !mt-0 !max-w-none">
            <a href="mailto:support@fitcheckaiapp.com" className="block">
              <CrayonBox fill="var(--cp-sky)" radius={26} className="cp-post h-full">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3>Email support</h3>
                <p className="post-box">
                  Product questions, account help, and technical issues.
                </p>
                <span className="go text-[var(--cp-orange-deep)]">
                  support@fitcheckaiapp.com
                </span>
              </CrayonBox>
            </a>

            <a
              href="mailto:support@fitcheckaiapp.com?subject=Content%20report%20%2F%20abuse"
              className="block"
            >
              <CrayonBox fill="var(--cp-peach)" radius={26} className="cp-post h-full">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                  <Flag className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3>Report content or abuse</h3>
                <p className="post-box">
                  Report objectionable shared outfits or other content. Include enough detail for
                  our team to investigate.
                </p>
                <span className="go text-[var(--cp-orange-deep)]">
                  Email with subject &quot;Content report / abuse&quot;
                </span>
              </CrayonBox>
            </a>

            <a href="mailto:privacy@fitcheckaiapp.com" className="block">
              <CrayonBox fill="var(--cp-mint)" radius={26} className="cp-post h-full">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                  <Shield className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3>Privacy &amp; data requests</h3>
                <p className="post-box">
                  Account deletion is available in-app under Settings → Delete Account. Contact us
                  for other privacy requests.
                </p>
                <span className="go text-[var(--cp-orange-deep)]">
                  privacy@fitcheckaiapp.com
                </span>
              </CrayonBox>
            </a>

            <Link to="/faq" className="block">
              <CrayonBox fill="var(--cp-lilac)" radius={26} className="cp-post h-full">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2px_var(--cp-ink)]">
                  <HelpCircle className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3>FAQ</h3>
                <p className="post-box">
                  Answers about wardrobe extraction, try-on, photoshoots, and how FitCheck AI works.
                </p>
                <span className="go text-[var(--cp-orange-deep)]">
                  View FAQ <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </CrayonBox>
            </Link>
          </div>

          <CrayonBox className="cp-doc !max-w-none" radius={26}>
            <div className="inner cp-prose">
              <h2 className="!mt-0">Legal</h2>
              <ul>
                <li>
                  <Link to="/privacy">Privacy Policy</Link> — how we handle photos, AI processing
                  (OpenAI), Supabase, and account deletion
                </li>
                <li>
                  <Link to="/terms">Terms of Service</Link> — acceptable use and community
                  standards
                </li>
              </ul>
            </div>
          </CrayonBox>
        </section>
      </div>
    </>
  )
}
