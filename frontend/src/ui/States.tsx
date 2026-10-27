import type { LucideIcon } from 'lucide-react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-shimmer rounded-lg bg-[#1A2840]', className)} />
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** Says what is missing and what to do next. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-ink-2">
        <Icon size={22} aria-hidden="true" />
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      {description && <p className="max-w-[44ch] text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title: string
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#2A1E24] text-[#FFB0A6]">
        <TriangleAlert size={22} aria-hidden="true" />
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="max-w-[48ch] text-[13px] text-muted">{message}</p>
      {onRetry && (
        <Button size="sm" icon={RefreshCw} onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  )
}

export function ProgressBar({ value, label, className }: { value: number | null; label: string; className?: string }) {
  const pct = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
      className={cx('relative h-1.5 overflow-hidden rounded-full bg-field', className)}
    >
      <div
        className={cx('absolute inset-y-0 left-0 rounded-full bg-unsup transition-[width] duration-300', pct === null && 'w-1/3 animate-shimmer')}
        style={pct === null ? undefined : { width: `${pct}%` }}
      />
    </div>
  )
}
