import { Link } from 'react-router'
import { clockTime, typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus } from '../types'
import { Button } from '../ui/Button'
import { Count } from '../ui/Chip'
import { ErrorState, Skeleton } from '../ui/States'
import { cx } from '../ui/cx'
import ScoreBar from './ScoreBar'
import SeverityIcon from './SeverityIcon'

interface AlarmQueueProps {
  incidents: Incident[] | undefined
  cameraById: Map<string, Camera>
  isLoading: boolean
  error: unknown
  onRetry: () => void
  onOpen: (incident: Incident) => void
  onDecide: (incident: Incident, status: IncidentStatus) => void
  className?: string
}

/** Open alarms, newest first. One dense row each; the thumbnail shows on hover or focus. */
export default function AlarmQueue({ incidents, cameraById, isLoading, error, onRetry, onOpen, onDecide, className }: AlarmQueueProps) {
  const open = (incidents ?? [])
    .filter((i) => i.status === 'needs_review')
    .sort((a, b) => b.started_at.localeCompare(a.started_at))

  return (
    <aside aria-label="Open alarms" className={cx('flex min-h-0 flex-col bg-panel', className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-[13px] font-semibold">Open alarms</h2>
        {!isLoading && !error && <Count>{open.length}</Count>}
        <Link to="/incidents" className="ml-auto text-[12px] text-ink-2 hover:text-ink">
          All incidents
        </Link>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <ErrorState title="Alarms could not be loaded" error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <div className="flex flex-col gap-px" aria-busy="true">
            {Array.from({ length: 6 }, (_, k) => (
              <Skeleton key={k} className="h-[52px] rounded-none" />
            ))}
          </div>
        ) : open.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-muted">No open alarms</p>
        ) : (
          <ul>
            {open.map((i) => (
              <AlarmRow key={i.id} incident={i} camera={cameraById.get(i.camera_id)} onOpen={onOpen} onDecide={onDecide} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

interface AlarmRowProps {
  incident: Incident
  camera: Camera | undefined
  onOpen: (incident: Incident) => void
  onDecide: (incident: Incident, status: IncidentStatus) => void
}

function AlarmRow({ incident: i, camera, onOpen, onDecide }: AlarmRowProps) {
  return (
    <li className="group relative border-b border-line px-3 py-1.5 hover:bg-raised focus-within:bg-raised">
      <div className="flex h-5 items-center gap-2">
        <SeverityIcon severity={i.severity} />
        <button
          type="button"
          onClick={() => onOpen(i)}
          className="min-w-0 truncate text-left text-[13px] font-medium hover:underline focus-visible:underline"
          title="Open details"
        >
          {typeLabel(i.type)}
        </button>
        <span className="min-w-0 truncate text-[12px] text-ink-2">{camera?.name ?? `${i.camera_id} (removed)`}</span>
        <time className="ml-auto shrink-0 font-mono text-[12px] text-ink-2" dateTime={i.started_at}>
          {clockTime(i.started_at)}
        </time>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <ScoreBar method="supervised" value={i.scores.supervised} threshold={i.thresholds.supervised} width={28} label />
        <ScoreBar method="unsupervised" value={i.scores.unsupervised} threshold={i.thresholds.unsupervised} width={28} label />
        <span className="ml-auto flex shrink-0 gap-1">
          <Button size="sm" onClick={() => onDecide(i, 'confirmed')}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide(i, 'false_alarm')}>
            False alarm
          </Button>
        </span>
      </div>
      {i.thumbnail_url && (
        <img
          src={i.thumbnail_url}
          alt=""
          loading="lazy"
          className="pointer-events-none absolute top-0 right-full z-20 mr-1 hidden w-60 rounded-sm border border-line bg-video group-focus-within:block group-hover:block"
        />
      )}
    </li>
  )
}
