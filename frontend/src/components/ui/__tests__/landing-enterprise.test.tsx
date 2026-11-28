import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { joinWaitlist } from '@/api/waitlist'
import CTASection from '@/components/landing/CTASection'
import Navbar from '@/components/landing/Navbar'
import Pricing from '@/components/landing/Pricing'
import { ThemeProvider, ThemeToggle } from '@/components/theme'
import LandingPage from '@/pages/public/LandingPage'
import CostPerWearCalculatorPage from '@/pages/tools/CostPerWearCalculatorPage'

vi.mock('@/components/seo/SEO', () => ({ default: () => null }))
vi.mock('@/components/seo/JsonLd', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/seo/JsonLd')>()),
  BreadcrumbJsonLd: () => null,
}))
vi.mock('@/api/waitlist', () => ({
  joinWaitlist: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  document.documentElement.classList.remove('dark')
})

function renderNavbar() {
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </ThemeProvider>
  )
}

describe('enterprise landing navigation', () => {
  it('opens the Resources menu from the keyboard and exposes every destination', async () => {
    const user = userEvent.setup()
    renderNavbar()

    const resources = screen.getByRole('button', { name: 'Resources' })
    resources.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('menuitem', { name: 'Guides' })).toHaveAttribute(
      'href',
      '/guides/what-to-wear-today'
    )
    expect(screen.getByRole('menuitem', { name: 'Blog' })).toHaveAttribute('href', '/blog')
    expect(screen.getByRole('menuitem', { name: 'FAQ' })).toHaveAttribute('href', '/faq')
    expect(screen.getByRole('menuitem', { name: 'About' })).toHaveAttribute('href', '/about')
  })

  it('keeps primary and resource links in the mobile menu', async () => {
    const user = userEvent.setup()
    renderNavbar()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Features' })).toHaveAttribute(
      'href',
      '/features'
    )
    expect(within(dialog).getByRole('link', { name: 'Live demo' })).toHaveAttribute(
      'href',
      '/#demo'
    )
    expect(within(dialog).getByRole('link', { name: 'Guides' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'About' })).toBeInTheDocument()
  })
})

describe('enterprise landing structure', () => {
  it('retains required anchors, one H1, and the signature LCP hint', () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    expect(container.querySelectorAll('h1')).toHaveLength(1)
    for (const id of [
      'demo',
      'features',
      'also-in-app',
      'how-it-works',
      'step-photograph',
      'step-catalog',
      'step-wear',
      'photoshoot-showcase',
      'who-its-for',
      'guides',
      'pricing',
      'faq',
    ]) {
      expect(document.getElementById(id), `missing #${id}`).not.toBeNull()
    }

    // The paper-studio hero is the signature: the pile photo is the LCP.
    // scripts/prerender-html.mjs preloads the same src/srcset/sizes.
    const lcpImage = screen.getByAltText(/A phone photo of six clothes on a bed/)
    expect(lcpImage).toHaveAttribute('src', '/signature/pile-800.webp')
    expect(lcpImage).toHaveAttribute('fetchpriority', 'high')
    expect(lcpImage).toHaveAttribute('sizes', '(min-width: 768px) 640px, calc(100vw - 32px)')
    expect(document.querySelectorAll('[fetchpriority="high"]')).toHaveLength(1)
  })

  it('renders the signature end frame by default, with nothing hidden by opacity', () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    // Default render = the finished frame: six cut-outs with their labels
    // and the outfit, all in the DOM before any scroll animation runs.
    const cells = container.querySelectorAll('.sig-cell')
    expect(cells).toHaveLength(6)
    for (const cell of cells) {
      expect(cell.querySelector('img')?.getAttribute('src')).toMatch(/^\/signature\/.+\.webp$/)
      expect(cell.querySelector('.sig-label')?.textContent?.trim()).not.toBe('')
    }
    expect(container.querySelector('.sig-outfit img')).not.toBeNull()

    // Content is visible by default: no inline opacity: 0 anywhere.
    for (const el of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(el.style.opacity, el.outerHTML.slice(0, 80)).not.toBe('0')
    }
  })

  it('supports interactive closet tagging, reset, and occasion style keyboard switching', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    // Interactive ClosetStage: clicking an untagged item renames it, and Reset restores it
    expect(screen.getByText('2/6 cataloged')).toBeInTheDocument()
    const rawTile = screen.getByRole('button', { name: /IMG_2208\.jpg/i })
    expect(rawTile).toHaveAttribute('aria-pressed', 'false')
    await user.click(rawTile)
    expect(rawTile).toHaveTextContent('Denim jacket')
    expect(rawTile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('3/6 cataloged')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByText('2/6 cataloged')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /IMG_2208\.jpg/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    // Interactive StylePreview: radiogroup click & arrow-key navigation updates look preview
    const workdayRadio = screen.getByRole('radio', { name: /Workday Smart/i })
    workdayRadio.focus()
    await user.keyboard('{ArrowRight}')
    const casualRadio = screen.getByRole('radio', { name: /Casual Weekend/i })
    expect(casualRadio).toHaveAttribute('aria-checked', 'true')
    expect(casualRadio).toHaveFocus()
    expect(screen.getByText("Today's Look").parentElement).toHaveTextContent('Casual Weekend')

    await user.keyboard('{End}')
    expect(screen.getByRole('radio', { name: /Dinner & Date/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.keyboard('{Home}')
    expect(workdayRadio).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles Features batch extraction and carousel dots, and manages FAQ inert panels', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    // Batch extraction Undo / Extract all toggle
    const undoBtn = screen.getByRole('button', { name: 'Undo' })
    await user.click(undoBtn)
    const extractBtn = screen.getByRole('button', { name: 'Extract all' })
    await user.click(extractBtn)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    // Carousel dots
    const dot2 = screen.getByRole('button', { name: /Show feature 2 of 3: Plan/i })
    expect(dot2).toHaveAttribute('aria-pressed', 'false')
    await user.click(dot2)
    expect(dot2).toHaveAttribute('aria-pressed', 'true')

    // FAQ accordion aria-expanded + inert management
    const firstFaq = screen.getByRole('button', { name: /What is FitCheck AI\?/i })
    const secondFaq = screen.getByRole('button', { name: /What is a virtual closet app\?/i })
    expect(firstFaq).toHaveAttribute('aria-expanded', 'true')
    expect(secondFaq).toHaveAttribute('aria-expanded', 'false')
    const secondPanel = document.getElementById(secondFaq.getAttribute('aria-controls') || '') as
      | (HTMLElement & { inert?: boolean })
      | null
    expect(secondPanel?.inert).toBe(true)

    await user.click(secondFaq)
    expect(secondFaq).toHaveAttribute('aria-expanded', 'true')
    expect(secondPanel?.inert).toBe(false)
  })

  it('supports Pricing billing switch and mobile plan switcher', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>
    )

    const billingSwitch = screen.getByRole('switch', { name: 'Billing period' })
    expect(billingSwitch).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('button', { name: /Yearly/i }))
    expect(billingSwitch).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Monthly' }))
    expect(billingSwitch).toHaveAttribute('aria-checked', 'false')

    const planGroup = screen.getByRole('radiogroup', { name: 'Choose a plan' })
    const proRadio = within(planGroup).getByRole('radio', { name: 'Pro' })
    await user.click(proRadio)
    expect(proRadio).toHaveAttribute('aria-checked', 'true')
  })

  it('validates CTASection waitlist submissions and handles error/success states', async () => {
    const user = userEvent.setup()
    const mockedJoin = vi.mocked(joinWaitlist)
    render(
      <MemoryRouter>
        <CTASection />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Get updates' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.')
    expect(mockedJoin).not.toHaveBeenCalled()

    const emailInput = screen.getByLabelText('Email address')
    await user.type(emailInput, 'exists@example.com')
    mockedJoin.mockRejectedValueOnce({ code: 'WAITLIST_EMAIL_EXISTS', message: 'Duplicate' })
    await user.click(screen.getByRole('button', { name: 'Get updates' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This email is already on the waitlist.',
    )

    await user.clear(emailInput)
    await user.type(emailInput, 'alex@example.com')
    mockedJoin.mockResolvedValueOnce({
      id: '1',
      email: 'alex@example.com',
      created_at: '2026-01-01T00:00:00Z',
    })
    await user.click(screen.getByRole('button', { name: 'Get updates' }))
    expect(await screen.findByText('You are on the list')).toBeInTheDocument()
  })

  it('calculates cost per wear live and switches theme via ThemeToggle', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <ThemeToggle />
          <CostPerWearCalculatorPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const priceInput = screen.getByLabelText('Item price (USD)')
    const wearsInput = screen.getByLabelText('Expected wears')
    await user.clear(priceInput)
    await user.type(priceInput, '100')
    await user.clear(wearsInput)
    await user.type(wearsInput, '50')
    expect(screen.getByText('$2.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle theme' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Toggle theme' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Light' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
