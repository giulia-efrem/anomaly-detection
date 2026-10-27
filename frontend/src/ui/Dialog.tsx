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
      className={cx('m-auto w-[calc(100%-32px)] rounded border border-line bg-panel p-0 text-ink', WIDTHS[size])}
    >
      {open && (
        <div className="flex max-h-[calc(100vh-64px)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[14px] font-semibold">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-[12px] text-muted">{description}</div>}
            </div>
            <Button variant="ghost" size="sm" iconOnly icon={X} aria-label="Close" onClick={onClose} />
          </div>
          {children && <div className="thin-scroll overflow-y-auto p-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
