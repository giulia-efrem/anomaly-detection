import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { SUPERVISED_TYPES, type Camera, type CameraLive, type Catalog, type Incident, type LibraryJob, type NormalityJob, type ScorePoint, type StreamStatus } from '../types'

const HISTORY_MS = 60_000
import { keys } from './hooks'

type LiveEvent =
  | { type: 'hello' }
  | { type: 'camera.status'; camera_id: string; status: StreamStatus }
  | { type: 'cameras.changed' }
  | { type: 'incident.created'; incident: Incident }
  | { type: 'incident.updated'; incident: Incident }
  | ({ type: 'camera.live' } & CameraLive)
  | { type: 'normality.job'; job: NormalityJob }
  | { type: 'library.job'; job: LibraryJob }
  | { type: 'library.changed' }

function apply(qc: QueryClient, e: LiveEvent) {
  switch (e.type) {
    case 'hello':
      // (Re)connected: anything may have changed while we were away.
      qc.invalidateQueries()
      break
    case 'camera.status':
      qc.setQueryData<Camera[]>(keys.cameras, (list) =>
        list?.map((c) => (c.id === e.camera_id ? { ...c, status: e.status } : c)),
      )
      qc.invalidateQueries({ queryKey: keys.status })
      break
    case 'cameras.changed':
      qc.invalidateQueries({ queryKey: keys.cameras })
      qc.invalidateQueries({ queryKey: keys.status })
      break
    case 'incident.created':
    case 'incident.updated': {
      const inc = e.incident
      qc.setQueryData<Incident[]>(keys.incidents, (list) => {
        if (!list) return list
        return list.some((i) => i.id === inc.id) ? list.map((i) => (i.id === inc.id ? inc : i)) : [inc, ...list]
      })
      if (e.type === 'incident.created') qc.invalidateQueries({ queryKey: keys.cameras })
      break
    }
    case 'camera.live': {
      const { type: _type, ...state } = e
      qc.setQueryData<Record<string, CameraLive>>(keys.live, (m) => ({ ...m, [state.camera_id]: state }))
      // Score history for the sparklines: the best supervised class (with its threshold) and the unsupervised score.
      const cam = qc.getQueryData<Camera[]>(keys.cameras)?.find((c) => c.id === state.camera_id)
      if (cam) {
        const best = SUPERVISED_TYPES.reduce((a, b) => (state.scores[b] / cam.thresholds[b] > state.scores[a] / cam.thresholds[a] ? b : a))
        const now = Date.now()
        const point: ScorePoint = {
          t: now,
          sup: state.scores[best],
          supThr: cam.thresholds[best],
          unsup: state.unsupervised.score,
          unsupThr: cam.thresholds.unsupervised,
        }
        qc.setQueryData<Record<string, ScorePoint[]>>(keys.history, (m) => ({
          ...m,
          [state.camera_id]: [...(m?.[state.camera_id] ?? []).filter((p) => now - p.t <= HISTORY_MS), point],
        }))
      }
      // Keep the stored learning state honest without refetching every second.
      qc.setQueryData<Camera[]>(keys.cameras, (list) =>
        list?.map((c) =>
          c.id === state.camera_id && c.people_count !== state.people_count ? { ...c, people_count: state.people_count } : c,
        ),
      )
      break
    }
    case 'normality.job':
      qc.setQueryData<Record<string, NormalityJob>>(keys.normalityJobs, (m) => ({ ...m, [e.job.camera_id]: e.job }))
      if (e.job.stage === 'done' || e.job.stage === 'error') {
        qc.invalidateQueries({ queryKey: keys.normality(e.job.camera_id) })
      }
      break
    case 'library.job': {
      const job = e.job
      qc.setQueryData<LibraryJob[]>(keys.jobs, (list) => {
        if (!list) return [job]
        return list.some((j) => j.id === job.id) ? list.map((j) => (j.id === job.id ? job : j)) : [job, ...list]
      })
      if (job.dataset_id) {
        qc.setQueryData<Catalog>(keys.catalog, (cat) =>
          cat && { ...cat, datasets: cat.datasets.map((d) => (d.id === job.dataset_id ? { ...d, job } : d)) },
        )
      }
      break
    }
    case 'library.changed':
      qc.invalidateQueries({ queryKey: keys.library })
      qc.invalidateQueries({ queryKey: keys.catalog })
      break
  }
}

/** Keeps the query cache in sync with the backend's /ws events. Reconnects with backoff. */
export function useLiveUpdates(): boolean {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const open = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}/ws`)
      ws.onopen = () => {
        retry = 0
        setConnected(true)
      }
      ws.onmessage = (msg) => {
        try {
          apply(qc, JSON.parse(msg.data) as LiveEvent)
        } catch {
          // ignore malformed events
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (closed) return
        timer = setTimeout(open, Math.min(1000 * 2 ** retry++, 15000))
      }
    }

    open()
    return () => {
      closed = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [qc])

  return connected
}
