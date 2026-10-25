import { Fragment } from 'react'
import { ChevronRightIcon, PlusIcon } from './Icons'
import StatusDot from './StatusDot'

const STAGES = [
  { label: 'Streams', detail: '7/7' },
  { label: 'Person and pose', detail: '7/7' },
  { label: 'Anomaly scoring', detail: 'live' },
  { label: 'Scene captions', detail: '13 s ago' },
]

export default function PipelineStatus() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-[14px]">
      <span className="text-[13px] text-muted">Pipeline</span>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {STAGES.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && (
              <li aria-hidden="true" className="hidden text-[#3E5470] sm:block">
                <ChevronRightIcon size={14} />
              </li>
            )}
            <li className="inline-flex h-[30px] items-center gap-2 rounded-full border border-line-strong bg-[#121E2D] px-3 text-[13px] whitespace-nowrap">
              <StatusDot color="var(--color-healthy)" size={7} />
              <span className="text-ink-2">{s.label}</span>
              <span className="-ml-0.5 font-cond text-muted">{s.detail}</span>
            </li>
          </Fragment>
        ))}
      </ol>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[13px] text-muted">7 of 10 camera slots</span>
        <button
          type="button"
          className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[#2C3F59] px-3 text-[13px] font-medium text-ink transition-colors hover:bg-[#16233A]"
        >
          <PlusIcon size={15} />
          Add camera
        </button>
      </div>
    </div>
  )
}
