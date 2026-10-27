import { ChevronDown } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx } from './cx'

const CONTROL =
  'h-10 w-full rounded-lg bg-field px-3 text-[14px] text-ink placeholder:text-[#5F7189] ' +
  'ring-1 ring-line ring-inset transition-shadow hover:ring-line-strong ' +
  'focus:ring-2 focus:ring-unsup focus:outline-none aria-invalid:ring-[#FFB0A6] disabled:opacity-50'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}

/** Label + control + hint or error, wired up for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error || hint
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children({ id, 'aria-describedby': note ? noteId : undefined, 'aria-invalid': error ? true : undefined })}
      {note && (
        <p id={noteId} className={cx('text-[12px]', error ? 'text-[#FFB0A6]' : 'text-muted')}>
          {note}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(CONTROL, 'appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
      />
    </div>
  )
}
