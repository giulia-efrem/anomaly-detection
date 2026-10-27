import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCameras, useIncidents, useLiveState, usePipelineStatus, useScoreHistory } from '../api/hooks'
import AlarmTimeline from '../components/AlarmTimeline'
import CameraDialog from '../components/CameraDialog'
import CameraGrid from '../components/CameraGrid'
import IncidentQueue from '../components/IncidentQueue'
import PipelineStatus from '../components/PipelineStatus'
import { liveAnomalies } from '../lib/live'

/** One clock for every sparkline, so the 60 s windows scroll together. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export default function LivePage() {
  const cameras = useCameras()
  const incidents = useIncidents()
  const status = usePipelineStatus()
  const history = useScoreHistory()
  const now = useNow(1000)
  const [params, setParams] = useSearchParams()
  const focusId = params.get('camera')
  const [adding, setAdding] = useState(false)
  const anomalies = liveAnomalies(cameras.data, useLiveState())

  const slots = status.data?.camera_slots
  const slotsLeft = slots ? slots.total - slots.used : 0
  const setFocus = (id: string) => setParams({ camera: id }, { replace: true })

  return (
    <>
      <PipelineStatus onAddCamera={() => setAdding(true)} />
      <div className="flex flex-wrap gap-4 px-6 pb-8">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
          <CameraGrid
            cameras={cameras.data}
            isLoading={cameras.isLoading}
            error={cameras.error}
            onRetry={() => cameras.refetch()}
            live={anomalies[0] ?? null}
            alarmIds={new Set(anomalies.map((a) => a.camera_id))}
            history={history}
            now={now}
            focusId={focusId}
            onFocus={setFocus}
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
