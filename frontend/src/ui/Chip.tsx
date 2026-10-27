import type { ReactNode } from 'react'
import { cx } from './cx'
import StatusDot from './StatusDot'

interface ChipProps {
  children: ReactNode
  /** Status colour for a leading dot. */
  dot?: string
  /** Filled dot = active, hollow ring = not active yet. */
  active?: boolean
  className?: string
  title?: string
}

/** Small read-only badge: state, dataset, anomaly type. */
export function Chip({ children, dot, active = true, className, title }: ChipProps) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex h-5 items-center gap-1.5 rounded-sm border border-line bg-raised px-1.5 text-[12px] whitespace-nowrap text-ink-2',
        className,
      )}
    >
      {dot && <StatusDot color={dot} active={active} size={6} />}
      {children}
    </span>
  )
}

/** A number next to a label, such as open alarms in the sidebar. */
export function Count({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'crit'; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono text-[12px] leading-none',
        tone === 'crit' ? 'bg-crit text-white' : 'bg-raised text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  )
}
