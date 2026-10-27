import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from './cx'
import { ToastContext, type ToastInput } from './toast-context'

interface ToastItem extends ToastInput {
  id: number
}


const ICONS = { success: CircleCheck, info: Info, error: TriangleAlert }
const ICON_COLORS = { success: 'text-healthy', info: 'text-unsup', error: 'text-[#FFB0A6]' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++
      setItems((list) => [...list.slice(-3), { ...t, id }])
      setTimeout(() => dismiss(id), t.duration ?? (t.action ? 8000 : 5000))
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto"
      >
        {items.map((t) => {
          const tone = t.tone ?? 'info'
          const Icon = ICONS[tone]
          return (
            <div
              key={t.id}
              role={tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-xl border border-line-strong bg-card p-4 sm:w-[400px]"
            >
              <Icon size={18} className={cx('mt-0.5 shrink-0', ICON_COLORS[tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] text-ink-2">{t.description}</p>}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-ink underline-offset-2 hover:bg-[#233550] hover:underline"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="-mt-1 -mr-1 shrink-0 rounded-lg p-1 text-muted hover:bg-[#233550] hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
