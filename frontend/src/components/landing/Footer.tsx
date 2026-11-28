import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Phone } from 'lucide-react'

import { BrandMark } from '@/components/brand/Logo'
import { trackLandingCta } from '@/lib/analytics'
import { PLATFORM_AVAILABILITY } from '@/lib/plan-limits'
import { scrollToSectionId } from '@/lib/scroll'

const footerLinks = {
  Product: [
    { name: 'All features', href: '/features' },
    { name: 'Try demo', href: '/#demo' },
    { name: 'Pricing', href: '/#pricing' },
    { name: 'AI Wardrobe Extraction', href: '/features/ai-wardrobe-extraction' },
    { name: 'Virtual Try-On', href: '/features/virtual-try-on' },
    { name: 'AI Photoshoot', href: '/features/ai-photoshoot-generator' },
    { name: 'Outfit Recommendations', href: '/features/outfit-recommendations' },
    { name: 'Wardrobe Analytics', href: '/features/wardrobe-analytics' },
    { name: 'FAQ', href: '/faq' },
    { name: 'iOS app', href: PLATFORM_AVAILABILITY.iosStoreUrl },
    { name: 'Android app', href: PLATFORM_AVAILABILITY.androidStoreUrl },
  ],
  Resources: [
    { name: 'Blog', href: '/blog' },
    { name: 'What to wear today', href: '/guides/what-to-wear-today' },
    { name: 'Digitize your wardrobe', href: '/guides/how-to-digitize-your-wardrobe' },
    { name: 'Cost per wear', href: '/guides/cost-per-wear-calculator-explained' },
    { name: 'Best virtual closet apps', href: '/best/virtual-closet-apps' },
    { name: 'FitCheck vs Acloset', href: '/compare/fitcheck-vs-acloset' },
    { name: 'Acloset alternatives', href: '/alternatives/acloset-alternatives' },
  ],
  Company: [
    { name: 'About', href: '/about' },
    { name: 'For professionals', href: '/for/busy-professionals' },
    { name: 'For creators', href: '/for/content-creators' },
    { name: 'Festive & wedding', href: '/for/festive-and-wedding-outfits' },
    { name: 'Support', href: '/support' },
    { name: 'Contact', href: 'mailto:info@fitcheckaiapp.com' },
  ],
  Legal: [
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Privacy Policy', href: '/privacy' },
  ],
}

export default function Footer() {
  const location = useLocation()
  const navigate = useNavigate()

  const handleHashClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault()
    const id = href.replace('/#', '')
    trackLandingCta(id === 'demo' ? 'footer-demo' : 'footer-pricing')
    if (location.pathname !== '/') {
      navigate(href)
      window.setTimeout(() => scrollToSectionId(id), 150)
    } else {
      scrollToSectionId(id)
    }
  }

  return (
    <footer className="cp-foot">
      <div className="cp-bg" aria-hidden="true" />
      <div className="cp-wrap">
        <div className="cp-fg">
          <div className="cp-fbrand">
            <Link to="/" className="cp-logo cp-hand">
              <span className="cp-logo-mark">
                <BrandMark size={30} />
              </span>
              <span>FitCheck AI</span>
            </Link>
            <p className="cp-foot-copy mt-3 max-w-xs">
              Photograph your clothes. Get outfits that fit the day — on web, iOS, and Android.
            </p>
            <div className="mt-4 flex flex-col gap-1">
              <a href="mailto:info@fitcheckaiapp.com">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>info@fitcheckaiapp.com</span>
              </a>
              <a
                href="https://wa.me/919310833204"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>+91 9310833204</span>
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category} className="min-w-0">
              <h2>{category}</h2>
              <ul>
                {links.map((link) => (
                  <li key={link.name}>
                    {link.href.startsWith('/#') ? (
                      <a href={link.href} onClick={(event) => handleHashClick(event, link.href)}>
                        {link.name}
                      </a>
                    ) : link.href.startsWith('/') ? (
                      <Link to={link.href}>{link.name}</Link>
                    ) : (
                      <a
                        href={link.href}
                        {...(link.href.startsWith('http')
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {link.name}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="cp-fine flex flex-wrap items-center justify-between gap-3">
          <p>&copy; {new Date().getFullYear()} FitCheck AI. All rights reserved.</p>
          <p>
            Available on{' '}
            <a
              href={PLATFORM_AVAILABILITY.iosStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              App Store
            </a>
            {' · '}
            <a
              href={PLATFORM_AVAILABILITY.androidStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              Google Play
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
