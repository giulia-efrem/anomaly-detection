import { useRef, type KeyboardEvent } from 'react'
import { cx } from './cx'

export interface TabItem<T extends string> {
  id: T
  label: string
  count?: number
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  /** Prefix for tab and panel ids: tab `${idBase}-tab-${id}`, panel `${idBase}-panel`. */
  idBase: string
  className?: string
}

/** Accessible tab list (arrow keys, Home, End). Render the panel with tabPanelProps. */
export function Tabs<T extends string>({ items, value, onChange, label, idBase, className }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = items.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    onChange(items[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={cx('flex flex-wrap gap-4 border-b border-line', className)}>
      {items.map((t, i) => {
        const selected = t.id === value
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors',
              selected ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="font-mono text-[12px] text-muted">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
