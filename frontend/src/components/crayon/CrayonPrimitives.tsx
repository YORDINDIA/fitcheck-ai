import type { CSSProperties, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface CrayonBoxProps {
  children: ReactNode
  className?: string
  fill?: string
  solid?: string
  lineColor?: string
  radius?: number | string
  showLine?: boolean
  as?: 'div' | 'section' | 'article' | 'aside'
  id?: string
  style?: CSSProperties
}

export function CrayonBox({
  children,
  className,
  fill,
  solid,
  lineColor,
  radius,
  showLine = true,
  as: Tag = 'div',
  id,
  style,
}: CrayonBoxProps) {
  const vars: CSSProperties = {
    ...style,
    ...(fill || solid ? ({ '--c': fill ?? solid } as CSSProperties) : {}),
    ...(lineColor ? ({ '--lc': lineColor } as CSSProperties) : {}),
    ...(radius !== undefined
      ? ({ '--r': typeof radius === 'number' ? `${radius}px` : radius } as CSSProperties)
      : {}),
  }

  return (
    <Tag id={id} className={cn('cp-cr', className)} style={vars}>
      {solid && <span className="cp-solid" aria-hidden="true" />}
      {fill && <span className="cp-fill" aria-hidden="true" />}
      {showLine && <span className="cp-line" aria-hidden="true" />}
      {children}
    </Tag>
  )
}

type CrayonButtonVariant = 'orange' | 'dark' | 'yellow' | 'paper'
type CrayonButtonSize = 'md' | 'sm'

function btnClasses(variant: CrayonButtonVariant, size: CrayonButtonSize, className?: string) {
  return cn(
    'cp-btn',
    variant !== 'paper' && 'cp-cr',
    variant === 'orange' && 'orange',
    variant === 'dark' && 'dark',
    variant === 'yellow' && 'yellow',
    variant === 'paper' && 'paper-pill',
    size === 'sm' && 'sm',
    className,
  )
}

export function CrayonLink({
  variant = 'orange',
  size = 'md',
  className,
  children,
  ...props
}: LinkProps & {
  variant?: CrayonButtonVariant
  size?: CrayonButtonSize
}) {
  return (
    <Link className={btnClasses(variant, size, className)} {...props}>
      {variant !== 'paper' && <span className="cp-solid" aria-hidden="true" />}
      {children}
    </Link>
  )
}

export function CrayonButton({
  variant = 'orange',
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: CrayonButtonVariant
  size?: CrayonButtonSize
}) {
  return (
    <button type={type} className={btnClasses(variant, size, className)} {...props}>
      {variant !== 'paper' && <span className="cp-solid" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function PaperCard({
  children,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('cp-paper', className)} style={style} {...props}>
      {children}
    </div>
  )
}

export function Keycap({
  children,
  active = false,
  className,
}: {
  children: ReactNode
  active?: boolean
  className?: string
}) {
  return <kbd className={cn('cp-kbd', active && 'on', className)}>{children}</kbd>
}

export function UnderlineSquiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 22" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 15C64 6 142 5 218 11C258 14 292 10 316 7"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        style={{ filter: 'url(#cp-line)' }}
      />
    </svg>
  )
}

export function HeroDoodles() {
  return (
    <>
      <div className="cp-doodle cp-d-sun" aria-hidden="true">
        <svg viewBox="0 0 110 110" fill="none">
          <circle cx="55" cy="55" r="24" fill="var(--cp-yellow)" />
          <g stroke="var(--cp-orange)" strokeWidth="5" strokeLinecap="round">
            <line x1="55" y1="10" x2="55" y2="21" />
            <line x1="55" y1="89" x2="55" y2="100" />
            <line x1="10" y1="55" x2="21" y2="55" />
            <line x1="89" y1="55" x2="100" y2="55" />
            <line x1="23" y1="23" x2="31" y2="31" />
            <line x1="79" y1="79" x2="87" y2="87" />
            <line x1="87" y1="23" x2="79" y2="31" />
            <line x1="31" y1="79" x2="23" y2="87" />
          </g>
        </svg>
      </div>

      <div className="cp-doodle cp-d-cloud" aria-hidden="true">
        <svg viewBox="0 0 140 84" fill="none">
          <path
            d="M36 68H106C120 68 130 58 130 46C130 35 121 26 110 25C105 13 92 6 78 8C66 10 56 18 52 28C49 27 45 26 41 26C26 26 14 36 14 48C14 59 24 68 36 68Z"
            fill="var(--cp-sky)"
            stroke="var(--cp-ink)"
            strokeWidth="4.5"
            strokeLinejoin="round"
            style={{ filter: 'url(#cp-line)' }}
          />
        </svg>
      </div>

      <div className="cp-doodle cp-d-star" aria-hidden="true">
        <svg viewBox="0 0 60 60" fill="none">
          <path
            d="M30 6L36.5 21.5L53 23L40.2 34L44 50.5L30 41.5L16 50.5L19.8 34L7 23L23.5 21.5L30 6Z"
            fill="var(--cp-mint-card)"
            stroke="var(--cp-ink)"
            strokeWidth="4"
            strokeLinejoin="round"
            style={{ filter: 'url(#cp-line)' }}
          />
        </svg>
      </div>

      <div className="cp-doodle cp-d-heart" aria-hidden="true">
        <svg viewBox="0 0 60 60" fill="none">
          <path
            d="M30 50C30 50 9 37 9 22C9 14.5 14.8 9.5 21.5 9.5C25.5 9.5 28.4 11.6 30 14.5C31.6 11.6 34.5 9.5 38.5 9.5C45.2 9.5 51 14.5 51 22C51 37 30 50 30 50Z"
            fill="var(--cp-pink)"
            stroke="var(--cp-ink)"
            strokeWidth="4"
            strokeLinejoin="round"
            style={{ filter: 'url(#cp-line)' }}
          />
        </svg>
      </div>
    </>
  )
}
