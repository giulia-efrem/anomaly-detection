import { Layers, User } from 'lucide-react'
import { useLiveState } from '../api/hooks'
import { supervisedChip, unsupervisedChip } from '../lib/format'
import type { Camera } from '../types'
import { Button } from '../ui/Button'
import { Chip, Pill } from '../ui/Chip'
import { cx } from '../ui/cx'
import StatusDot from '../ui/StatusDot'
import CameraStream from './CameraStream'
import { useOverlay } from './useOverlay'

const HEALTH: Record<Camera['status'], string> = {
  live: 'var(--color-healthy)',
  connecting: 'var(--color-muted)',
  offline: '#5F7189',
}

export function ModelChips({ camera, compact = false }: { camera: Camera; compact?: boolean }) {
  const live = useLiveState()[camera.id]
  const sup = supervisedChip(camera)
  const unsup = unsupervisedChip(camera, live?.learning_progress)
  const full = (
    <>
      <Chip onVideo dot="var(--color-sup)" active={sup.active}>
        {sup.label}
      </Chip>
      <Chip onVideo dot="var(--color-unsup)" active={unsup.active}>
        {unsup.label}
      </Chip>
    </>
  )
  if (!compact) return full
  // Narrow tiles: one chip with both model dots, so the video stays visible.
  return (
    <>
      <span className="@[220px]:hidden" title={`${sup.label}, ${unsup.label}`}>
        <Chip onVideo className="gap-1">
          <StatusDot color="var(--color-sup)" active={sup.active} size={7} />
          <StatusDot color="var(--color-unsup)" active={unsup.active} size={7} />
          <span className="sr-only">{`${sup.label}, ${unsup.label}`}</span>
        </Chip>
      </span>
      <span className="hidden @[220px]:contents">{full}</span>
    </>
  )
}

export function PeopleCount({ camera }: { camera: Camera }) {
  const live = useLiveState()[camera.id]
  if (camera.status !== 'live' || !live) return null
  const n = live.people_count
  return (
    <Chip onVideo>
      <User size={12} aria-hidden="true" />
      <span className="sr-only">People in view:</span>
      {n}
    </Chip>
  )
}

export function OverlayToggle({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <Button
      variant="overlay"
      size="sm"
      iconOnly
      icon={Layers}
      aria-pressed={on}
      aria-label={on ? 'Hide boxes and poses' : 'Show boxes and poses'}
      title={on ? 'Hide boxes and poses' : 'Show boxes and poses'}
      onClick={onToggle}
      className={cx(on && 'bg-ink text-on-light hover:bg-white hover:text-on-light', className)}
    />
  )
}

export function CameraTitle({ camera, large = false }: { camera: Camera; large?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <StatusDot color={HEALTH[camera.status]} active={camera.status === 'live'} size={8} />
        <h3 className={large ? 'truncate text-[17px] leading-6 font-semibold' : 'truncate text-[14px] leading-5 font-semibold'}>
          {camera.name}
        </h3>
        {large && <span className="font-cond text-[13px] text-muted">{camera.id}</span>}
      </div>
      {!large && <div className="hidden pl-4 font-cond text-[12px] leading-4 text-muted @[200px]:block">{camera.id}</div>}
    </div>
  )
}

interface CameraTileProps {
  camera: Camera
  /** An anomaly is above threshold on this camera right now. */
  alarm?: boolean
  onFocus: () => void
}

export default function CameraTile({ camera, alarm = false, onFocus }: CameraTileProps) {
  const [overlay, toggleOverlay] = useOverlay(camera.id)
  return (
    <article
      className={cx('@container relative aspect-video overflow-hidden rounded-xl bg-video', alarm && 'ring-[1.5px] ring-alarm')}
      aria-label={alarm ? `${camera.name}: anomaly detected` : undefined}
    >
      <CameraStream camera={camera} compact overlay={overlay} />

      <button
        type="button"
        onClick={onFocus}
        aria-label={`Show ${camera.name} large`}
        className="absolute inset-0 z-10 rounded-xl ring-unsup transition-shadow hover:ring-2 hover:ring-line-strong focus-visible:ring-2 focus-visible:outline-none"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-[rgba(5,9,15,0.88)] to-transparent px-3 pt-2 pb-6">
        <CameraTitle camera={camera} />
        {camera.to_review > 0 && (
          <Pill>
            {camera.to_review}
            <span className="hidden @[230px]:inline">&nbsp;to review</span>
          </Pill>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end gap-1 bg-gradient-to-t from-[rgba(5,9,15,0.85)] to-transparent px-2 pt-6 pb-2">
        <div className="flex min-w-0 flex-wrap items-end gap-1">
          <ModelChips camera={camera} compact />
          <span className="hidden @[260px]:contents">
            <PeopleCount camera={camera} />
          </span>
        </div>
        <OverlayToggle on={overlay} onToggle={toggleOverlay} className="pointer-events-auto relative z-20 ml-auto shrink-0" />
      </div>
    </article>
  )
}
