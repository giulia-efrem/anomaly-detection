import { useState } from 'react'
import { score } from '../lib/format'
import type { IncidentDetails } from '../types'

const W = 560
const H = 180
const PAD = { l: 32, r: 8, t: 8, b: 22 }
const SUP = 'var(--color-sup)'
const UNSUP = 'var(--color-unsup)'

interface ScoreChartProps {
  series: NonNullable<IncidentDetails['series']>
  thresholds: { supervised: number; unsupervised: number }
  supervisedLabel: string
}

/**
 * Scores over time around the alert (t = 0). Two series with their thresholds as dashed
 * lines in the same colours; hover shows the values at that moment.
 */
export default function ScoreChart({ series, thresholds, supervisedLabel }: ScoreChartProps) {
  const pts = series.points
  const [hover, setHover] = useState<number | null>(null)
  const t0 = pts[0][0]
  const t1 = Math.max(pts[pts.length - 1][0], t0 + 1)
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b)
  const path = (i: 1 | 2) => pts.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[i]).toFixed(1)}`).join('')
  const ticks = Array.from(new Set([Math.ceil(t0), 0, Math.floor(t1)])).filter((t) => t >= t0 && t <= t1)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + (((e.clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r) * (t1 - t0)
    let best = 0
    for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k][0] - t) < Math.abs(pts[best][0] - t)) best = k
    setHover(best)
  }
  const hp = hover === null ? null : pts[hover]

  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-4 text-[12px] text-ink-2" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: SUP }} aria-hidden="true" />
          Supervised ({supervisedLabel})
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: UNSUP }} aria-hidden="true" />
          Unsupervised
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-ink-2" aria-hidden="true" />
          Thresholds
        </li>
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label={`Scores from ${score(t0)} s to ${score(t1)} s around the alert`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#232a33" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="fill-[#6b7480] font-mono text-[12px]">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="fill-[#6b7480] font-mono text-[12px]">
              {t === 0 ? 'alert' : `${t > 0 ? '+' : ''}${t}s`}
            </text>
          ))}
          {t0 <= 0 && <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} stroke="#a3acb8" strokeWidth={1} />}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(thresholds.supervised)} y2={y(thresholds.supervised)} stroke={SUP} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(thresholds.unsupervised)} y2={y(thresholds.unsupervised)} stroke={UNSUP} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
          <path d={path(1)} fill="none" stroke={SUP} strokeWidth={2} strokeLinejoin="round" />
          <path d={path(2)} fill="none" stroke={UNSUP} strokeWidth={2} strokeLinejoin="round" />
          {hp && (
            <g>
              <line x1={x(hp[0])} x2={x(hp[0])} y1={PAD.t} y2={H - PAD.b} stroke="#a3acb8" strokeWidth={1} strokeDasharray="2 2" />
              <circle cx={x(hp[0])} cy={y(hp[1])} r={4} fill={SUP} stroke="#12161c" strokeWidth={2} />
              <circle cx={x(hp[0])} cy={y(hp[2])} r={4} fill={UNSUP} stroke="#12161c" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute top-1 rounded-sm border border-line bg-raised px-2 py-1 font-mono text-[12px]"
            style={{ left: `${(x(hp[0]) / W) * 100}%`, transform: x(hp[0]) > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
          >
            <div className="text-muted">{hp[0] > 0 ? '+' : ''}{hp[0].toFixed(1)} s</div>
            <div className="text-ink">Sup {score(hp[1])}</div>
            <div className="text-ink">Unsup {score(hp[2])}</div>
          </div>
        )}
      </div>
    </figure>
  )
}
