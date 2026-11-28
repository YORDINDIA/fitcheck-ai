import { Link } from 'react-router-dom'
import { ArrowUpRight, EyeOff, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'

import { CrayonBox } from '@/components/crayon/CrayonPrimitives'

const privacyPoints = [
  {
    icon: ShieldCheck,
    title: 'Private storage',
    body: 'Account-scoped checks on every read & write',
  },
  {
    icon: LockKeyhole,
    title: 'Encrypted',
    body: 'Photos encrypted in transit and at rest',
  },
  {
    icon: Trash2,
    title: 'Delete it all',
    body: 'Wipe profile, wardrobe & images anytime',
  },
  {
    icon: EyeOff,
    title: 'Zero ad sharing',
    body: 'Member photos are never sold or public',
  },
]

const personas = [
  {
    title: 'Busy professionals',
    body: 'Weather-aware workday outfits from what you own.',
    href: '/for/busy-professionals',
  },
  {
    title: 'Content creators',
    body: 'Planned looks & studio portraits for a schedule.',
    href: '/for/content-creators',
  },
  {
    title: 'Festive & wedding guests',
    body: 'Occasion wear cataloged before the next invite.',
    href: '/for/festive-and-wedding-outfits',
  },
]

export default function WhoItsFor() {
  return (
    <section id="who-its-for" className="cp-wrap cp-sec" aria-labelledby="who-its-for-heading">
      <CrayonBox solid="var(--cp-navy)" radius={36} showLine={false} className="cp-night">
        <div className="cp-left">
          <p className="cp-eyebrow">PRIVACY &amp; WHO IT IS FOR</p>
          <h2 id="who-its-for-heading" className="cp-h2">
            Your photos stay yours.
          </h2>
          <p className="cp-sub">
            Your closet holds personal outfits, home mirrors, and selfies. FitCheck keeps your
            wardrobe private by default — built for anyone who wants effortless mornings.
          </p>

          <ul className="mt-7 grid gap-2.5">
            {personas.map((persona) => (
              <li key={persona.title}>
                <Link
                  to={persona.href}
                  className="group flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff14] px-4 py-3 text-white shadow-[0_0_0_1.5px_#ffffff4d] transition-colors hover:bg-[#ffffff24]"
                >
                  <span>
                    <span className="block text-[15.5px] font-bold text-white">
                      {persona.title}
                    </span>
                    <span className="block text-xs text-[var(--cp-navy-sub)]">{persona.body}</span>
                  </span>
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-[var(--cp-yellow)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to="/privacy"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--cp-yellow)] hover:underline"
          >
            Read the privacy policy
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <CrayonBox lineColor="#ffffff" radius={26} className="cp-zero">
          <p className="lbl">SOLD OR SHARED WITH DATA BROKERS</p>
          <p className="big">
            0<em>bytes</em>
          </p>
          <p className="mt-2.5 text-sm text-[var(--cp-navy-sub)]">
            <b className="text-white">Private by default</b> — only you see your closet unless you
            share a link.
          </p>
          <ul className="cp-pts">
            {privacyPoints.map((pt) => (
              <li key={pt.title}>
                <pt.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cp-yellow)]" aria-hidden="true" />
                <span>
                  {pt.title}
                  <small>{pt.body}</small>
                </span>
              </li>
            ))}
          </ul>
        </CrayonBox>
      </CrayonBox>
    </section>
  )
}
