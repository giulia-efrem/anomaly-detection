import { score } from '../lib/format'
import type { Method } from '../types'
import { cx } from '../ui/cx'

const METHOD_LABEL: Record<Method, string> = {
  supervised: 'Supervised',
  unsupervised: 'Unsupervised',
}

const METHOD_COLOR: Record<Method, string> = {
  supervised: 'var(--color-sup)',
  unsupervised: 'var(--color-unsup)',
}

interface ScoreMeterProps {
  method: Method
  value: number | null
  /** When given, a tick marks it and the bar turns gray below it. */
  threshold?: number
  /** Word shown after the value when it is above threshold, e.g. "fight". */
  suffix?: string
  labelWidth?: number
  /** Track colour, so the bar reads on both cards and video overlays. */
  trackClass?: string
}

export default function ScoreMeter({
  method,
  value,
  threshold,
  suffix,
  labelWidth = 88,
  trackClass = 'bg-field',
}: ScoreMeterProps) {
  const above = value !== null && (threshold === undefined || value >= threshold)
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100
  const label = METHOD_LABEL[method]

  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="shrink-0 text-ink-2" style={{ width: labelWidth }}>
        {label}
      </span>
      <div
        className={cx('relative h-1.5 min-w-10 flex-1 rounded-full', trackClass)}
        role="meter"
        aria-label={`${label} score`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value ?? undefined}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: above ? METHOD_COLOR[method] : '#3A4D66' }}
        />
        {threshold !== undefined && (
          <div
            className="absolute -top-[3px] -bottom-[3px] w-[2px] -translate-x-1/2 rounded-full bg-muted"
            style={{ left: `${threshold * 100}%` }}
            title={`Threshold ${score(threshold)}`}
          />
        )}
      </div>
      <span className={cx('shrink-0 font-cond whitespace-nowrap', above ? 'font-semibold text-ink' : 'text-muted')}>
        {value === null ? 'n/a' : score(value)}
        {above && suffix && <span className="font-medium text-ink-2"> {suffix}</span>}
      </span>
    </div>
  )
}
