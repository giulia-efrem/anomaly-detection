import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'overlay'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-on-light hover:bg-white active:bg-ink-2',
  secondary: 'border border-line-strong bg-card text-ink hover:bg-raised active:bg-[#1c2a3d]',
  ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
  overlay: 'bg-[rgba(7,12,18,0.82)] text-ink-2 hover:bg-[rgba(7,12,18,0.95)] hover:text-ink',
}

export const SIZES: Record<ButtonSize, { base: string; icon: string; iconSize: number }> = {
  sm: { base: 'h-7 gap-1.5 px-2.5 text-[13px]', icon: 'h-7 w-7', iconSize: 14 },
  md: { base: 'h-10 gap-2 px-4 text-[14px]', icon: 'h-10 w-10', iconSize: 16 },
}

/** Class names for anything that should look like a button (links included). */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', iconOnly = false) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
    VARIANTS[variant],
    iconOnly ? SIZES[size].icon : SIZES[size].base,
  )
}
