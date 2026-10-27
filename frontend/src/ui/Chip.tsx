import type { ReactNode } from 'react'
import { cx } from './cx'
import StatusDot from './StatusDot'

interface ChipProps {
  children: ReactNode
  /** Model or health colour for a leading dot. */
  dot?: string
  /** Filled dot = active, hollow ring = not active yet. */
  active?: boolean
  /** Chips drawn over video get a translucent dark fill. */
  onVideo?: boolean
  className?: string
  title?: string
}

/** Small read-only label: model state, dataset, anomaly type. */
export function Chip({ children, dot, active = true, onVideo = false, className, title }: ChipProps) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-lg px-2 font-cond text-[12px] whitespace-nowrap text-ink-2',
        onVideo ? 'bg-[rgba(8,14,22,0.74)] backdrop-blur-sm' : 'bg-raised',
        className,
      )}
    >
      {dot && <StatusDot color={dot} active={active} size={7} />}
      {children}
    </span>
  )
}

type PillTone = 'neutral' | 'review' | 'live'

const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-ink text-on-light', // review counts on tiles
  review: 'bg-[#3A1F24] text-[#FFB0A6]', // nav count of incidents to review
  live: 'bg-alarm text-[#1A0B0B]', // only for a live anomaly
}

/** Rounded count or status pill. */
export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: PillTone; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-cond text-[12px] font-semibold whitespace-nowrap',
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
