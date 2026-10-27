import { Maximize2, Minimize2 } from 'lucide-react'
import { isSupervisedType } from '../lib/classes'
import { formatClock, NA, score, supervisedState, typeLabel, unsupervisedState } from '../lib/format'
import type { Camera, CameraLive, LiveAnomaly } from '../types'
import StatusDot from '../ui/StatusDot'
import CameraStream from './CameraStream'

const STATUS_COLOR: Record<Camera['status'], string> = {
  live: 'var(--color-ok)',
  connecting: 'var(--color-muted)',
  offline: 'var(--color-crit)',
}

interface VideoTileProps {
  camera: Camera
  live: CameraLive | undefined
  /** The anomaly above threshold on this camera right now, if any. */
  alert: LiveAnomaly | undefined
  overlay: boolean
  solo: boolean
  onToggleSolo: () => void
  /** Current time in ms (one clock for the whole wall). */
  now: number
}

/** One camera on the video wall: picture, name and time label, and a 24px info row. */
export default function VideoTile({ camera, live, alert, overlay, solo, onToggleSolo, now }: VideoTileProps) {
  // Analysis data older than 10 s is stale: show n/a rather than an old value.
  const fresh = live && camera.status === 'live' && now / 1000 - live.ts < 10
  const alertScore = alert ? (isSupervisedType(alert.type) ? alert.scores.supervised : alert.scores.unsupervised) : null

  return (
    <article
      aria-label={alert ? `${camera.name}: ${typeLabel(alert.type)}` : camera.name}
      className="group relative flex min-w-0 flex-col bg-panel"
      onDoubleClick={onToggleSolo}
    >
      <div className="relative aspect-video overflow-hidden rounded-sm bg-video">
        <CameraStream camera={camera} overlay={overlay} />
        <div className="absolute top-1 left-1 flex max-w-[calc(100%-8px)] items-center gap-2 rounded-sm bg-black/70 px-1.5 py-0.5 text-[12px]">
          <span className="truncate text-ink">{camera.name}</span>
          <span className="font-mono text-ink-2">{fresh ? formatClock(new Date(live.ts * 1000)) : NA}</span>
        </div>
        {alert && (
          <div className="absolute bottom-1 left-1 rounded-sm bg-crit px-1.5 py-0.5 text-[12px] font-medium text-white">
            {typeLabel(alert.type)} <span className="font-mono">{score(alertScore)}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleSolo}
          aria-label={solo ? `Back to the grid` : `Show ${camera.name} alone`}
          title={solo ? 'Back to the grid' : 'Show alone'}
          className="absolute right-1 bottom-1 flex h-6 w-6 items-center justify-center rounded-sm bg-black/70 text-ink-2 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
        >
          {solo ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
        </button>
      </div>
      {/* Drawn above the picture so the 2px alarm outline is never covered by the video. */}
      {alert && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 border-2 border-crit" />}
      <div className="flex h-6 items-center gap-3 overflow-hidden px-2 text-[12px] whitespace-nowrap text-ink-2">
        <span className="flex items-center gap-1.5">
          <StatusDot color={STATUS_COLOR[camera.status]} active={camera.status === 'live'} size={6} />
          <span className="sr-only">Stream {camera.status}</span>
          <span className="font-mono">{fresh ? `${live.fps.toFixed(1)} fps` : NA}</span>
        </span>
        <span className="font-mono">{fresh ? `${live.people_count} ${live.people_count === 1 ? 'person' : 'people'}` : NA}</span>
        <span className="truncate">
          Sup {supervisedState(camera)} · Unsup {unsupervisedState(camera, live?.learning_progress)}
        </span>
      </div>
    </article>
  )
}
