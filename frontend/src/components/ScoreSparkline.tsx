import type { ScorePoint } from '../types'

const WINDOW_MS = 60_000

function xOf(t: number, now: number, w: number) {
  return w - ((now - t) / WINDOW_MS) * w
}

/**
 * Tiny line of the last 60 s: the higher of the two scores, each divided by its own
 * threshold, so the dashed line (1.0) is exactly where an alarm starts counting.
 */
export function Sparkline({ points, now, width = 72, height = 18 }: { points: ScorePoint[]; now: number; width?: number; height?: number }) {
  const max = 1.5
  const y = (v: number) => height - 1 - (Math.min(v, max) / max) * (height - 2)
  const vals = points.map((p) => ({ x: xOf(p.t, now, width), v: Math.max(p.sup / p.supThr, p.unsup / p.unsupThr) }))
  const above = vals.length > 0 && vals[vals.length - 1].v >= 1
  const label =
    points.length === 0
      ? 'No score history yet'
      : `Highest score relative to its threshold over the last 60 s: now ${vals[vals.length - 1].v.toFixed(2)}`
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <line x1={0} x2={width} y1={y(1)} y2={y(1)} stroke="#8fa0b4" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
      {vals.length > 1 && (
        <polyline
          points={vals.map((p) => `${p.x.toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={above ? 'var(--color-alarm)' : '#b4c1d0'}
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** Both scores over the last 60 s with their thresholds as dashed lines in the same colours. */
export function ScoreChart({ points, now, height = 56 }: { points: ScorePoint[]; now: number; height?: number }) {
  const width = 240
  const y = (v: number) => height - 2 - Math.max(0, Math.min(1, v)) * (height - 4)
  const last = points[points.length - 1]
  const line = (key: 'sup' | 'unsup') =>
    points.map((p) => `${xOf(p.t, now, width).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  const label = last
    ? `Scores over the last 60 s. Supervised now ${last.sup.toFixed(2)}, unsupervised now ${last.unsup.toFixed(2)}`
    : 'No score history yet'
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full min-w-0" style={{ height }} role="img" aria-label={label}>
      <title>{label}</title>
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#1e2a3a" strokeWidth={1} />
      {last && (
        <>
          <line x1={0} x2={width} y1={y(last.supThr)} y2={y(last.supThr)} stroke="var(--color-sup)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={width} y1={y(last.unsupThr)} y2={y(last.unsupThr)} stroke="var(--color-unsup)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {points.length > 1 && (
        <>
          <polyline points={line('sup')} fill="none" stroke="var(--color-sup)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <polyline points={line('unsup')} fill="none" stroke="var(--color-unsup)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  )
}
