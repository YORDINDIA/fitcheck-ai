import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { useBlogPost, useBlogPosts } = vi.hoisted(() => ({
  useBlogPost: vi.fn(),
  useBlogPosts: vi.fn(() => ({ data: undefined })),
}))

vi.mock('@/hooks/useBlog', () => ({ useBlogPost, useBlogPosts }))
vi.mock('@/components/landing/AnimatedSection', () => ({
  AnimatedSection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/seo/SEO', () => ({ default: () => null }))
vi.mock('@/components/seo/JsonLd', () => ({
  BreadcrumbJsonLd: () => null,
  buildArticleSchema: () => ({}),
}))

import BlogPostPage from '@/pages/blog/BlogPostPage'

function renderPost() {
  return render(
    <MemoryRouter initialEntries={['/blog/missing-post']}>
      <Routes>
        <Route path="/blog/:slug" element={<BlogPostPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('BlogPostPage error states', () => {
  it('renders not found only for a 404 response', () => {
    useBlogPost.mockReturnValue({ data: undefined, isLoading: false, error: { status: 404, message: 'Missing' } })
    renderPost()
    expect(screen.getByRole('heading', { name: 'Post not found' })).toBeInTheDocument()
  })

  it('renders a retryable load error for network failures', () => {
    useBlogPost.mockReturnValue({ data: undefined, isLoading: false, error: { message: 'Network unavailable' } })
    renderPost()
    expect(screen.getByRole('heading', { name: 'Unable to load article' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('renders inline markdown safely via React nodes without raw HTML injection', () => {
    useBlogPost.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        slug: 'capsule-wardrobe',
        title: 'Capsule Wardrobe Guide',
        excerpt: 'Build a capsule wardrobe.',
        category: 'Guides',
        date: '2026-01-15',
        read_time: '4 min',
        author: 'FitCheck Team',
        emoji: '🧥',
        keywords: ['capsule'],
        content: [
          'Intro with **bold** and *italic* and <script>alert(1)</script> text.',
          '- First bullet with [safe link](https://fitcheckaiapp.com/features)',
          '1. Numbered step with [blocked link](javascript:alert(1))',
        ].join('\n\n'),
      },
    })

    const { container } = renderPost()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'safe link' })).toHaveAttribute(
      'href',
      'https://fitcheckaiapp.com/features',
    )
    expect(screen.getByRole('link', { name: 'blocked link' })).toHaveAttribute('href', '#')
  })
})
