import { Inbox } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCameras, useIncidents } from '../api/hooks'
import IncidentCard from '../components/IncidentCard'
import { useIncidentDecision, useMarkNormalDecision } from '../components/useIncidentDecision'
import { TYPE_LABELS } from '../lib/classes'
import { SUPERVISED_TYPES, UNSUPERVISED_TYPES, type IncidentStatus, type IncidentType, type RaisedBy } from '../types'
import { Select } from '../ui/Field'
import { PageHeader, Panel } from '../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { Tabs } from '../ui/Tabs'
import { tabPanelProps } from '../ui/tabPanelProps'
import { ToggleGroup } from '../ui/ToggleGroup'

type StatusTab = IncidentStatus | 'all'

const EMPTY_TEXT: Record<StatusTab, string> = {
  needs_review: 'Nothing waiting for review. New incidents land here as soon as a model raises them.',
  confirmed: 'No confirmed incidents yet. Confirm an incident to save it as a labelled training example.',
  false_alarm: 'No false alarms yet. Rejected incidents are kept here as hard negatives for retraining.',
  all: 'No incidents yet. They appear as soon as a model raises an alarm on one of your cameras.',
}

export default function IncidentsPage() {
  const incidents = useIncidents()
  const cameras = useCameras()
  const [params] = useSearchParams()
  const focus = params.get('focus')
  const [tab, setTab] = useState<StatusTab>('needs_review')
  const [raisedBy, setRaisedBy] = useState<'all' | RaisedBy>('all')
  const [type, setType] = useState<'all' | IncidentType>('all')

  const cameraById = new Map((cameras.data ?? []).map((c) => [c.id, c]))
  const decide = useIncidentDecision(cameraById)
  const markNormal = useMarkNormalDecision(cameraById)
  const all = incidents.data ?? []
  const byStatus = (s: StatusTab) => (s === 'all' ? all : all.filter((i) => i.status === s))
  const inTab = byStatus(tab)
  const visible = inTab.filter((i) => (raisedBy === 'all' || i.raised_by === raisedBy) && (type === 'all' || i.type === type))

  useEffect(() => {
    if (focus) document.getElementById(`incident-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, incidents.data])

  const tabs = [
    { id: 'needs_review' as const, label: 'Needs review', count: byStatus('needs_review').length },
    { id: 'confirmed' as const, label: 'Confirmed', count: byStatus('confirmed').length },
    { id: 'false_alarm' as const, label: 'False alarms', count: byStatus('false_alarm').length },
    { id: 'all' as const, label: 'All', count: all.length },
  ]

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Every alarm the models raised, merged into incidents. Your decisions become training data: confirmed incidents are labelled examples, false alarms are hard negatives."
      />
      <div className="flex flex-col gap-4 px-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Tabs items={tabs} value={tab} onChange={setTab} label="Incident status" idBase="incidents" />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="incident-type" className="sr-only">
              Class
            </label>
            <Select id="incident-type" value={type} onChange={(e) => setType(e.target.value as 'all' | IncidentType)} className="h-8 w-[200px] text-[13px]">
              <option value="all">Any class</option>
              <optgroup label="Pretrained models">
                {SUPERVISED_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </optgroup>
              <optgroup label="Scene normality">
                {UNSUPERVISED_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </optgroup>
            </Select>
            <ToggleGroup
              label="Raised by"
              value={raisedBy}
              onChange={setRaisedBy}
              options={[
                { id: 'all', label: 'Any model' },
                { id: 'both', label: 'Both' },
                { id: 'supervised', label: 'Pretrained' },
                { id: 'unsupervised', label: 'Scene' },
              ]}
            />
          </div>
        </div>

        <div {...tabPanelProps('incidents', tab)}>
          {incidents.error ? (
            <Panel>
              <ErrorState title="Couldn't load incidents" error={incidents.error} onRetry={() => incidents.refetch()} />
            </Panel>
          ) : incidents.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[264px] rounded-xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Inbox}
                title={inTab.length > 0 ? 'No incidents match this filter' : 'Nothing here yet'}
                description={inTab.length > 0 ? 'Choose "Any class" and "Any model" to see them all.' : EMPTY_TEXT[tab]}
              />
            </Panel>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((i) => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  camera={cameraById.get(i.camera_id)}
                  onDecide={decide}
                  onNormal={markNormal}
                  showDate
                  highlighted={i.id === focus}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
