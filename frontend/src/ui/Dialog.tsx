import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const WIDTHS = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[880px]' }

/** Modal built on <dialog>: focus trap, Escape to close and inert background for free. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-32px)] rounded-xl border border-line-strong bg-panel p-0 text-ink',
        WIDTHS[size],
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100vh-64px)] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[18px] leading-6 font-semibold">
                {title}
              </h2>
              {description && <div className="mt-1 text-[13px] text-muted">{description}</div>}
            </div>
            <Button variant="ghost" size="sm" iconOnly icon={X} aria-label="Close" onClick={onClose} className="-mt-1 -mr-2" />
          </div>
          {children && <div className="thin-scroll overflow-y-auto px-6 pb-6">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 bg-[#0F1825] px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
