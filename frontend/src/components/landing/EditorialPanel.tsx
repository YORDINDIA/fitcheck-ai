import { cn } from '@/lib/utils'

interface EditorialPanelProps {
  children: React.ReactNode
  className?: string
  fill?: string
}

/** Crayon-framed card with a paper inner surface for the interactive landing demos. */
export function EditorialPanel({ children, className, fill }: EditorialPanelProps) {
  return (
    <div
      className={cn('cp-cr bg-[var(--cp-surface)] p-3.5 sm:p-4', className)}
      style={
        {
          '--r': '28px',
          ...(fill ? { '--c': fill } : {}),
        } as React.CSSProperties
      }
    >
      {fill && <span className="cp-fill" aria-hidden="true" />}
      <span className="cp-line" aria-hidden="true" />
      <div className="cp-paper relative flex h-full flex-col p-5">{children}</div>
    </div>
  )
}
