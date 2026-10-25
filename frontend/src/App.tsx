import { useState } from 'react'
import AlarmTimeline from './components/AlarmTimeline'
import CameraGrid from './components/CameraGrid'
import IncidentQueue from './components/IncidentQueue'
import PipelineStatus from './components/PipelineStatus'
import TopBar from './components/TopBar'
import { alarmTimeline, cameras, incidents as initialIncidents, liveAnomaly, REVIEW_BACKLOG } from './mock'
import type { Incident, IncidentStatus } from './types'

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents)

  const openCount = incidents.filter((i) => i.status === 'needs_review').length
  const needReview = REVIEW_BACKLOG + openCount

  const setStatus = (id: string, status: IncidentStatus) =>
    setIncidents((list) => list.map((i) => (i.id === id ? { ...i, status } : i)))

  return (
    <div className="min-h-screen bg-page text-ink">
      <TopBar needReview={needReview} />
      <PipelineStatus />
      <main className="flex flex-wrap gap-5 px-6 pb-7">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">
          <CameraGrid cameras={cameras} live={liveAnomaly} />
          <AlarmTimeline cameras={cameras} data={alarmTimeline} />
        </div>
        <div className="min-w-0 flex-[1_1_360px]">
          <IncidentQueue incidents={incidents} cameras={cameras} needReview={needReview} onSetStatus={setStatus} />
        </div>
      </main>
    </div>
  )
}
