import { Activity, Footprints, Play, Swords, Undo2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { clockTime, dayAndTime, RAISED_BY_LABELS, typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus, IncidentType } from '../types'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { Card } from '../ui/Panel'
import { cx } from '../ui/cx'
import ScoreMeter from './ScoreMeter'
import VideoDialog from './VideoDialog'

export type Decision = Exclude<IncidentStatus, 'needs_review'>

const TYPE_ICONS: Record<IncidentType, LucideIcon> = {
  fight: Swords,
  fall: Footprints,
  unusual_posture: Activity,
  other: Activity,
}

const STATUS_TEXT: Record<Decision, string> = {
  confirmed: 'Confirmed',
  false_alarm: 'Marked as false alarm',
}

interface IncidentCardProps {
  incident: Incident
  camera: Camera | undefined
  onDecide: (incident: Incident, status: IncidentStatus) => void
  /** Show the date as well as the time (incident history). */
  showDate?: boolean
  highlighted?: boolean
}

function metaLine(i: Incident): string {
  const span = `${clockTime(i.started_at)} to ${clockTime(i.ended_at)}`
  return i.alarm_count === 1 ? `1 alarm, ${span}` : `${i.alarm_count} alarms merged, ${span}`
}

export default function IncidentCard({ incident, camera, onDecide, showDate, highlighted }: IncidentCardProps) {
  const label = typeLabel(incident.type)
  const Icon = TYPE_ICONS[incident.type]
  const decided = incident.status !== 'needs_review'
  const [watching, setWatching] = useState(false)

  return (
    <Card
      id={`incident-${incident.id}`}
      className={cx('flex flex-col gap-3 p-4', highlighted && 'ring-2 ring-unsup')}
      aria-label={`${label} on ${camera?.name ?? incident.camera_id}`}
    >
      <div className="flex gap-3">
        <div className="flex h-[63px] w-[112px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-video text-muted">
          <Icon size={20} aria-hidden="true" />
          <span className="font-cond text-[11px]">No clip yet</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-[16px] leading-6 font-semibold">{label}</h3>
            <time className="shrink-0 font-cond text-[13px] text-muted">
              {showDate ? dayAndTime(incident.ended_at) : clockTime(incident.ended_at)}
            </time>
          </div>
          <div className="truncate text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{camera?.name ?? 'Removed camera'}</span>{' '}
            <span className="font-cond text-muted">{incident.camera_id}</span>
          </div>
          <Chip className="mt-2">{RAISED_BY_LABELS[incident.raised_by]}</Chip>
        </div>
      </div>

      {incident.caption && <p className="text-[14px] leading-[1.45] text-[#D2DCE7]">{incident.caption}</p>}

      <div className="flex flex-col gap-2">
        <ScoreMeter
          method="supervised"
          value={incident.scores.supervised}
          threshold={incident.thresholds.supervised}
          suffix={incident.type === 'fight' || incident.type === 'fall' ? incident.type : undefined}
        />
        <ScoreMeter
          method="unsupervised"
          value={incident.scores.unsupervised}
          threshold={incident.thresholds.unsupervised}
          suffix="anomaly"
        />
      </div>

      <p className="text-[12px] text-muted">{metaLine(incident)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {decided ? (
          <>
            <span className="text-[13px] text-ink-2">{STATUS_TEXT[incident.status as Decision]}</span>
            <Button size="sm" variant="ghost" icon={Undo2} onClick={() => onDecide(incident, 'needs_review')}>
              Back to review
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => onDecide(incident, 'confirmed')}>
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onDecide(incident, 'false_alarm')}>
              False alarm
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Play}
          className="ml-auto"
          disabled={!incident.clip_url}
          title={incident.clip_url ? undefined : 'Clips are recorded once detection runs (step 3)'}
          onClick={() => setWatching(true)}
        >
          Watch clip
        </Button>
      </div>

      {watching && (
        <VideoDialog
          open
          onClose={() => setWatching(false)}
          title={`${label} on ${camera?.name ?? incident.camera_id}`}
          description={metaLine(incident)}
          src={incident.clip_url}
        />
      )}
    </Card>
  )
}
