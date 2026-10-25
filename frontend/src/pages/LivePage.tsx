import { useState } from 'react'
import { useCameras, useIncidents, usePipelineStatus } from '../api/hooks'
import AlarmTimeline from '../components/AlarmTimeline'
import CameraDialog from '../components/CameraDialog'
import CameraGrid from '../components/CameraGrid'
import IncidentQueue from '../components/IncidentQueue'
import PipelineStatus from '../components/PipelineStatus'

export default function LivePage() {
  const cameras = useCameras()
  const incidents = useIncidents()
  const status = usePipelineStatus()
  const [focusId, setFocusId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const slots = status.data?.camera_slots
  const slotsLeft = slots ? slots.total - slots.used : 0

  return (
    <>
      <PipelineStatus onAddCamera={() => setAdding(true)} />
      <div className="flex flex-wrap gap-6 px-6 pb-8">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <CameraGrid
            cameras={cameras.data}
            isLoading={cameras.isLoading}
            error={cameras.error}
            onRetry={() => cameras.refetch()}
            live={null /* live anomalies arrive with detection in step 3 */}
            focusId={focusId}
            onFocus={setFocusId}
            slotsLeft={slotsLeft}
            onAddCamera={() => setAdding(true)}
          />
          <AlarmTimeline
            cameras={cameras.data}
            incidents={incidents.data}
            isLoading={cameras.isLoading || incidents.isLoading}
            error={cameras.error ?? incidents.error}
            onRetry={() => {
              cameras.refetch()
              incidents.refetch()
            }}
          />
        </div>
        <div className="min-w-0 flex-[1_1_360px]">
          <IncidentQueue
            incidents={incidents.data}
            cameras={cameras.data}
            isLoading={incidents.isLoading}
            error={incidents.error}
            onRetry={() => incidents.refetch()}
          />
        </div>
      </div>
      <CameraDialog open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
