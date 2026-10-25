import { cx } from './cx'

interface ToggleGroupProps<T extends string> {
  label: string
  options: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
}

/** Single-choice filter buttons (aria-pressed). Active: light fill; inactive: quiet surface. */
export function ToggleGroup<T extends string>({ label, options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors',
              active ? 'bg-ink text-on-light' : 'bg-raised text-ink-2 hover:bg-[#233550] hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cx('font-cond font-medium', active ? 'text-[#3A4D66]' : 'text-muted')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
