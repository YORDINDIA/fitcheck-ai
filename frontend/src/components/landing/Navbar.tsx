import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'

import { BrandMark } from '@/components/brand/Logo'
import { CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { trackLandingCta } from '@/lib/analytics'
import { scrollToSectionId } from '@/lib/scroll'
import { trialRegisterHref } from '@/lib/trial-offer'
import { useIsAuthenticated } from '@/stores/authStore'

const primaryLinks = [
  { name: 'Features', href: '/features' },
  { name: 'Live demo', href: '/#demo' },
  { name: 'Privacy', href: '/#who-its-for' },
  { name: 'Pricing', href: '/#pricing' },
  { name: 'FAQ', href: '/faq' },
]

const resourceLinks = [
  { name: 'Guides', href: '/guides/what-to-wear-today' },
  { name: 'Blog', href: '/blog' },
  { name: 'FAQ', href: '/faq' },
  { name: 'About', href: '/about' },
]

const mobileLinks = [
  { name: 'Features', href: '/features' },
  { name: 'Live demo', href: '/#demo' },
  { name: 'Pricing', href: '/#pricing' },
  ...resourceLinks,
]

const isHashLink = (href: string) => href.startsWith('/#')

const isResourceActive = (href: string, pathname: string) =>
  href.startsWith('/guides') ? pathname.startsWith('/guides') : pathname.startsWith(href)

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const isAuthenticated = useIsAuthenticated()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isHashLink(href)) {
      setIsMobileMenuOpen(false)
      return
    }

    event.preventDefault()
    const id = href.replace('/#', '')
    trackLandingCta(
      id === 'demo' ? 'nav-demo' : id === 'who-its-for' ? 'nav-privacy' : 'nav-pricing',
    )
    setIsMobileMenuOpen(false)
    if (location.pathname !== '/') {
      navigate(href)
      window.setTimeout(() => scrollToSectionId(id), 150)
    } else {
      scrollToSectionId(id)
    }
  }

  const renderDesktopLink = (link: (typeof primaryLinks)[number]) => {
    const current = !isHashLink(link.href) && location.pathname.startsWith(link.href)
    const isPage = !isHashLink(link.href) && location.pathname === link.href
    const className = current
      ? 'font-bold text-[var(--cp-orange-deep)] transition-colors'
      : 'transition-colors'

    return isHashLink(link.href) ? (
      <a
        key={link.name}
        href={link.href}
        onClick={(event) => handleNavClick(event, link.href)}
        className={className}
      >
        {link.name}
      </a>
    ) : (
      <Link
        key={link.name}
        to={link.href}
        className={className}
        aria-current={isPage ? 'page' : undefined}
      >
        {link.name}
      </Link>
    )
  }

  const isResourceSectionActive = resourceLinks.some((link) =>
    isResourceActive(link.href, location.pathname),
  )

  return (
    <header className="cp-nav" data-scrolled={scrolled}>
      <div className="cp-nav-bar" aria-hidden="true" />
      <nav aria-label="Public navigation" className="cp-wrap cp-nav-in">
        <Link to="/" className="cp-logo cp-hand">
          <span className="cp-logo-mark">
            <BrandMark size={30} />
          </span>
          <span>FitCheck</span>
        </Link>

        <div className="cp-nav-links">
          {primaryLinks.map((link) => renderDesktopLink(link))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`h-10 gap-1 rounded-lg px-2 text-[16px] font-semibold hover:bg-transparent hover:text-[var(--cp-orange-deep)] data-[state=open]:text-[var(--cp-orange-deep)] ${
                  isResourceSectionActive ? 'text-[var(--cp-orange-deep)]' : 'text-[var(--cp-ink)]'
                }`}
              >
                Resources
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              className="w-52 rounded-2xl border-0 bg-[var(--cp-surface)] p-2 text-[var(--cp-ink)] shadow-[0_0_0_2.5px_var(--cp-ink),4px_5px_0_var(--cp-shadow-ink)]"
            >
              {resourceLinks.map((link) => (
                <DropdownMenuItem
                  key={link.name}
                  asChild
                  className={`cursor-pointer rounded-xl px-3 py-2.5 text-[15px] font-semibold text-[var(--cp-ink)] focus:bg-[var(--cp-surface-muted)] focus:text-[var(--cp-orange-deep)] ${
                    isResourceActive(link.href, location.pathname)
                      ? 'text-[var(--cp-orange-deep)]'
                      : ''
                  }`}
                >
                  <Link
                    to={link.href}
                    aria-current={location.pathname === link.href ? 'page' : undefined}
                  >
                    {link.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="cp-nav-actions hidden items-center gap-2.5 md:flex">
          <ThemeToggle className="!rounded-full !bg-[var(--cp-surface)] !text-[var(--cp-ink)] !shadow-[0_0_0_2px_var(--cp-ink)] hover:!bg-[var(--cp-yellow-banner)]" />
          {isAuthenticated ? (
            <CrayonLink to="/dashboard" variant="orange" size="sm">
              Dashboard
            </CrayonLink>
          ) : (
            <>
              <CrayonLink to="/auth/login" variant="dark" size="sm">
                Log in
              </CrayonLink>
              <CrayonLink to={trialRegisterHref()} variant="orange" size="sm">
                Start free
              </CrayonLink>
            </>
          )}
        </div>

        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="cp-burger cp-cr"
            >
              <span className="cp-line" aria-hidden="true" />
              <i aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="cp-drawer-panel data-[state=open]:duration-200 overflow-y-auto [&>button]:hidden"
          >
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <SheetDescription className="sr-only">
              Open FitCheck product, resource, account, and theme links.
            </SheetDescription>

            <div className="cp-drawer-top">
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="cp-logo cp-hand text-[26px]"
              >
                <span className="cp-logo-mark !h-9 !w-9">
                  <BrandMark size={26} />
                </span>
                <span>FitCheck</span>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsMobileMenuOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-full bg-[var(--cp-surface)] text-[var(--cp-ink)] shadow-[0_0_0_2.5px_var(--cp-ink)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Mobile navigation" className="cp-drawer-nav">
              {mobileLinks.map((link) =>
                isHashLink(link.href) ? (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={(event) => handleNavClick(event, link.href)}
                  >
                    {link.name}
                  </a>
                ) : (
                  <Link
                    key={link.name}
                    to={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                ),
              )}
              {!isAuthenticated && (
                <Link to="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                  Log in
                </Link>
              )}
            </nav>

            <div className="mt-6 flex items-center justify-between rounded-2xl bg-[var(--cp-surface)] px-4 py-3 shadow-[0_0_0_2px_var(--cp-ink)]">
              <span className="text-[15px] font-semibold text-[var(--cp-ink)]">Theme</span>
              <ThemeToggle className="!rounded-full !bg-[var(--cp-paper)] !text-[var(--cp-ink)] !shadow-[0_0_0_2px_var(--cp-ink)] hover:!bg-[var(--cp-yellow-banner)]" />
            </div>

            <div className="mt-5 grid gap-3">
              <CrayonLink
                to={isAuthenticated ? '/dashboard' : trialRegisterHref()}
                variant="orange"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full"
              >
                {isAuthenticated ? 'Dashboard' : 'Start free'}
              </CrayonLink>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
