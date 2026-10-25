import { useState } from 'react'
import { typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus, RaisedBy } from '../types'
import { CheckIcon, HistoryIcon, XIcon } from './Icons'
import IncidentCard from './IncidentCard'

type Filter = 'all' | RaisedBy
type Decision = Exclude<IncidentStatus, 'needs_review'>

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'both', label: 'Both' },
  { key: 'supervised', label: 'Supervised' },
  { key: 'unsupervised', label: 'Unsupervised' },
]

interface IncidentQueueProps {
  incidents: Incident[]
  cameras: Camera[]
  needReview: number
  onSetStatus: (id: string, status: IncidentStatus) => void
}

export default function IncidentQueue({ incidents, cameras, needReview, onSetStatus }: IncidentQueueProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [last, setLast] = useState<{ incident: Incident; status: Decision } | null>(null)

  const cameraById = new Map(cameras.map((c) => [c.id, c]))
  const open = incidents.filter((i) => i.status === 'needs_review')
  const countFor = (f: Filter) => (f === 'all' ? open.length : open.filter((i) => i.raised_by === f).length)
  const visible = filter === 'all' ? open : open.filter((i) => i.raised_by === filter)

  const decide = (incident: Incident, status: Decision) => {
    onSetStatus(incident.id, status)
    setLast({ incident, status })
  }

  const undo = () => {
    if (!last) return
    onSetStatus(last.incident.id, 'needs_review')
    setLast(null)
  }

  return (
    <section aria-label="Incidents" className="flex flex-col rounded-xl border border-line bg-panel">
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4">
        <div>
          <h2 className="text-[18px] leading-6 font-semibold">Incidents</h2>
          <p className="text-[13px] text-[#FFB0A6]">{needReview} need review</p>
        </div>
        <a
          href="#incidents"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <HistoryIcon size={15} />
          History
        </a>
      </div>

      <div className="flex flex-col gap-2 px-[18px] pt-3.5 pb-3.5">
        <span className="text-[13px] text-muted">Raised by</span>
        <div role="group" aria-label="Raised by" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-ink text-[#0C141F]'
                    : 'border border-[#2C3F59] text-ink-2 hover:bg-[#16233A] hover:text-ink'
                }`}
              >
                {f.label}
                <span className={`font-cond ${active ? 'text-[#3A4D66]' : 'text-muted'}`}>{countFor(f.key)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {last && (
        <div
          role="status"
          className="mx-[14px] mb-3 flex items-start gap-2.5 rounded-lg border border-line-strong bg-[#13202F] px-3 py-2.5 text-[13px] text-ink-2"
        >
          <span className={`mt-0.5 shrink-0 ${last.status === 'confirmed' ? 'text-healthy' : 'text-muted'}`}>
            {last.status === 'confirmed' ? <CheckIcon size={15} /> : <XIcon size={15} />}
          </span>
          <p className="flex-1">
            {typeLabel(last.incident.type)} on {cameraById.get(last.incident.camera_id)?.name ?? last.incident.camera_id}{' '}
            {last.status === 'confirmed'
              ? 'confirmed. Saved as a labelled example for the next supervised training run.'
              : 'marked as a false alarm. Saved as a hard negative for retraining.'}
          </p>
          <button
            type="button"
            onClick={undo}
            className="shrink-0 rounded-md border border-[#2C3F59] px-2 py-0.5 text-[13px] font-medium text-ink transition-colors hover:bg-[#1B2A3F]"
          >
            Undo
          </button>
        </div>
      )}

      <div className="thin-scroll flex max-h-[620px] flex-col gap-2.5 overflow-y-auto px-[14px] pb-[14px]">
        {visible.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[#2C3F59] px-4 py-10 text-center text-[14px] text-muted">
            Nothing left to review here.
          </p>
        ) : (
          visible.map((i) => (
            <IncidentCard key={i.id} incident={i} camera={cameraById.get(i.camera_id)} onDecide={decide} />
          ))
        )}
      </div>
    </section>
  )
}
