import type { LucideIcon } from 'lucide-react'
import { cx } from './cx'

interface ToggleGroupProps<T extends string> {
  label: string
  options: { id: T; label: string; count?: number; icon?: LucideIcon; iconOnly?: boolean }[]
  value: T
  onChange: (id: T) => void
  className?: string
}

/** Segmented control for one choice (aria-pressed). */
export function ToggleGroup<T extends string>({ label, options, value, onChange, className }: ToggleGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-md border border-line bg-field p-px', className)}>
      {options.map((o) => {
        const active = o.id === value
        const Icon = o.icon
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            aria-label={o.iconOnly ? o.label : undefined}
            title={o.iconOnly ? o.label : undefined}
            onClick={() => onChange(o.id)}
            className={cx(
              'inline-flex h-[26px] items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium transition-colors',
              active ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            {!o.iconOnly && o.label}
            {o.count !== undefined && <span className="font-mono text-muted">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** On/off button for a toolbar option. */
export function ToggleButton({ label, pressed, onChange, icon: Icon }: { label: string; pressed: boolean; onChange: (v: boolean) => void; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-colors',
        pressed ? 'border-accent bg-raised text-ink' : 'border-line text-ink-2 hover:text-ink',
      )}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {label}
    </button>
  )
}
