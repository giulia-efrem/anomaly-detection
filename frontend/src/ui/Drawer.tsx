import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Accessible name when the title is not plain text. */
  label: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Detail panel sliding over the right edge. Built on <dialog> for focus trap and Escape. */
export function Drawer({ open, onClose, title, label, subtitle, children, footer }: DrawerProps) {
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
      aria-label={label}
      aria-describedby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 ml-auto h-full max-h-none w-full max-w-[600px] border-l border-line bg-panel p-0 text-ink"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div id={titleId} className="min-w-0">
              <div className="text-[16px] font-semibold">{title}</div>
              {subtitle && <div className="mt-0.5 text-[12px] text-ink-2">{subtitle}</div>}
            </div>
            <Button variant="ghost" size="sm" iconOnly icon={X} aria-label="Close" onClick={onClose} />
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
