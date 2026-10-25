import { supervisedChip, unsupervisedChip, type ChipState } from '../lib/format'
import { cameraScenes } from '../mock/scenes'
import type { Camera } from '../types'
import { PersonIcon } from './Icons'
import Scene from './Scene'
import StatusDot from './StatusDot'

export function ModelChip({ chip, color }: { chip: ChipState; color: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-md border border-[#2A3D57] bg-[rgba(8,14,22,0.72)] px-2 font-cond text-[12px] whitespace-nowrap text-ink-2">
      <StatusDot color={color} active={chip.active} size={7} />
      {chip.label}
    </span>
  )
}

export function PeopleCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-cond text-[13px] text-ink-2" aria-label={`${count} people`}>
      <PersonIcon size={14} />
      {count}
    </span>
  )
}

export default function CameraTile({ camera }: { camera: Camera }) {
  const scene = cameraScenes[camera.id]

  return (
    <article className="@container relative aspect-video overflow-hidden rounded-[10px] border border-line-strong bg-video">
      {scene && <Scene scene={scene} className="absolute inset-0 h-full w-full" />}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-[rgba(5,9,15,0.9)] to-transparent px-2.5 pt-2 pb-5 @[220px]:px-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusDot color="var(--color-healthy)" size={7} />
            <h3 className="truncate text-[14px] leading-[18px] font-semibold">{camera.name}</h3>
          </div>
          <div className="hidden pl-[13px] font-cond text-[12px] leading-4 text-muted @[200px]:block">{camera.id}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {camera.to_review > 0 && (
            <span className="inline-flex h-5 items-center rounded-full bg-ink px-1.5 font-cond text-[12px] font-bold text-[#0C141F]">
              {camera.to_review}
              <span className="hidden @[230px]:inline">&nbsp;to review</span>
            </span>
          )}
          <PeopleCount count={camera.people_count} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-1 bg-gradient-to-t from-[rgba(5,9,15,0.85)] to-transparent px-2 pt-5 pb-2">
        <ModelChip chip={supervisedChip(camera)} color="var(--color-sup)" />
        <ModelChip chip={unsupervisedChip(camera)} color="var(--color-unsup)" />
      </div>
    </article>
  )
}
