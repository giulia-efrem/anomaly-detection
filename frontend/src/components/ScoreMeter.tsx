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
  /** When given, a tick marks it and the bar turns grey below it. */
  threshold?: number
  /** Label column width in px; 0 hides the label. */
  labelWidth?: number
  /** Short label ("Sup" / "Unsup") for narrow places. */
  short?: boolean
  className?: string
}

/** Thin score bar with a threshold tick and the value in mono. */
export default function ScoreMeter({ method, value, threshold, labelWidth = 88, short = false, className }: ScoreMeterProps) {
  const above = value !== null && (threshold === undefined || value >= threshold)
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100
  const label = METHOD_LABEL[method]

  return (
    <div className={cx('flex items-center gap-2 text-[12px]', className)}>
      {labelWidth > 0 && (
        <span className="shrink-0 text-ink-2" style={{ width: labelWidth }}>
          {short ? (method === 'supervised' ? 'Sup' : 'Unsup') : label}
        </span>
      )}
      <div
        className="relative h-1 min-w-8 flex-1 rounded-md bg-field"
        role="meter"
        aria-label={`${label} score`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value ?? undefined}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-md"
          style={{ width: `${pct}%`, background: above ? METHOD_COLOR[method] : '#3a4b60' }}
        />
        {threshold !== undefined && (
          <div
            className="absolute -top-[3px] -bottom-[3px] w-px -translate-x-1/2 bg-ink-2"
            style={{ left: `${threshold * 100}%` }}
            title={`Threshold ${threshold.toFixed(2)}`}
          />
        )}
      </div>
      <span className={cx('w-8 shrink-0 text-right font-mono', above ? 'text-ink' : 'text-muted')}>
        {value === null ? 'n/a' : value.toFixed(2)}
      </span>
    </div>
  )
}
