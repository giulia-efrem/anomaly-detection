import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Camera, Catalog, Incident, LibraryJob, StreamStatus } from '../types'
import { keys } from './hooks'

type LiveEvent =
  | { type: 'hello' }
  | { type: 'camera.status'; camera_id: string; status: StreamStatus }
  | { type: 'cameras.changed' }
  | { type: 'incident.updated'; incident: Incident }
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
    case 'incident.updated':
      qc.setQueryData<Incident[]>(keys.incidents, (list) =>
        list?.map((i) => (i.id === e.incident.id ? e.incident : i)),
      )
      qc.invalidateQueries({ queryKey: keys.cameras })
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
