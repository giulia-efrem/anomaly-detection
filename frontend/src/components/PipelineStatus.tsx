import { ChevronRight, Plus } from 'lucide-react'
import { Fragment } from 'react'
import { usePipelineStatus } from '../api/hooks'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/States'
import StatusDot from '../ui/StatusDot'

export default function PipelineStatus({ onAddCamera }: { onAddCamera: () => void }) {
  const { data, isLoading, isError } = usePipelineStatus()
  const slots = data?.camera_slots
  const full = slots ? slots.used >= slots.total : false

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
      <span className="text-[13px] text-muted">Pipeline</span>
      {isLoading ? (
        <Skeleton className="h-8 w-[min(560px,100%)] rounded-full" />
      ) : isError || !data ? (
        <span className="text-[13px] text-muted">Status unavailable</span>
      ) : (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {data.stages.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && (
                <li aria-hidden="true" className="hidden text-[#3E5470] sm:block">
                  <ChevronRight size={14} />
                </li>
              )}
              <li className="inline-flex h-8 items-center gap-2 rounded-full bg-[#121E2D] px-3 text-[13px] whitespace-nowrap">
                <StatusDot color={s.active ? 'var(--color-healthy)' : 'var(--color-muted)'} active={s.active} size={7} />
                <span className="text-ink-2">{s.label}</span>
                <span className="font-cond text-muted">{s.detail}</span>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      <div className="ml-auto flex items-center gap-3">
        {slots && (
          <span className="text-[13px] text-muted">
            {slots.used} of {slots.total} camera slots
          </span>
        )}
        <Button size="sm" icon={Plus} onClick={onAddCamera} disabled={full}>
          Add camera
        </Button>
      </div>
    </div>
  )
}
