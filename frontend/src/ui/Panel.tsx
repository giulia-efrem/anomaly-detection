import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

/** Top-level surface: 1px line, radius 4, no shadow. */
export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('rounded border border-line bg-panel', className)} {...rest}>
      {children}
    </section>
  )
}

interface PanelHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}

/** 40px header row of a panel, separated by a line. */
export function PanelHeader({ title, description, actions, as: H = 'h2', className }: PanelHeaderProps) {
  return (
    <div className={cx('flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-3 py-2', className)}>
      <div className="min-w-0">
        <H className="text-[13px] font-semibold">{title}</H>
        {description && <div className="text-[12px] text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Panel used as one item in a list or grid (dataset, clip). Never put one inside another. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <article className={cx('rounded border border-line bg-panel', className)} {...rest}>
      {children}
    </article>
  )
}

/** Toolbar under the top bar: optional short note and page actions. The page title lives in the top bar. */
export function PageBar({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2', className)}>
      <div className="min-w-0 text-[12px] text-muted">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
