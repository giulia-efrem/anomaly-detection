import type { AlarmTimelineData, Camera, RaisedBy } from '../types'

const MARKER_BG: Record<RaisedBy, string> = {
  supervised: 'var(--color-sup)',
  unsupervised: 'var(--color-unsup)',
  both: 'linear-gradient(to bottom, var(--color-sup) 50%, var(--color-unsup) 50%)',
}

const LEGEND: { by: RaisedBy; label: string }[] = [
  { by: 'supervised', label: 'Supervised' },
  { by: 'unsupervised', label: 'Unsupervised' },
  { by: 'both', label: 'Both' },
]

const NAME_COL = 112
const COL_GAP = 12

interface AlarmTimelineProps {
  cameras: Camera[]
  data: AlarmTimelineData
}

export default function AlarmTimeline({ cameras, data }: AlarmTimelineProps) {
  const markersByCamera = new Map(data.rows.map((r) => [r.camera_id, r.markers]))
  const camerasWithAlarms = data.rows.filter((r) => r.markers.length > 0).length
  const ticks = data.axis.map((label, i) => ({ label, pct: (i / (data.axis.length - 1)) * 100 }))

  return (
    <section className="rounded-xl border border-line bg-panel px-5 py-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-[16px] leading-5 font-semibold">Alarms in the last {data.window_minutes} minutes</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {data.total_alarms} alarms on {camerasWithAlarms} cameras
          </p>
        </div>
        <ul className="flex items-center gap-4 text-[13px] text-ink-2">
          {LEGEND.map((l) => (
            <li key={l.by} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: MARKER_BG[l.by] }} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex flex-col gap-2">
        {cameras.map((c) => {
          const markers = markersByCamera.get(c.id) ?? []
          return (
            <li key={c.id} className="flex items-center" style={{ gap: COL_GAP }}>
              <span className="shrink-0 truncate text-[13px] text-ink-2" style={{ width: NAME_COL }}>
                {c.name}
              </span>
              <div
                className="relative h-5 flex-1 rounded bg-[#0D1622]"
                aria-label={`${c.name}: ${markers.length === 0 ? 'no alarms' : `${markers.length} alarm groups`}`}
              >
                {ticks.slice(1, -1).map((t) => (
                  <span key={t.label} className="absolute inset-y-0 w-px bg-[#16233A]" style={{ left: `${t.pct}%` }} />
                ))}
                {markers.map((m, i) => (
                  <span
                    key={i}
                    className="absolute inset-y-[3px] w-[5px] -translate-x-1/2 rounded-[2px]"
                    style={{ left: `${m.at}%`, background: MARKER_BG[m.by] }}
                  />
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="relative mt-2 h-4 font-cond text-[12px] text-muted" style={{ marginLeft: NAME_COL + COL_GAP }}>
        {ticks.map((t, i) => (
          <span
            key={t.label}
            className="absolute top-0"
            style={{
              left: `${t.pct}%`,
              transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </section>
  )
}
