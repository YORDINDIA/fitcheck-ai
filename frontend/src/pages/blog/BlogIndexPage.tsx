import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Calendar, Clock } from 'lucide-react'

import { BlogImage } from '@/components/blog/BlogImage'
import { CrayonBox, CrayonButton, CrayonLink } from '@/components/crayon/CrayonPrimitives'
import { AnimatedSection } from '@/components/landing/AnimatedSection'
import SEO from '@/components/seo/SEO'
import { InfiniteScrollSentinel } from '@/components/ui/infinite-scroll-sentinel'
import { useBlogCategories } from '@/hooks/useBlog'
import { useInfiniteBlogPosts } from '@/hooks/useInfiniteBlogPosts'
import { formatDate } from '@/i18n'
import { trialRegisterHref } from '@/lib/trial-offer'
import { cn } from '@/lib/utils'

const CARD_FILLS = [
  'var(--cp-sky)',
  'var(--cp-mint)',
  'var(--cp-peach)',
  'var(--cp-lilac)',
  'var(--cp-yellow-banner)',
  'var(--cp-pink)',
]

export default function BlogIndexPage() {
  const { category } = useParams<{ category: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchQuery = searchParams.get('search')?.trim() || ''
  const pageSize = 12
  const [searchValue, setSearchValue] = useState(searchQuery)

  useEffect(() => {
    setSearchValue(searchQuery)
  }, [searchQuery])

  const { data: categories, isLoading: isLoadingCategories, error: categoriesError } = useBlogCategories()
  const categoryFilter = category
    ? categories?.find((candidate) => slugifyCategory(candidate) === category)
    : undefined
  const categoryIsResolving = Boolean(category && isLoadingCategories)
  const categoryIsInvalid = Boolean(category && !isLoadingCategories && (categoriesError || !categoryFilter))

  const {
    posts,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingPosts,
    isError: postsError,
    fetchNextPage,
    refetch: refetchPosts,
  } = useInfiniteBlogPosts({
    category: categoryFilter,
    search: searchQuery,
    pageSize,
    enabled: !categoryIsResolving && !categoryIsInvalid,
  })

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const trimmed = searchValue.trim()
      if (trimmed) next.set('search', trimmed)
      else next.delete('search')
      next.delete('page')
      return next
    })
  }

  const handleClearSearch = () => {
    setSearchValue('')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('search')
      next.delete('page')
      return next
    })
  }

  return (
    <>
      <SEO
        title={category ? `${categoryFilter || category} | FitCheck AI Blog` : 'Style & Wardrobe Blog | FitCheck AI'}
        description={
          category
            ? `${categoryFilter || category} articles on digital closets, AI outfit planning, and style from FitCheck AI.`
            : 'Guides on digital closets, AI outfit planning, virtual try-on, cost-per-wear, and getting more from clothes you own.'
        }
        canonicalUrl={`https://fitcheckaiapp.com/blog${category ? `/category/${category}` : ''}`}
        keywords="wardrobe blog, AI fashion tips, digital closet guides, outfit planning"
      />

      <div className="cp-wrap">
        <section className="cp-doc-head">
          <p className="cp-eyebrow">{category ? categoryFilter || category : 'BLOG'}</p>
          <h1>{category ? `${categoryFilter || category} Articles` : 'Fashion, AI & Style Tips'}</h1>
          <p className="cp-lead">
            {category
              ? `Explore our latest articles on ${categoryFilter || category}`
              : 'Discover how AI is transforming wardrobe management and get expert style advice'}
          </p>

          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-8 flex max-w-xl flex-col gap-2.5 sm:flex-row"
            role="search"
          >
            <label htmlFor="blog-search" className="sr-only">
              Search blog posts
            </label>
            <input
              id="blog-search"
              name="search"
              autoComplete="off"
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search articles…"
              className="min-w-0 flex-1 rounded-xl border-2 border-[var(--cp-ink)] bg-[var(--cp-surface)] px-4 py-3 text-base text-[var(--cp-ink)] shadow-[3px_4px_0_var(--cp-shadow-ink)] placeholder:text-[var(--cp-ink-3)]"
            />
            <div className="flex gap-2">
              <CrayonButton type="submit" variant="orange" size="sm" className="flex-1 sm:flex-none">
                Search
              </CrayonButton>
              {searchQuery && (
                <CrayonButton
                  type="button"
                  variant="paper"
                  size="sm"
                  onClick={handleClearSearch}
                  className="flex-1 sm:flex-none"
                >
                  Clear
                </CrayonButton>
              )}
            </div>
          </form>

          {/* Category Pills directly below search form */}
          <div
            className={cn(
              'mt-5 flex flex-wrap justify-center gap-2',
              (isLoadingCategories || (categories?.length ?? 0) > 0) &&
                'min-h-[9.75rem] xs:min-h-[8rem] sm:min-h-[6.5rem] md:min-h-11',
            )}
          >
            {isLoadingCategories ? (
              Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="h-11 w-20 animate-pulse rounded-full bg-[var(--cp-surface-muted)] shadow-[0_0_0_2px_var(--cp-ink)]"
                />
              ))
            ) : (
              categories &&
              categories.length > 0 && (
                <>
                  <Link
                    to="/blog"
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-bold shadow-[0_0_0_2px_var(--cp-ink)] transition-colors',
                      !category
                        ? 'bg-[var(--cp-ink)] text-[var(--cp-paper)]'
                        : 'bg-[var(--cp-surface)] text-[var(--cp-ink)] hover:bg-[var(--cp-yellow-banner)]',
                    )}
                  >
                    All
                  </Link>
                  {categories.map((cat) => {
                    const catSlug = slugifyCategory(cat)
                    const isActive = category === catSlug
                    return (
                      <Link
                        key={cat}
                        to={`/blog/category/${catSlug}`}
                        className={cn(
                          'inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-bold shadow-[0_0_0_2px_var(--cp-ink)] transition-colors',
                          isActive
                            ? 'bg-[var(--cp-ink)] text-[var(--cp-paper)]'
                            : 'bg-[var(--cp-surface)] text-[var(--cp-ink)] hover:bg-[var(--cp-yellow-banner)]',
                        )}
                      >
                        {cat}
                      </Link>
                    )
                  })}
                </>
              )
            )}
          </div>
        </section>

        <section className="cp-sec">
          {categoryIsResolving || isLoadingPosts ? (
            <div
              className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="cp-paper overflow-hidden p-4"
                >
                  <div className="aspect-[16/9] animate-pulse rounded-xl bg-[var(--cp-surface-muted)]" />
                  <div className="mt-4 space-y-3">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--cp-surface-muted)]" />
                    <div className="h-6 w-full animate-pulse rounded bg-[var(--cp-surface-muted)]" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--cp-surface-muted)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : categoryIsInvalid ? (
            <div className="space-y-4 py-20 text-center" role="alert">
              <p className="text-[var(--cp-ink-2)]">
                {categoriesError ? 'Unable to load blog categories.' : 'That blog category was not found.'}
              </p>
              <Link to="/blog" className="inline-block font-bold text-[var(--cp-orange-deep)] hover:underline">
                View all posts
              </Link>
            </div>
          ) : postsError ? (
            <div className="space-y-4 py-20 text-center" role="alert">
              <p className="text-[var(--cp-ink-2)]">Failed to load blog posts. Please try again.</p>
              <CrayonButton type="button" variant="orange" size="sm" onClick={() => refetchPosts()}>
                Try again
              </CrayonButton>
            </div>
          ) : posts.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-[var(--cp-ink-2)]">
                No blog posts found{category ? ` in ${categoryFilter || category}` : ''}
                {searchQuery ? ` matching “${searchQuery}”` : ''}. Check back soon!
              </p>
              {category && (
                <Link
                  to="/blog"
                  className="mt-4 inline-block font-bold text-[var(--cp-orange-deep)] hover:underline"
                >
                  View all posts
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {posts.map((post, index) => (
                  <AnimatedSection key={post.slug} delay={index * 60}>
                    <Link to={`/blog/${post.slug}`} className="group block h-full">
                      <CrayonBox
                        as="article"
                        fill={CARD_FILLS[index % CARD_FILLS.length]}
                        radius={26}
                        className="cp-post h-full"
                      >
                        <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl bg-[var(--cp-surface-muted)] shadow-[0_0_0_2px_var(--cp-ink)]">
                          <BlogImage
                            src={post.featured_image_url}
                            alt={post.title}
                            emoji={post.emoji}
                            emojiClassName="text-6xl md:text-7xl transform group-hover:scale-110 transition-transform duration-300"
                            imgClassName="transform group-hover:scale-105 transition-transform duration-500"
                            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                            widths={[320, 480, 640, 800]}
                            width={640}
                            height={360}
                            priority={index === 0}
                          />
                        </div>

                        <div className="mt-4 flex flex-1 flex-col">
                          <div className="mb-2 flex items-center gap-3 text-xs font-bold">
                            <span className="kind">{post.category}</span>
                            <span className="flex items-center font-mono text-[var(--cp-ink-3)]">
                              <Clock className="me-1 h-3.5 w-3.5" />
                              {post.read_time}
                            </span>
                          </div>

                          <h2 className="cp-hand mt-1 line-clamp-2 text-[28px] leading-[1.02] text-[var(--cp-ink)] group-hover:text-[var(--cp-orange-deep)]">
                            {post.title}
                          </h2>

                          <p className="post-box line-clamp-3">{post.excerpt}</p>

                          <div className="mt-4 flex items-center justify-between text-xs font-bold text-[var(--cp-ink-2)]">
                            <span className="flex items-center">
                              <Calendar className="me-1.5 h-3.5 w-3.5" />
                              {formatDate(post.date)}
                            </span>
                            <span className="flex items-center text-[var(--cp-orange-deep)]">
                              Read more
                              <ArrowRight className="ms-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </span>
                          </div>
                        </div>
                      </CrayonBox>
                    </Link>
                  </AnimatedSection>
                ))}
              </div>

              <InfiniteScrollSentinel
                onLoadMore={fetchNextPage}
                hasMore={hasNextPage}
                isLoading={isFetchingNextPage}
              />
            </>
          )}

          <CrayonBox solid="var(--cp-yellow-banner)" radius={32} showLine={false} className="cp-doc-cta">
            <h2>Ready to transform your wardrobe?</h2>
            <p className="mx-auto max-w-xl text-base font-medium text-[var(--cp-ink-2)]">
              Join thousands using AI to organize, plan, and optimize their style.
            </p>
            <div className="cp-ctas">
              <CrayonLink to={trialRegisterHref()} variant="dark">
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </CrayonLink>
            </div>
          </CrayonBox>
        </section>
      </div>
    </>
  )
}

export function slugifyCategory(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
