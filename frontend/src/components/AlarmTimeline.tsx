import { useEffect, useState } from 'react'
import { RAISED_BY_LABELS, typeLabel } from '../lib/format'
import type { Camera, Incident, RaisedBy } from '../types'
import { Panel } from '../ui/Panel'
import { ErrorState, Skeleton } from '../ui/States'
import { Tabs } from '../ui/Tabs'
import { tabPanelProps } from '../ui/tabPanelProps'

// Half and half for "both", top to bottom on a thin marker.
const MARKER_BG: Record<RaisedBy, string> = {
  supervised: 'var(--color-sup)',
  unsupervised: 'var(--color-unsup)',
  both: 'linear-gradient(to bottom, var(--color-sup) 50%, var(--color-unsup) 50%)',
}

const LEGEND: RaisedBy[] = ['supervised', 'unsupervised', 'both']

type WindowId = '15m' | '1h' | '24h' | '7d'
const WINDOWS: { id: WindowId; label: string; minutes: number; phrase: string }[] = [
  { id: '15m', label: '15 min', minutes: 15, phrase: 'the last 15 minutes' },
  { id: '1h', label: '1 hour', minutes: 60, phrase: 'the last hour' },
  { id: '24h', label: '24 hours', minutes: 1440, phrase: 'the last 24 hours' },
  { id: '7d', label: '7 days', minutes: 10080, phrase: 'the last 7 days' },
]

const NAME_COL = 120
const COL_GAP = 12

function tickLabel(t: number, minutes: number): string {
  const d = new Date(t)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return minutes > 1440 ? `${d.getDate()}/${d.getMonth() + 1}` : hm
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

interface AlarmTimelineProps {
  cameras: Camera[] | undefined
  incidents: Incident[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export default function AlarmTimeline({ cameras, incidents, isLoading, error, onRetry }: AlarmTimelineProps) {
  const [windowId, setWindowId] = useState<WindowId>('15m')
  const win = WINDOWS.find((w) => w.id === windowId)!
  const now = useNow(5000)
  const start = now - win.minutes * 60_000
  const span = now - start

  const inWindow = (incidents ?? []).filter((i) => new Date(i.ended_at).getTime() >= start)
  const totalAlarms = inWindow.reduce((n, i) => n + i.alarm_count, 0)
  const cameraCount = new Set(inWindow.map((i) => i.camera_id)).size
  const ticks = [0, 1, 2, 3].map((k) => ({ pct: (k / 4) * 100, label: tickLabel(start + (span * k) / 4, win.minutes) }))

  return (
    <Panel className="border border-line px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-[16px] leading-6 font-semibold">Alarm timeline</h2>
          <p className="text-[13px] text-muted">
            {isLoading
              ? 'Loading'
              : totalAlarms > 0
                ? `${totalAlarms} ${totalAlarms === 1 ? 'alarm' : 'alarms'} on ${cameraCount} ${cameraCount === 1 ? 'camera' : 'cameras'} in ${win.phrase}`
                : `No alarms in ${win.phrase}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ul className="flex items-center gap-3 text-[12px] text-ink-2" aria-label="Legend">
            {LEGEND.map((by) => (
              <li key={by} className="flex items-center gap-1.5">
                <span className="h-3 w-1 rounded-sm" style={{ background: MARKER_BG[by] }} aria-hidden="true" />
                {RAISED_BY_LABELS[by]}
              </li>
            ))}
          </ul>
          <Tabs items={WINDOWS} value={windowId} onChange={setWindowId} label="Time window" idBase="timeline" />
        </div>
      </div>

      <div {...tabPanelProps('timeline', windowId)} className="mt-3">
        {error ? (
          <ErrorState title="Couldn't load alarms" error={error} onRetry={onRetry} className="py-6" />
        ) : isLoading || !cameras ? (
          <div className="flex flex-col gap-1.5" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {cameras.map((c) => {
                const rows = inWindow.filter((i) => i.camera_id === c.id)
                return (
                  <li key={c.id} className="flex items-center" style={{ gap: COL_GAP }}>
                    <span className="shrink-0 truncate text-[13px] text-ink-2" style={{ width: NAME_COL }}>
                      {c.name}
                    </span>
                    <div
                      className="relative h-5 flex-1 rounded-md bg-field"
                      aria-label={`${c.name}: ${rows.length === 0 ? 'no alarms' : `${rows.length} incidents`}`}
                    >
                      {ticks.slice(1).map((t) => (
                        <span key={t.pct} className="absolute inset-y-0 w-px bg-line" style={{ left: `${t.pct}%` }} />
                      ))}
                      {rows.map((i) => {
                        const a = Math.max(0, (new Date(i.started_at).getTime() - start) / span) * 100
                        const b = Math.min(1, (new Date(i.ended_at).getTime() - start) / span) * 100
                        return (
                          <span
                            key={i.id}
                            title={`${typeLabel(i.type)}, ${RAISED_BY_LABELS[i.raised_by].toLowerCase()}, ${i.alarm_count} ${i.alarm_count === 1 ? 'alarm' : 'alarms'}`}
                            className="absolute inset-y-[3px] min-w-[3px] rounded-sm"
                            style={{ left: `${a}%`, width: `${Math.max(b - a, 0)}%`, background: MARKER_BG[i.raised_by] }}
                          />
                        )
                      })}
                      <span className="absolute -inset-y-0.5 right-0 w-px bg-ink" aria-hidden="true" />
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="relative mt-1.5 h-4 font-mono text-[12px] text-muted" style={{ marginLeft: NAME_COL + COL_GAP }}>
              {ticks.map((t, i) => (
                <span
                  key={t.pct}
                  className={`absolute top-0 ${i % 2 === 1 ? 'hidden sm:inline' : ''}`}
                  style={{ left: `${t.pct}%`, transform: i === 0 ? 'none' : 'translateX(-50%)' }}
                >
                  {t.label}
                </span>
              ))}
              <span className="absolute top-0 right-0 text-ink">Now</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}
