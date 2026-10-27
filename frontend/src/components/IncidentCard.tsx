import { Play, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { TYPE_ICONS } from '../lib/classes'
import { clockTime, dayAndTime, RAISED_BY_LABELS, RAISED_BY_SWATCH, typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus } from '../types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Panel'
import { cx } from '../ui/cx'
import ScoreMeter from './ScoreMeter'
import VideoDialog from './VideoDialog'

export type Decision = Exclude<IncidentStatus, 'needs_review'>

const STATUS_TEXT: Record<Decision, string> = {
  confirmed: 'Confirmed',
  false_alarm: 'False alarm',
}

interface IncidentCardProps {
  incident: Incident
  camera: Camera | undefined
  onDecide: (incident: Incident, status: IncidentStatus) => void
  /** "This is normal": a false alarm whose clip teaches the camera's unsupervised model. */
  onNormal?: (incident: Incident) => void
  /** Show the date as well as the time (incident history). */
  showDate?: boolean
  highlighted?: boolean
  /** Fade in once: the alarm arrived while the page was open. */
  fresh?: boolean
}

function metaLine(i: Incident): string {
  const span = `${clockTime(i.started_at)} to ${clockTime(i.ended_at)}`
  return i.alarm_count === 1 ? `1 alarm, ${span}` : `${i.alarm_count} alarms merged, ${span}`
}

function Thumbnail({ incident }: { incident: Incident }) {
  const [failed, setFailed] = useState(false)
  const Icon = TYPE_ICONS[incident.type] ?? TYPE_ICONS.other
  if (incident.thumbnail_url && !failed) {
    return (
      <img
        src={incident.thumbnail_url}
        alt=""
        onError={() => setFailed(true)}
        className="h-[58px] w-[104px] shrink-0 rounded-md bg-video object-cover"
      />
    )
  }
  return (
    <div className="flex h-[58px] w-[104px] shrink-0 items-center justify-center rounded-md bg-video text-muted">
      <Icon size={18} aria-hidden="true" />
    </div>
  )
}

/** One alarm: what, where, why, both scores, and the review buttons. */
export default function IncidentCard({ incident: i, camera, onDecide, onNormal, showDate, highlighted, fresh }: IncidentCardProps) {
  const label = typeLabel(i.type)
  const decided = i.status !== 'needs_review'
  const [watching, setWatching] = useState(false)
  const unsupervisedOnly = i.raised_by === 'unsupervised'

  return (
    <Card
      id={`incident-${i.id}`}
      className={cx('flex flex-col gap-2 border border-line p-3', highlighted && 'border-unsup', fresh && 'animate-alarm-in')}
      aria-label={`${label} on ${camera?.name ?? i.camera_id}`}
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setWatching(true)}
          disabled={!i.clip_url}
          aria-label={i.clip_url ? `Play the clip of ${label}` : 'The clip is still being recorded'}
          className="shrink-0 rounded-md transition-opacity enabled:hover:opacity-85 disabled:cursor-default"
        >
          <Thumbnail incident={i} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-[15px] leading-5 font-semibold">{label}</h3>
            <time className="shrink-0 font-mono text-[12px] text-ink-2" dateTime={i.started_at}>
              {showDate ? dayAndTime(i.started_at) : clockTime(i.started_at)}
            </time>
          </div>
          <div className="truncate text-[13px] text-ink-2">
            {camera?.name ?? 'Removed camera'} <span className="font-mono text-[12px] text-muted">{i.camera_id}</span>
          </div>
          <span className="mt-1 inline-flex h-5 items-center gap-1.5 rounded-md bg-raised px-1.5 text-[12px] text-ink-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: RAISED_BY_SWATCH[i.raised_by] }} />
            {RAISED_BY_LABELS[i.raised_by]}
          </span>
        </div>
      </div>

      {i.caption && (
        <p className="truncate text-[13px] text-ink-2" title={i.caption}>
          {i.caption}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <ScoreMeter method="supervised" value={i.scores.supervised} threshold={i.thresholds.supervised} labelWidth={80} />
        <ScoreMeter method="unsupervised" value={i.scores.unsupervised} threshold={i.thresholds.unsupervised} labelWidth={80} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {decided ? (
          <>
            <span className="text-[13px] text-ink-2">{STATUS_TEXT[i.status as Decision]}</span>
            <Button size="sm" variant="ghost" icon={Undo2} onClick={() => onDecide(i, 'needs_review')}>
              Back to review
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => onDecide(i, 'confirmed')}>
              Confirm
            </Button>
            {unsupervisedOnly && onNormal ? (
              <Button
                size="sm"
                variant="secondary"
                title="False alarm; the clip is added to what this camera learned as normal"
                onClick={() => onNormal(i)}
              >
                This is normal
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => onDecide(i, 'false_alarm')}>
                False alarm
              </Button>
            )}
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Play}
          className="ml-auto"
          disabled={!i.clip_url}
          title={i.clip_url ? undefined : 'The clip is still being recorded'}
          onClick={() => setWatching(true)}
        >
          Clip
        </Button>
      </div>

      {watching && (
        <VideoDialog open onClose={() => setWatching(false)} title={`${label} on ${camera?.name ?? i.camera_id}`} description={metaLine(i)} src={i.clip_url} />
      )}
    </Card>
  )
}
