import { clockTime, RAISED_BY_LABELS, typeLabel } from '../lib/format'
import { incidentScenes } from '../mock/scenes'
import type { Camera, Incident, IncidentStatus } from '../types'
import { PlayIcon } from './Icons'
import Scene from './Scene'
import ScoreMeter from './ScoreMeter'

interface IncidentCardProps {
  incident: Incident
  camera: Camera | undefined
  onDecide: (incident: Incident, status: Exclude<IncidentStatus, 'needs_review'>) => void
}

function metaLine(i: Incident): string {
  const span = `${clockTime(i.started_at)} to ${clockTime(i.ended_at)}`
  return i.alarm_count === 1 ? `1 alarm, ${span}` : `${i.alarm_count} alarms merged, ${span}`
}

export default function IncidentCard({ incident, camera, onDecide }: IncidentCardProps) {
  const scene = incidentScenes[incident.id]
  const label = typeLabel(incident.type)

  return (
    <article
      id={`incident-${incident.id}`}
      className="flex flex-col gap-3 rounded-[10px] border border-[#22344C] bg-card p-[14px]"
    >
      <div className="flex gap-3">
        <div className="h-[63px] w-[112px] shrink-0 overflow-hidden rounded-md border border-[#22344C] bg-video">
          {scene && <Scene scene={scene} className="h-full w-full" strokeWidth={1.1} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-[16px] leading-5 font-bold">{label}</h3>
            <time className="shrink-0 font-cond text-[13px] text-muted">{clockTime(incident.ended_at)}</time>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{camera?.name ?? incident.camera_id}</span>{' '}
            <span className="font-cond text-muted">{incident.camera_id}</span>
          </div>
          <span className="mt-1.5 inline-flex h-[22px] items-center rounded-md border border-[#2C3F59] px-2 font-cond text-[12px] text-ink-2">
            {RAISED_BY_LABELS[incident.raised_by]}
          </span>
        </div>
      </div>

      {incident.caption && <p className="text-[14px] leading-[1.45] text-[#D2DCE7]">{incident.caption}</p>}

      <div className="flex flex-col gap-2">
        <ScoreMeter
          method="supervised"
          value={incident.scores.supervised}
          threshold={incident.thresholds.supervised}
          suffix={incident.type === 'unusual_posture' || incident.type === 'other' ? undefined : incident.type}
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
        <button
          type="button"
          onClick={() => onDecide(incident, 'confirmed')}
          className="inline-flex h-[34px] items-center rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-[#0C141F] transition-colors hover:bg-white"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => onDecide(incident, 'false_alarm')}
          className="inline-flex h-[34px] items-center rounded-lg border border-[#2C3F59] px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-[#1B2A3F]"
        >
          False alarm
        </button>
        <a
          href={incident.clip_url ?? undefined}
          onClick={(e) => e.preventDefault()}
          aria-disabled={incident.clip_url === null}
          className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <PlayIcon size={14} />
          Watch clip
        </a>
      </div>
    </article>
  )
}
