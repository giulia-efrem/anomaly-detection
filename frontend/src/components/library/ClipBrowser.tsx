import { Cctv, Film, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDeleteVideo, useLibrary } from '../../api/hooks'
import { formatDuration } from '../../lib/format'
import type { LibraryVideo } from '../../types'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { Dialog } from '../../ui/Dialog'
import { Select } from '../../ui/Field'
import { Card, Panel } from '../../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../../ui/States'
import { useToast } from '../../ui/toast-context'
import VideoDialog from '../VideoDialog'

const PAGE = 48

interface ClipBrowserProps {
  typeLabels: Record<string, string>
  dataset: string
  onDatasetChange: (id: string) => void
  onUseAsCamera: (video: LibraryVideo) => void
  slotsLeft: number
  onGoToDatasets: () => void
}

export default function ClipBrowser({ typeLabels, dataset, onDatasetChange, onUseAsCamera, slotsLeft, onGoToDatasets }: ClipBrowserProps) {
  const library = useLibrary()
  const remove = useDeleteVideo()
  const toast = useToast()
  const [type, setType] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [playing, setPlaying] = useState<LibraryVideo | null>(null)
  const [deleting, setDeleting] = useState<LibraryVideo | null>(null)

  if (library.error) {
    return (
      <Panel>
        <ErrorState title="Couldn't load the library" error={library.error} onRetry={() => library.refetch()} />
      </Panel>
    )
  }

  const all = library.data ?? []
  const datasets = [...new Map(all.map((v) => [v.dataset_id ?? '', v.dataset_name ?? 'Other'])).entries()]
  const types = [...new Set(all.flatMap((v) => v.anomaly_types))].sort()
  // Joined reels first within the list: they make the best virtual cameras.
  const filtered = all
    .filter((v) => (!dataset || v.dataset_id === dataset) && (!type || v.anomaly_types.includes(type)))
    .sort((a, b) => Number(b.origin === 'reel') - Number(a.origin === 'reel'))
  const visible = filtered.slice(0, shown)

  const confirmDelete = () => {
    if (!deleting) return
    const v = deleting
    remove.mutate(v.id, {
      onSuccess: () => toast({ title: `${v.title} deleted`, tone: 'success' }),
      onError: (err) => toast({ title: `Couldn't delete ${v.title}`, description: err.message, tone: 'error' }),
      onSettled: () => setDeleting(null),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex w-full flex-col gap-2 sm:w-64">
          <span className="text-[13px] font-semibold text-ink-2">Dataset</span>
          <Select value={dataset} onChange={(e) => { onDatasetChange(e.target.value); setShown(PAGE) }}>
            <option value="">All datasets</option>
            {datasets.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>
        </label>
        <label className="flex w-full flex-col gap-2 sm:w-52">
          <span className="text-[13px] font-semibold text-ink-2">Anomaly type</span>
          <Select value={type} onChange={(e) => { setType(e.target.value); setShown(PAGE) }}>
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{typeLabels[t] ?? t}</option>
            ))}
          </Select>
        </label>
        {!library.isLoading && (
          <p className="pb-2 text-[13px] text-muted" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? 'clip' : 'clips'}
          </p>
        )}
      </div>

      {library.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[248px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Panel>
          {all.length === 0 ? (
            <EmptyState
              icon={Film}
              title="The library is empty"
              description="Download a dataset or add your own video. Clips are converted to H.264 and get a thumbnail."
              action={<Button size="sm" variant="primary" onClick={onGoToDatasets}>Browse datasets</Button>}
            />
          ) : (
            <EmptyState
              icon={Film}
              title="No clips match these filters"
              action={<Button size="sm" onClick={() => { onDatasetChange(''); setType('') }}>Clear filters</Button>}
            />
          )}
        </Panel>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {visible.map((v) => (
              <li key={v.id}>
                <ClipCard
                  video={v}
                  typeLabels={typeLabels}
                  canUse={slotsLeft > 0}
                  onPlay={() => setPlaying(v)}
                  onUse={() => onUseAsCamera(v)}
                  onDelete={v.origin === 'upload' || v.origin === 'url' ? () => setDeleting(v) : undefined}
                />
              </li>
            ))}
          </ul>
          {shown < filtered.length && (
            <Button className="self-center" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({filtered.length - shown} left)
            </Button>
          )}
        </>
      )}

      <VideoDialog
        open={!!playing}
        onClose={() => setPlaying(null)}
        title={playing?.title ?? ''}
        description={playing && `${playing.dataset_name} · ${formatDuration(playing.duration_s)} · ${playing.width}×${playing.height}`}
        src={playing?.video_url ?? null}
        footer={
          playing && (
            <Button
              variant="primary"
              icon={Cctv}
              disabled={slotsLeft <= 0}
              onClick={() => {
                onUseAsCamera(playing)
                setPlaying(null)
              }}
            >
              Use as camera
            </Button>
          )
        }
      />

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? ''}?`}
        description="The converted video and its thumbnail are removed from the library."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="primary" icon={Trash2} loading={remove.isPending} onClick={confirmDelete}>Delete</Button>
          </>
        }
      />
    </div>
  )
}

interface ClipCardProps {
  video: LibraryVideo
  typeLabels: Record<string, string>
  canUse: boolean
  onPlay: () => void
  onUse: () => void
  onDelete?: () => void
}

function ClipCard({ video: v, typeLabels, canUse, onPlay, onUse, onDelete }: ClipCardProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <button type="button" onClick={onPlay} className="group relative block aspect-video w-full overflow-hidden bg-video" aria-label={`Play ${v.title}`}>
        {v.thumbnail_url && (
          <img src={v.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-[rgba(5,9,15,0.35)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-on-light">
            <Play size={18} aria-hidden="true" />
          </span>
        </span>
        <span className="absolute right-2 bottom-2 rounded-md bg-[rgba(5,9,15,0.8)] px-1.5 font-mono text-[12px] text-ink">
          {formatDuration(v.duration_s)}
        </span>
        {v.origin === 'reel' && (
          <span className="absolute top-2 left-2 rounded-md bg-[rgba(5,9,15,0.8)] px-1.5 font-mono text-[12px] text-ink">
            Joined reel
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold" title={v.title}>{v.title}</h3>
          <p className="truncate text-[12px] text-muted">{v.dataset_name}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {v.anomaly_types.map((t) => (
            <Chip key={t} className={t === 'normal' ? 'text-muted' : undefined}>{typeLabels[t] ?? t}</Chip>
          ))}
          {v.used_by.length > 0 && <Chip dot="var(--color-healthy)">On camera {v.used_by.join(', ')}</Chip>}
        </div>
        <div className="mt-auto flex items-center gap-1 pt-2">
          <Button size="sm" icon={Play} onClick={onPlay}>Play</Button>
          <Button size="sm" variant="ghost" icon={Cctv} onClick={onUse} disabled={!canUse} title={canUse ? undefined : 'All camera slots are in use'}>
            Use as camera
          </Button>
          {onDelete && (
            <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Delete ${v.title}`} onClick={onDelete} className="ml-auto" />
          )}
        </div>
      </div>
    </Card>
  )
}
