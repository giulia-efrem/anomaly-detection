import { score } from '../lib/format'
import type { Method } from '../types'
import { cx } from '../ui/cx'

const COLOR: Record<Method, string> = { supervised: 'var(--color-sup)', unsupervised: 'var(--color-unsup)' }
const SHORT: Record<Method, string> = { supervised: 'Sup', unsupervised: 'Unsup' }

interface ScoreBarProps {
  method: Method
  value: number | null
  threshold?: number
  /** Bar width in px. */
  width?: number
  /** Show "Sup" / "Unsup" before the bar. */
  label?: boolean
  className?: string
}

/** Tiny score bar with its value. Grey below the threshold, method colour at or above it. */
export default function ScoreBar({ method, value, threshold, width = 40, label = false, className }: ScoreBarProps) {
  const above = value !== null && (threshold === undefined || value >= threshold)
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100
  const name = method === 'supervised' ? 'Supervised score' : 'Unsupervised score'
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      {label && <span className="w-9 text-[12px] text-muted">{SHORT[method]}</span>}
      <span
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value ?? undefined}
        className="relative h-1 shrink-0 rounded-sm bg-field"
        style={{ width }}
      >
        <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pct}%`, background: above ? COLOR[method] : '#4a525d' }} />
        {threshold !== undefined && (
          <span className="absolute -inset-y-0.5 w-px bg-ink-2" style={{ left: `${threshold * 100}%` }} title={`Threshold ${score(threshold)}`} />
        )}
      </span>
      <span className={cx('w-8 font-mono text-[12px]', above ? 'text-ink' : 'text-muted')}>{score(value)}</span>
    </span>
  )
}
