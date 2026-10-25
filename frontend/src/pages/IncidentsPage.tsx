import { Inbox } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCameras, useIncidents } from '../api/hooks'
import IncidentCard from '../components/IncidentCard'
import { useIncidentDecision } from '../components/useIncidentDecision'
import type { IncidentStatus, RaisedBy } from '../types'
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
  all: 'No incidents yet. They appear once detection runs on your cameras (step 3).',
}

export default function IncidentsPage() {
  const incidents = useIncidents()
  const cameras = useCameras()
  const [params] = useSearchParams()
  const focus = params.get('focus')
  const [tab, setTab] = useState<StatusTab>('needs_review')
  const [raisedBy, setRaisedBy] = useState<'all' | RaisedBy>('all')

  const cameraById = new Map((cameras.data ?? []).map((c) => [c.id, c]))
  const decide = useIncidentDecision(cameraById)
  const all = incidents.data ?? []
  const byStatus = (s: StatusTab) => (s === 'all' ? all : all.filter((i) => i.status === s))
  const inTab = byStatus(tab)
  const visible = raisedBy === 'all' ? inTab : inTab.filter((i) => i.raised_by === raisedBy)

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
          <ToggleGroup
            label="Raised by"
            value={raisedBy}
            onChange={setRaisedBy}
            options={[
              { id: 'all', label: 'Any model' },
              { id: 'both', label: 'Both' },
              { id: 'supervised', label: 'Supervised' },
              { id: 'unsupervised', label: 'Unsupervised' },
            ]}
          />
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
                description={inTab.length > 0 ? 'Choose "Any model" to see them all.' : EMPTY_TEXT[tab]}
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
