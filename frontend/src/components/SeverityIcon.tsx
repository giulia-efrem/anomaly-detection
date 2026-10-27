import { SEVERITY } from '../lib/classes'
import type { Severity } from '../types'
import { cx } from '../ui/cx'

/** Critical (octagon, red) or warning (triangle, amber). Always paired with a text label or an accessible name. */
export default function SeverityIcon({ severity, withLabel = false, className }: { severity: Severity; withLabel?: boolean; className?: string }) {
  const s = SEVERITY[severity]
  const Icon = s.icon
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <Icon size={16} className={cx('shrink-0', s.text)} aria-hidden={withLabel} aria-label={withLabel ? undefined : s.label} role={withLabel ? undefined : 'img'} />
      {withLabel && <span className="text-[13px]">{s.label}</span>}
    </span>
  )
}
