import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

/** Top-level surface. Radius 12, no border: contrast with the page does the work. */
export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('rounded-xl bg-panel', className)} {...rest}>
      {children}
    </section>
  )
}

interface PanelHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Heading level for the title. */
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}

export function PanelHeader({ title, description, actions, as: H = 'h2', className }: PanelHeaderProps) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-x-6 gap-y-2', className)}>
      <div className="min-w-0">
        <H className="text-[16px] leading-6 font-semibold">{title}</H>
        {description && <div className="text-[13px] text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Raised surface inside a panel (incident cards, dataset cards). */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <article className={cx('rounded-xl bg-card', className)} {...rest}>
      {children}
    </article>
  )
}

/** Page title row used by every route. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-6 pt-6 pb-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-[72ch] text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
