import { useEffect, useState } from 'react'
import { CLASS_COLORS, SCENE_COLOR, TYPE_LABELS, typeColor } from '../lib/classes'
import { RAISED_BY_LABELS } from '../lib/format'
import { SUPERVISED_TYPES, type Camera, type Incident } from '../types'
import { Panel, PanelHeader } from '../ui/Panel'
import { ErrorState, Skeleton } from '../ui/States'
import { Tabs } from '../ui/Tabs'
import { tabPanelProps } from '../ui/tabPanelProps'

// One colour per pretrained class; every scene normality reason shares the scene colour.
const LEGEND: { key: string; label: string; color: string }[] = [
  ...SUPERVISED_TYPES.map((t) => ({ key: t, label: TYPE_LABELS[t], color: CLASS_COLORS[t] })),
  { key: 'scene', label: 'Scene normality', color: SCENE_COLOR },
]

type WindowId = '15m' | '1h' | '24h' | '7d'
const WINDOWS: { id: WindowId; label: string; minutes: number; phrase: string }[] = [
  { id: '15m', label: '15 min', minutes: 15, phrase: 'the last 15 minutes' },
  { id: '1h', label: '1 hour', minutes: 60, phrase: 'the last hour' },
  { id: '24h', label: '24 hours', minutes: 1440, phrase: 'the last 24 hours' },
  { id: '7d', label: '7 days', minutes: 10080, phrase: 'the last 7 days' },
]

const NAME_COL = 112
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
  const now = useNow(15000)
  const start = now - win.minutes * 60_000
  const span = now - start

  const inWindow = (incidents ?? []).filter((i) => new Date(i.ended_at).getTime() >= start)
  const totalAlarms = inWindow.reduce((n, i) => n + i.alarm_count, 0)
  const cameraCount = new Set(inWindow.map((i) => i.camera_id)).size
  const ticks = [0, 1, 2, 3].map((k) => ({ pct: (k / 3) * 100, label: tickLabel(start + (span * k) / 3, win.minutes) }))

  return (
    <Panel className="px-6 py-4">
      <PanelHeader
        title={`Alarms in ${win.phrase}`}
        description={
          isLoading ? 'Loading' : totalAlarms > 0
            ? `${totalAlarms} ${totalAlarms === 1 ? 'alarm' : 'alarms'} on ${cameraCount} ${cameraCount === 1 ? 'camera' : 'cameras'}`
            : 'No alarms in this window. Pick a longer window to see older incidents.'
        }
        actions={<Tabs items={WINDOWS} value={windowId} onChange={setWindowId} label="Time window" idBase="timeline" />}
      />

      <ul className="mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label="Legend">
        {LEGEND.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: l.color }} />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-muted ring-[1.5px] ring-ink" />
          Raised by both models
        </li>
      </ul>

      <div {...tabPanelProps('timeline', windowId)}>
        {error ? (
          <ErrorState title="Couldn't load alarms" error={error} onRetry={onRetry} className="py-6" />
        ) : isLoading || !cameras ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {cameras.map((c) => {
                const rows = inWindow.filter((i) => i.camera_id === c.id)
                return (
                  <li key={c.id} className="flex items-center" style={{ gap: COL_GAP }}>
                    <span className="shrink-0 truncate text-[13px] text-ink-2" style={{ width: NAME_COL }}>
                      {c.name}
                    </span>
                    <div
                      className="relative h-5 flex-1 overflow-hidden rounded bg-[#0D1622]"
                      aria-label={`${c.name}: ${rows.length === 0 ? 'no alarms' : `${rows.length} incidents`}`}
                    >
                      {ticks.slice(1, -1).map((t) => (
                        <span key={t.pct} className="absolute inset-y-0 w-px bg-[#16233A]" style={{ left: `${t.pct}%` }} />
                      ))}
                      {rows.map((i) => {
                        const a = Math.max(0, (new Date(i.started_at).getTime() - start) / span) * 100
                        const b = Math.min(1, (new Date(i.ended_at).getTime() - start) / span) * 100
                        return (
                          <span
                            key={i.id}
                            title={`${TYPE_LABELS[i.type]}, ${RAISED_BY_LABELS[i.raised_by].toLowerCase()}, ${i.alarm_count} ${i.alarm_count === 1 ? 'alarm' : 'alarms'}`}
                            className={`absolute inset-y-[3px] min-w-[5px] rounded-[2px] ${i.raised_by === 'both' ? 'ring-[1.5px] ring-ink' : ''}`}
                            style={{ left: `${a}%`, width: `${Math.max(b - a, 0)}%`, background: typeColor(i.type) }}
                          />
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="relative mt-2 h-4 font-cond text-[12px] text-muted" style={{ marginLeft: NAME_COL + COL_GAP }}>
              {ticks.map((t, i) => (
                <span
                  key={t.pct}
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
          </>
        )}
      </div>
    </Panel>
  )
}
