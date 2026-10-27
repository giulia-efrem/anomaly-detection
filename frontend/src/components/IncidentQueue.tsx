import { CircleCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useMarkNormal, useSetIncidentStatus } from '../api/hooks'
import { typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus, RaisedBy } from '../types'
import { Pill } from '../ui/Chip'
import { Panel } from '../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { ToggleGroup } from '../ui/ToggleGroup'
import { useToast } from '../ui/toast-context'
import IncidentCard from './IncidentCard'

type Filter = 'all' | RaisedBy

/** A decision just taken here: shown as one line with Undo in place of the card. */
interface Recent {
  incident: Incident
  text: string
  at: number
}

const RECENT_MS = 10_000

interface IncidentQueueProps {
  incidents: Incident[] | undefined
  cameras: Camera[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export default function IncidentQueue({ incidents, cameras, isLoading, error, onRetry }: IncidentQueueProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [recent, setRecent] = useState<Recent[]>([])
  const setStatus = useSetIncidentStatus()
  const markNormal = useMarkNormal()
  const toast = useToast()
  const cameraById = new Map((cameras ?? []).map((c) => [c.id, c]))

  // Alarms present at first load do not animate; later ones fade in once.
  const [known, setKnown] = useState<Set<string> | null>(null)
  if (known === null && incidents) setKnown(new Set(incidents.map((i) => i.id)))

  // Status lines disappear after a few seconds.
  useEffect(() => {
    if (!recent.length) return
    const id = setTimeout(() => setRecent((r) => r.filter((x) => Date.now() - x.at < RECENT_MS)), 1000)
    return () => clearTimeout(id)
  }, [recent])

  const open = (incidents ?? []).filter((i) => i.status === 'needs_review')
  const countFor = (f: Filter) => (f === 'all' ? open.length : open.filter((i) => i.raised_by === f).length)
  const visible = filter === 'all' ? open : open.filter((i) => i.raised_by === filter)

  const where = (i: Incident) => cameraById.get(i.camera_id)?.name ?? i.camera_id
  const fail = (err: Error) => toast({ title: "Couldn't save the decision", description: err.message, tone: 'error' })

  const decide = (i: Incident, status: IncidentStatus) => {
    setStatus.mutate(
      { id: i.id, status },
      {
        onSuccess: () => {
          const text = status === 'confirmed' ? 'confirmed' : 'marked as false alarm'
          setRecent((r) => [{ incident: i, text: `${typeLabel(i.type)} on ${where(i)} ${text}`, at: Date.now() }, ...r])
        },
        onError: fail,
      },
    )
  }
  const normal = (i: Incident) =>
    markNormal.mutate(i.id, {
      onSuccess: () =>
        setRecent((r) => [{ incident: i, text: `${typeLabel(i.type)} on ${where(i)} marked as normal`, at: Date.now() }, ...r]),
      onError: fail,
    })
  const undo = (x: Recent) =>
    setStatus.mutate(
      { id: x.incident.id, status: 'needs_review' },
      { onSuccess: () => setRecent((r) => r.filter((y) => y !== x)), onError: fail },
    )

  return (
    <Panel aria-label="Alarms" className="flex flex-col border border-line">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] leading-6 font-semibold">Alarms</h2>
          {!isLoading && !error && <Pill>{open.length}</Pill>}
        </div>
        <Link to="/incidents" className="text-[13px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          View all
        </Link>
      </div>

      <div className="px-4 pt-3">
        <ToggleGroup
          label="Raised by"
          value={filter}
          onChange={setFilter}
          className="w-full"
          options={[
            { id: 'all', label: 'All', count: countFor('all') },
            { id: 'both', label: 'Both', count: countFor('both') },
            { id: 'supervised', label: 'Supervised', count: countFor('supervised') },
            { id: 'unsupervised', label: 'Unsup.', count: countFor('unsupervised') },
          ]}
        />
      </div>

      <div className="thin-scroll flex max-h-[760px] flex-col gap-2 overflow-y-auto p-4">
        {recent.map((x) => (
          <div
            key={`${x.incident.id}-${x.at}`}
            role="status"
            className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-[13px] text-ink-2"
          >
            <CircleCheck size={14} className="shrink-0 text-healthy" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{x.text}</span>
            <button type="button" onClick={() => undo(x)} className="shrink-0 font-semibold text-ink hover:underline">
              Undo
            </button>
          </div>
        ))}
        {error ? (
          <ErrorState title="Couldn't load alarms" error={error} onRetry={onRetry} />
        ) : isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[196px] rounded-xl" />)
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title="No open alarms"
            description={open.length > 0 ? 'Other filters still have alarms to review.' : 'New alarms appear here as soon as a model raises them.'}
          />
        ) : (
          visible.map((i) => (
            <IncidentCard
              key={i.id}
              incident={i}
              camera={cameraById.get(i.camera_id)}
              onDecide={decide}
              onNormal={normal}
              fresh={!!known && !known.has(i.id)}
            />
          ))
        )}
      </div>
    </Panel>
  )
}
