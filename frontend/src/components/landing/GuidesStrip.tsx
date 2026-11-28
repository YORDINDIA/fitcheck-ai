import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { CrayonBox } from '@/components/crayon/CrayonPrimitives'

const links = [
  {
    kind: 'Guide',
    title: 'How to digitize your wardrobe',
    blurb: 'Step-by-step workflow to photograph and organize your closet fast.',
    href: '/guides/how-to-digitize-your-wardrobe',
    fill: 'var(--cp-sky)',
  },
  {
    kind: 'Guide',
    title: 'What to wear today',
    blurb: 'How weather, calendar plans, and closet tags turn into daily looks.',
    href: '/guides/what-to-wear-today',
    fill: 'var(--cp-mint)',
  },
  {
    kind: 'Free tool',
    title: 'Cost per wear calculator',
    blurb: 'Check whether a garment earned its price in seconds.',
    href: '/tools/cost-per-wear-calculator',
    fill: 'var(--cp-yellow-banner)',
  },
  {
    kind: 'Compare',
    title: 'FitCheck AI vs Acloset',
    blurb: 'Side-by-side look at extraction, try-on, photoshoots, and pricing.',
    href: '/compare/fitcheck-vs-acloset',
    fill: 'var(--cp-lilac)',
  },
]

export default function GuidesStrip() {
  return (
    <section
      id="guides"
      aria-labelledby="guides-heading"
      className="cp-wrap cp-sec"
    >
      <p className="cp-eyebrow">GUIDES &amp; COMPARISONS</p>
      <h2 id="guides-heading" className="cp-h2">
        Reading for the curious.
      </h2>
      <p className="cp-sub">
        Practical guides for anyone building a digital wardrobe or comparing closet apps.{' '}
        <Link
          to="/blog"
          className="font-bold text-[var(--cp-orange-deep)] underline underline-offset-4"
        >
          Read the blog →
        </Link>
      </p>

      <div className="cp-posts">
        {links.map((item) => (
          <Link key={item.href} to={item.href} className="block">
            <CrayonBox fill={item.fill} radius={26} className="cp-post h-full">
              <span className="kind">{item.kind}</span>
              <h3>{item.title}</h3>
              <p className="post-box">{item.blurb}</p>
              <span className="go">
                Read more
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </CrayonBox>
          </Link>
        ))}
      </div>
    </section>
  )
}
