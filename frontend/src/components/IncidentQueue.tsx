import { CircleCheck, History } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Camera, Incident, RaisedBy } from '../types'
import { buttonClass } from '../ui/buttonClass'
import { Panel } from '../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { ToggleGroup } from '../ui/ToggleGroup'
import IncidentCard from './IncidentCard'
import { useIncidentDecision, useMarkNormalDecision } from './useIncidentDecision'

type Filter = 'all' | RaisedBy

interface IncidentQueueProps {
  incidents: Incident[] | undefined
  cameras: Camera[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export default function IncidentQueue({ incidents, cameras, isLoading, error, onRetry }: IncidentQueueProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const cameraById = new Map((cameras ?? []).map((c) => [c.id, c]))
  const decide = useIncidentDecision(cameraById)
  const markNormal = useMarkNormalDecision(cameraById)

  const open = (incidents ?? []).filter((i) => i.status === 'needs_review')
  const countFor = (f: Filter) => (f === 'all' ? open.length : open.filter((i) => i.raised_by === f).length)
  const visible = filter === 'all' ? open : open.filter((i) => i.raised_by === filter)

  return (
    <Panel aria-label="Incidents" className="flex flex-col">
      <div className="flex items-start justify-between gap-4 px-4 pt-4">
        <div>
          <h2 className="text-[18px] leading-6 font-semibold">Incidents</h2>
          <p className="text-[13px] text-[#FFB0A6]">{isLoading ? ' ' : `${open.length} need review`}</p>
        </div>
        <Link to="/incidents" className={buttonClass('ghost', 'sm')}>
          <History size={15} aria-hidden="true" />
          History
        </Link>
      </div>

      <div className="flex flex-col gap-2 px-4 py-4">
        <span className="text-[13px] text-muted">Raised by</span>
        <ToggleGroup
          label="Raised by"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All', count: countFor('all') },
            { id: 'both', label: 'Both', count: countFor('both') },
            { id: 'supervised', label: 'Pretrained', count: countFor('supervised') },
            { id: 'unsupervised', label: 'Scene', count: countFor('unsupervised') },
          ]}
        />
      </div>

      <div className="thin-scroll flex max-h-[620px] flex-col gap-2 overflow-y-auto px-4 pb-4">
        {error ? (
          <ErrorState title="Couldn't load incidents" error={error} onRetry={onRetry} />
        ) : isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[260px] rounded-xl" />)
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title="Nothing left to review here."
            description={
              open.length > 0
                ? 'Other filters still have incidents waiting.'
                : 'New incidents appear here as soon as a model raises them. Past decisions are in History.'
            }
          />
        ) : (
          visible.map((i) => (
            <IncidentCard
              key={i.id}
              incident={i}
              camera={cameraById.get(i.camera_id)}
              onDecide={decide}
              onNormal={markNormal}
            />
          ))
        )}
      </div>
    </Panel>
  )
}
