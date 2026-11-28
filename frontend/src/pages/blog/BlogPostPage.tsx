import { useParams, Link } from 'react-router-dom'
import { Calendar, Clock, ArrowLeft, User, ArrowRight, Loader2 } from 'lucide-react'

import { BlogImage } from '@/components/blog/BlogImage'
import { CrayonBox, CrayonButton, CrayonLink, PaperCard } from '@/components/crayon/CrayonPrimitives'
import { AnimatedSection } from '@/components/landing/AnimatedSection'
import { BreadcrumbJsonLd, buildArticleSchema } from '@/components/seo/JsonLd'
import SEO from '@/components/seo/SEO'
import { formatDate } from '@/i18n'
import { useBlogPost, useBlogPosts } from '@/hooks/useBlog'
import { trialRegisterHref } from '@/lib/trial-offer'
import { escapeHtml, sanitizeMarkdownUrl } from '@/lib/utils'

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()

  const { data: post, isLoading, error, refetch } = useBlogPost(slug)

  const { data: relatedPostsData } = useBlogPosts(
    1,
    4,
    post?.category,
    undefined,
    { enabled: !!post },
  )

  const relatedPosts =
    relatedPostsData?.posts?.filter((p) => p.slug !== post?.slug)?.slice(0, 3) || []

  if (isLoading) {
    return (
      <div className="flex min-h-svh justify-center pt-32" role="status" aria-live="polite">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--cp-orange)]" />
      </div>
    )
  }

  if (error || !post) {
    const errorStatus = (error as (Error & { status?: number }) | null | undefined)?.status
    const isNotFound = !error || errorStatus === 404
    return (
      <div className="min-h-svh px-4 pt-32 text-center" role="alert">
        <h1 className="cp-hand mb-2 text-4xl text-[var(--cp-ink)]">
          {isNotFound ? 'Post not found' : 'Unable to load article'}
        </h1>
        <p className="mb-6 text-[var(--cp-ink-2)]">
          {isNotFound
            ? 'This article may have been moved or removed.'
            : 'We could not load this article right now. Please try again.'}
        </p>
        {isNotFound ? (
          <Link
            to="/blog"
            className="inline-flex items-center font-bold text-[var(--cp-orange-deep)] hover:underline"
          >
            <ArrowLeft className="me-2 h-4 w-4" />
            Back to blog
          </Link>
        ) : (
          <CrayonButton type="button" variant="orange" size="sm" onClick={() => void refetch()}>
            Try again
          </CrayonButton>
        )}
      </div>
    )
  }

  const breadcrumbs = [
    { name: 'Home', url: 'https://fitcheckaiapp.com/' },
    { name: 'Blog', url: 'https://fitcheckaiapp.com/blog' },
    { name: post.title, url: `https://fitcheckaiapp.com/blog/${post.slug}` },
  ]

  const articleSchema = buildArticleSchema({
    headline: post.title,
    description: post.excerpt,
    authorName: post.author,
    datePublished: new Date(post.date).toISOString(),
    dateModified: new Date(post.updated_at || post.date).toISOString(),
    keywords: post.keywords,
    section: post.category,
    url: `https://fitcheckaiapp.com/blog/${post.slug}`,
    image: post.featured_image_url,
    speakableSelectors: ['#article-lede', '#article-body'],
  })

  return (
    <>
      <SEO
        title={`${post.title} | FitCheck AI Blog`}
        description={post.excerpt}
        canonicalUrl={`https://fitcheckaiapp.com/blog/${post.slug}`}
        ogType="article"
        jsonLd={articleSchema}
      />
      <BreadcrumbJsonLd items={breadcrumbs} />

      <div className="cp-wrap">
        <div className="mx-auto max-w-[780px] pt-10">
          <AnimatedSection>
            <Link
              to="/blog"
              className="mb-5 inline-flex items-center text-sm font-bold text-[var(--cp-ink-2)] hover:text-[var(--cp-orange-deep)]"
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              Back to Blog
            </Link>

            <div className="mb-4">
              <span className="cp-chip">{post.category}</span>
            </div>

            <h1
              id="article-lede"
              className="cp-hand text-[clamp(40px,6vw,64px)] leading-[0.96] text-[var(--cp-ink)]"
            >
              {post.title}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[var(--cp-ink-3)]">
              <span className="flex items-center">
                <User className="me-2 h-4 w-4" />
                <strong className="text-[var(--cp-ink)]">{post.author}</strong>
                {post.author_title && <span className="ms-1">— {post.author_title}</span>}
              </span>
              <span className="flex items-center">
                <Calendar className="me-2 h-4 w-4" />
                {formatDate(post.date)}
              </span>
              <span className="flex items-center">
                <Clock className="me-2 h-4 w-4" />
                {post.read_time}
              </span>
            </div>
          </AnimatedSection>

          <PaperCard className="mt-8 overflow-hidden p-2">
            <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl bg-[var(--cp-surface-muted)] md:aspect-[21/9]">
              <BlogImage
                src={post.featured_image_url}
                alt={post.title}
                emoji={post.emoji}
                emojiClassName="text-6xl md:text-8xl lg:text-9xl"
                sizes="(min-width: 1024px) 1024px, 100vw"
                widths={[640, 960, 1280, 1600]}
                quality={75}
                priority
                width={1280}
                height={548}
              />
            </div>
          </PaperCard>

          <CrayonBox className="cp-doc !mt-8 !max-w-none" radius={28}>
            <article id="article-body" className="inner cp-prose">
              {post.content.split('\n\n').map((paragraph, index) => {
                const trimmed = paragraph.trim()
                if (!trimmed) return null

                if (trimmed.startsWith('# ')) {
                  return <h2 key={index}>{trimmed.replace('# ', '')}</h2>
                }
                if (trimmed.startsWith('## ')) {
                  return <h2 key={index}>{trimmed.replace('## ', '')}</h2>
                }
                if (trimmed.startsWith('### ')) {
                  return <h3 key={index}>{trimmed.replace('### ', '')}</h3>
                }
                if (trimmed.startsWith('- ')) {
                  const items = trimmed.split('\n').filter((line) => line.trim().startsWith('- '))
                  return (
                    <ul key={index}>
                      {items.map((item, i) => (
                        <li
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: formatInlineText(item.replace('- ', '')),
                          }}
                        />
                      ))}
                    </ul>
                  )
                }
                if (/^\d+\./.test(trimmed)) {
                  const items = trimmed.split('\n').filter((line) => /^\d+\./.test(line.trim()))
                  return (
                    <ol key={index}>
                      {items.map((item, i) => (
                        <li
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: formatInlineText(item.replace(/^\d+\.\s*/, '')),
                          }}
                        />
                      ))}
                    </ol>
                  )
                }
                return (
                  <p
                    key={index}
                    dangerouslySetInnerHTML={{ __html: formatInlineText(trimmed) }}
                  />
                )
              })}

              <div className="mt-10 border-t-2 border-dashed border-[var(--cp-rule-dashed)] pt-6">
                <p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.12em] text-[var(--cp-ink-3)]">
                  Related Topics
                </p>
                <div className="flex flex-wrap gap-2">
                  {post.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-[var(--cp-surface-muted)] px-3 py-1 text-xs font-bold text-[var(--cp-ink)] shadow-[0_0_0_1.5px_var(--cp-ink)]"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          </CrayonBox>
        </div>

        {relatedPosts.length > 0 && (
          <section className="cp-sec mx-auto max-w-5xl">
            <h2 className="cp-hand text-4xl text-[var(--cp-ink)]">Related Articles</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <Link key={relatedPost.slug} to={`/blog/${relatedPost.slug}`} className="group block">
                  <PaperCard className="h-full overflow-hidden p-3 transition-transform duration-150 group-hover:-translate-y-1">
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[var(--cp-surface-muted)]">
                      <BlogImage
                        src={relatedPost.featured_image_url}
                        alt={relatedPost.title}
                        emoji={relatedPost.emoji}
                        emojiClassName="text-4xl"
                        sizes="(min-width: 768px) 33vw, 100vw"
                        widths={[320, 480, 640, 800]}
                        width={640}
                        height={360}
                      />
                    </div>
                    <div className="p-2 pt-3">
                      <span className="font-mono text-xs font-bold text-[var(--cp-orange-deep)]">
                        {relatedPost.category}
                      </span>
                      <h3 className="cp-hand mt-1 line-clamp-2 text-2xl leading-tight text-[var(--cp-ink)] group-hover:text-[var(--cp-orange-deep)]">
                        {relatedPost.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--cp-ink-2)]">
                        {relatedPost.excerpt}
                      </p>
                    </div>
                  </PaperCard>
                </Link>
              ))}
            </div>
          </section>
        )}

        <CrayonBox
          solid="var(--cp-yellow-banner)"
          radius={32}
          showLine={false}
          className="cp-doc-cta mx-auto max-w-[780px]"
        >
          <h2>Transform your wardrobe with AI</h2>
          <p className="mx-auto max-w-xl text-base font-medium text-[var(--cp-ink-2)]">
            Join thousands organizing, planning, and optimizing their style.
          </p>
          <div className="cp-ctas">
            <CrayonLink to={trialRegisterHref()} variant="dark">
              Start Free Today
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CrayonLink>
          </div>
        </CrayonBox>
      </div>
    </>
  )
}

function formatInlineText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label, url) =>
        `<a href="${sanitizeMarkdownUrl(url)}" class="break-words">${label}</a>`,
    )
}
