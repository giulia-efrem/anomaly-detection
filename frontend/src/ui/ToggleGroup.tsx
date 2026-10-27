import { cx } from './cx'

interface ToggleGroupProps<T extends string> {
  label: string
  options: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
  className?: string
}

/** Segmented control in one container (aria-pressed). Active: raised surface and white text. */
export function ToggleGroup<T extends string>({ label, options, value, onChange, className }: ToggleGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-lg border border-line-strong bg-field p-0.5', className)}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cx(
              'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors',
              active ? 'bg-raised font-semibold text-white' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cx('font-mono text-[12px]', active ? 'text-ink-2' : 'text-muted')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
