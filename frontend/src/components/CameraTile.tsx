import { Bell, Layers } from 'lucide-react'
import { useLiveState } from '../api/hooks'
import { supervisedChip, unsupervisedChip } from '../lib/format'
import type { Camera, CameraLive, ScorePoint } from '../types'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import StatusDot from '../ui/StatusDot'
import CameraStream from './CameraStream'
import { Sparkline } from './ScoreSparkline'
import { useOverlay } from './useOverlay'

const LABEL = 'rounded-md bg-[rgba(7,12,18,0.85)] px-1.5 py-0.5 text-[12px] leading-4'

/** Name top-left, id and the review count top-right, drawn on the video. */
export function VideoLabels({ camera, children }: { camera: Camera; children?: React.ReactNode }) {
  return (
    <>
      <div className="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[70%] flex-col items-start gap-1">
        <span className={cx(LABEL, 'truncate font-semibold text-ink')}>{camera.name}</span>
        {children}
      </div>
      <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1">
        {camera.to_review > 0 && (
          <span
            className="inline-flex h-5 items-center gap-1 rounded-md bg-ink px-1.5 font-mono text-[12px] font-medium text-on-light"
            title={`${camera.to_review} alarms to review`}
          >
            <Bell size={12} aria-hidden="true" />
            {camera.to_review}
            <span className="sr-only">alarms to review</span>
          </span>
        )}
        {/* Narrow tiles (phones) keep the name readable; the id shows from 240px up. */}
        <span className={cx(LABEL, 'hidden font-mono text-ink-2 @[240px]:inline')}>{camera.id}</span>
      </div>
    </>
  )
}

/** Amber and blue dots: filled when the model is active, a hollow ring when it is not ready. */
export function ModelDots({ camera, live }: { camera: Camera; live: CameraLive | undefined }) {
  const sup = supervisedChip(camera)
  const unsup = unsupervisedChip(camera, live?.learning_progress)
  return (
    <span className="flex shrink-0 items-center gap-1" title={`${sup.label}. Unsupervised: ${unsup.label}`}>
      <StatusDot color="var(--color-sup)" active={sup.active} size={8} />
      <StatusDot color="var(--color-unsup)" active={unsup.active} size={8} />
      <span className="sr-only">{`${sup.label}. Unsupervised: ${unsup.label}`}</span>
    </span>
  )
}

export function ObjectCount({ camera, live }: { camera: Camera; live: CameraLive | undefined }) {
  const n = camera.status === 'live' && live ? live.object_count : null
  return (
    <span className="shrink-0 text-[12px] text-muted" title="Tracked objects in view">
      <span className="font-mono text-ink-2">{n ?? 'n/a'}</span>
      <span className="hidden @[240px]:inline"> {n === 1 ? 'object' : 'objects'}</span>
    </span>
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
      className={cx('h-7 w-7', on && 'text-ink', className)}
    />
  )
}

interface CameraTileProps {
  camera: Camera
  history: ScorePoint[]
  now: number
  /** An alarm is above threshold on this camera right now (another camera has the focus tile). */
  alarm?: boolean
  onFocus: () => void
}

export default function CameraTile({ camera, history, now, alarm = false, onFocus }: CameraTileProps) {
  const [overlay, toggleOverlay] = useOverlay(camera.id)
  const live = useLiveState()[camera.id]
  const state = unsupervisedChip(camera, live?.learning_progress)

  return (
    <article
      className={cx(
        '@container flex flex-col overflow-hidden rounded-xl bg-card',
        alarm ? 'border-2 border-alarm' : 'border border-line',
      )}
      aria-label={alarm ? `${camera.name}: alarm` : camera.name}
    >
      <div className="relative aspect-video">
        <CameraStream camera={camera} compact overlay={overlay} />
        <button
          type="button"
          onClick={onFocus}
          aria-label={`Show ${camera.name} large`}
          className="absolute inset-0 z-[5] focus-visible:outline-2 focus-visible:-outline-offset-2"
        />
        <VideoLabels camera={camera} />
        <OverlayToggle on={overlay} onToggle={toggleOverlay} className="absolute right-2 bottom-2 z-10" />
      </div>
      <div className="flex h-8 items-center gap-2 border-t border-line px-2">
        <ModelDots camera={camera} live={live} />
        <span className="min-w-0 truncate text-[12px] text-ink-2">{state.label}</span>
        <span className="ml-auto flex items-center gap-2">
          <ObjectCount camera={camera} live={live} />
          <Sparkline points={history} now={now} width={56} />
        </span>
      </div>
    </article>
  )
}
