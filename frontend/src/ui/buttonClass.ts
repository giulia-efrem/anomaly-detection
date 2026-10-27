import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border border-accent bg-accent text-on-accent hover:bg-[#5d98ff] active:bg-[#3f7fee]',
  secondary: 'border border-line bg-raised text-ink hover:border-[#323b46] hover:bg-[#1e242c] active:bg-[#232a33]',
  ghost: 'border border-transparent text-ink-2 hover:bg-raised hover:text-ink',
  danger: 'border border-line bg-raised text-ink hover:border-crit hover:text-ink',
}

export const SIZES: Record<ButtonSize, { base: string; icon: string; iconSize: number }> = {
  sm: { base: 'h-6 gap-1.5 px-2 text-[12px]', icon: 'h-6 w-6', iconSize: 16 },
  md: { base: 'h-8 gap-2 px-3 text-[13px]', icon: 'h-8 w-8', iconSize: 16 },
}

/** Class names for anything that should look like a button (links included). */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', iconOnly = false) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40',
    VARIANTS[variant],
    iconOnly ? SIZES[size].icon : SIZES[size].base,
  )
}
