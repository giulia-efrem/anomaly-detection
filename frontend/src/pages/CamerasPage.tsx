import { Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCameras, useDeleteCamera, useLiveState, usePipelineStatus, useRestartCamera } from '../api/hooks'
import CameraDialog from '../components/CameraDialog'
import CameraSettingsDialog from '../components/CameraSettingsDialog'
import { NA, SOURCE_LABELS, supervisedState, unsupervisedState } from '../lib/format'
import type { Camera } from '../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { PageBar } from '../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import StatusDot from '../ui/StatusDot'
import { useToast } from '../ui/toast-context'

const STATUS: Record<Camera['status'], { label: string; color: string }> = {
  live: { label: 'Online', color: 'var(--color-ok)' },
  connecting: { label: 'Connecting', color: 'var(--color-muted)' },
  offline: { label: 'Offline', color: 'var(--color-crit)' },
}

/** Still frame refreshed every few seconds; cheaper than a stream per row. */
function Snapshot({ camera }: { camera: Camera }) {
  const [tick, setTick] = useState(0)
  const [ok, setOk] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-sm bg-video">
      {camera.status === 'live' && ok ? (
        <img
          src={`/api/cameras/${camera.id}/snapshot?t=${tick}`}
          alt=""
          onError={() => setOk(false)}
          onLoad={() => setOk(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[12px] text-muted">{NA}</span>
      )}
    </div>
  )
}

export default function CamerasPage() {
  const cameras = useCameras()
  const status = usePipelineStatus()
  const live = useLiveState()
  const remove = useDeleteCamera()
  const restart = useRestartCamera()
  const toast = useToast()
  const [editing, setEditing] = useState<Camera | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Camera | null>(null)
  const [tuningId, setTuningId] = useState<string | null>(null)
  const tuning = cameras.data?.find((c) => c.id === tuningId) ?? null

  const slots = status.data?.camera_slots
  const full = slots ? slots.used >= slots.total : false

  const confirmDelete = () => {
    if (!deleting) return
    const cam = deleting
    remove.mutate(cam.id, {
      onSuccess: () => toast({ title: `${cam.name} removed`, tone: 'success' }),
      onError: (err) => toast({ title: `${cam.name} not removed`, description: err.message, tone: 'error' }),
      onSettled: () => setDeleting(null),
    })
  }

  return (
    <>
      <PageBar
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)} disabled={full}>
            Add camera
          </Button>
        }
      >
        {slots && (
          <span className="font-mono">
            {slots.used}/{slots.total} camera slots in use
          </span>
        )}
      </PageBar>

      {cameras.error ? (
        <ErrorState title="Cameras could not be loaded" error={cameras.error} onRetry={() => cameras.refetch()} />
      ) : cameras.isLoading ? (
        <div className="flex flex-col gap-px" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[70px] rounded-none" />
          ))}
        </div>
      ) : !cameras.data?.length ? (
        <EmptyState
          title="No cameras"
          description="Add an RTSP stream or a webcam, or use a test video as a virtual camera."
          action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add camera</Button>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-[13px]">
            <thead>
              <tr className="h-8 border-b border-line text-left text-[12px] text-ink-2">
                <th className="hidden w-28 px-3 font-medium sm:table-cell"><span className="sr-only">Snapshot</span></th>
                <th className="px-3 font-medium">Camera</th>
                <th className="px-3 font-medium">Source</th>
                <th className="w-28 px-3 font-medium">Stream</th>
                <th className="w-48 px-3 font-medium">Models</th>
                <th className="w-72 px-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {cameras.data.map((c) => {
                const s = STATUS[c.status]
                return (
                  <tr key={c.id} className="border-b border-line hover:bg-raised">
                    <td className="hidden px-3 py-2 sm:table-cell"><Snapshot camera={c} /></td>
                    <td className="h-[70px] px-3 whitespace-nowrap">
                      <div className="font-medium">{c.name}</div>
                      <div className="font-mono text-[12px] text-muted">{c.id}</div>
                    </td>
                    <td className="max-w-[320px] px-3">
                      <div className="text-[12px] text-muted">{SOURCE_LABELS[c.source_type]}</div>
                      <div className="truncate font-mono text-[12px] text-ink-2" title={c.source}>{c.source}</div>
                    </td>
                    <td className="px-3">
                      <span className="flex items-center gap-1.5">
                        <StatusDot color={s.color} active={c.status === 'live'} size={6} />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 text-[12px] text-ink-2">
                      <div>Sup {supervisedState(c)}</div>
                      <div>Unsup {unsupervisedState(c, live[c.id]?.learning_progress)}</div>
                    </td>
                    <td className="px-3">
                      <div className="flex justify-end gap-1">
                        {c.status === 'offline' && (
                          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => restart.mutate(c.id)}>Retry</Button>
                        )}
                        <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => setTuningId(c.id)}>Detection</Button>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(c)}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(c)}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CameraDialog open={adding} onClose={() => setAdding(false)} />
      <CameraDialog open={!!editing} onClose={() => setEditing(null)} camera={editing ?? undefined} />
      <CameraSettingsDialog camera={tuning} onClose={() => setTuningId(null)} />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Remove ${deleting?.name ?? ''}`}
        description="The stream stops and what the camera learned is deleted. Its incidents and library video are kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} loading={remove.isPending} onClick={confirmDelete}>Remove</Button>
          </>
        }
      />
    </>
  )
}
