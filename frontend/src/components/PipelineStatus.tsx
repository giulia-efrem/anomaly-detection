import { Plus } from 'lucide-react'
import { usePipelineStatus } from '../api/hooks'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/States'
import StatusDot from '../ui/StatusDot'

/** Streams, Detection, Supervised and Unsupervised in one segmented bar, from /api/status. */
export default function PipelineStatus({ onAddCamera }: { onAddCamera: () => void }) {
  const { data, isLoading, isError } = usePipelineStatus()
  const slots = data?.camera_slots
  const full = slots ? slots.used >= slots.total : false

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3">
      {isLoading ? (
        <Skeleton className="h-9 w-[min(640px,100%)]" />
      ) : isError || !data ? (
        <span className="text-[13px] text-muted">Pipeline status unavailable</span>
      ) : (
        <ol
          aria-label="Pipeline"
          className="flex max-w-full flex-wrap overflow-hidden rounded-xl border border-line-strong bg-panel"
        >
          {data.stages.map((s) => (
            <li key={s.key} className="flex h-9 items-center gap-2 border-r border-line-strong px-3 text-[13px] whitespace-nowrap last:border-r-0">
              <StatusDot color={s.active ? 'var(--color-healthy)' : 'var(--color-muted)'} active={s.active} size={7} />
              <span className="text-ink-2">{s.label}</span>
              <span className="font-mono text-[12px] text-ink">{s.detail}</span>
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="secondary" icon={Plus} onClick={onAddCamera} disabled={full} className="ml-auto">
        Add camera
      </Button>
    </div>
  )
}
