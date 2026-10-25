interface StatusDotProps {
  color: string
  /** Filled dot = model active, hollow ring = not active yet. */
  active?: boolean
  size?: number
}

export default function StatusDot({ color, active = true, size = 8 }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: active ? color : 'transparent',
        boxShadow: active ? undefined : `inset 0 0 0 1.5px ${color}`,
      }}
    />
  )
}
