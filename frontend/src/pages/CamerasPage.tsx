import { Cctv, Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCameras, useDeleteCamera, usePipelineStatus, useRestartCamera } from '../api/hooks'
import CameraDialog from '../components/CameraDialog'
import CameraSettingsDialog from '../components/CameraSettingsDialog'
import { ModelDots } from '../components/CameraTile'
import { SOURCE_LABELS, supervisedChip, unsupervisedChip } from '../lib/format'
import type { Camera } from '../types'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { Dialog } from '../ui/Dialog'
import { PageHeader, Panel } from '../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { useToast } from '../ui/toast-context'

const STATUS: Record<Camera['status'], { label: string; color: string; active: boolean }> = {
  live: { label: 'Live', color: 'var(--color-healthy)', active: true },
  connecting: { label: 'Connecting', color: 'var(--color-muted)', active: false },
  offline: { label: 'Offline', color: 'var(--color-muted)', active: false },
}

/** Still frame refreshed every few seconds; cheaper than a stream per row. */
function Snapshot({ camera }: { camera: Camera }) {
  const [tick, setTick] = useState(0)
  const [ok, setOk] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000)
    return () => clearInterval(id)
  }, [])
  const live = camera.status === 'live'
  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-video sm:w-[160px]">
      {live && ok ? (
        <img
          src={`/api/cameras/${camera.id}/snapshot?t=${tick}`}
          alt=""
          onError={() => setOk(false)}
          onLoad={() => setOk(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-muted">
          <Cctv size={20} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}

export default function CamerasPage() {
  const cameras = useCameras()
  const status = usePipelineStatus()
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
      onError: (err) => toast({ title: `Couldn't remove ${cam.name}`, description: err.message, tone: 'error' }),
      onSettled: () => setDeleting(null),
    })
  }

  return (
    <>
      <PageHeader
        title="Cameras"
        description={slots ? `${slots.used} of ${slots.total} camera slots in use. Each camera streams at 12 frames per second and is analysed about 5 times a second, shared across all cameras.` : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)} disabled={full}>
            Add camera
          </Button>
        }
      />
      <div className="px-6 pb-8">
        <Panel className="p-2">
          {cameras.error ? (
            <ErrorState title="Couldn't load cameras" error={cameras.error} onRetry={() => cameras.refetch()} />
          ) : cameras.isLoading ? (
            <div className="flex flex-col gap-2 p-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[90px]" />
              ))}
            </div>
          ) : !cameras.data?.length ? (
            <EmptyState
              icon={Cctv}
              title="No cameras yet"
              description="Add an RTSP stream or webcam, or pick a test video to use as a virtual camera."
              action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add camera</Button>}
            />
          ) : (
            <ul className="flex flex-col">
              {cameras.data.map((c) => {
                const s = STATUS[c.status]
                return (
                  <li key={c.id} className="flex flex-col gap-4 rounded-lg p-2 transition-colors hover:bg-[#142133] sm:flex-row sm:items-center">
                    <Snapshot camera={c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h2 className="text-[15px] font-semibold">{c.name}</h2>
                        <span className="font-mono text-[13px] text-muted">{c.id}</span>
                      </div>
                      <p className="truncate text-[13px] text-ink-2" title={c.source}>
                        <span className="text-muted">{SOURCE_LABELS[c.source_type]}:</span> {c.source}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Chip dot={s.color} active={s.active}>{s.label}</Chip>
                        <Chip>
                          <ModelDots camera={c} live={undefined} />
                          {supervisedChip(c).label} · Unsupervised {unsupervisedChip(c).label.toLowerCase()}
                        </Chip>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {c.status === 'offline' && (
                        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => restart.mutate(c.id)}>
                          Retry
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => setTuningId(c.id)}>
                        Detection
                      </Button>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(c)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <CameraDialog open={adding} onClose={() => setAdding(false)} />
      <CameraDialog open={!!editing} onClose={() => setEditing(null)} camera={editing ?? undefined} />
      <CameraSettingsDialog camera={tuning} onClose={() => setTuningId(null)} />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Remove ${deleting?.name ?? ''}?`}
        description="The stream stops, the camera leaves the Live page and what it learned is forgotten. Its incidents and any library video stay."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="primary" icon={Trash2} loading={remove.isPending} onClick={confirmDelete}>Remove</Button>
          </>
        }
      />
    </>
  )
}
