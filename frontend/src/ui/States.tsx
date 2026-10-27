import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'

/** Placeholder block while data loads. Static: nothing pulses. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('rounded-sm bg-raised', className)} />
}

interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** Says what is missing and what to do next. Plain text, no illustration. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-start gap-1 px-4 py-6', className)}>
      <p className="text-[13px] text-ink-2">{title}</p>
      {description && <p className="max-w-[60ch] text-[12px] text-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
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
  const message = error instanceof Error ? error.message : 'Request failed.'
  return (
    <div role="alert" className={cx('flex flex-col items-start gap-1 px-4 py-6', className)}>
      <p className="text-[13px] text-ink">{title}</p>
      <p className="max-w-[60ch] text-[12px] text-muted">{message}</p>
      {onRetry && (
        <Button size="sm" icon={RefreshCw} onClick={onRetry} className="mt-2">
          Retry
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
      className={cx('relative h-1 overflow-hidden rounded-sm bg-field', className)}
    >
      {pct !== null && <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />}
    </div>
  )
}
