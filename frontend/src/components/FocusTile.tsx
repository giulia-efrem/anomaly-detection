import { Maximize2, Minimize2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useLiveState } from '../api/hooks'
import { isSupervisedType } from '../lib/classes'
import { typeLabel, unsupervisedChip } from '../lib/format'
import type { Camera, LiveAnomaly, ScorePoint } from '../types'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonClass'
import { cx } from '../ui/cx'
import { ModelDots, ObjectCount, OverlayToggle, VideoLabels } from './CameraTile'
import CameraStream from './CameraStream'
import ScoreMeter from './ScoreMeter'
import { ScoreChart } from './ScoreSparkline'
import { useOverlay } from './useOverlay'

interface FocusTileProps {
  camera: Camera
  /** Set while this camera has an alarm above threshold. */
  live: LiveAnomaly | null
  history: ScorePoint[]
  now: number
}

/** Large tile (2 x 2): the alerting camera, or the one the user picked. */
export default function FocusTile({ camera, live, history, now }: FocusTileProps) {
  const ref = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [overlay, toggleOverlay] = useOverlay(camera.id)
  const state = useLiveState()[camera.id]
  const last = history[history.length - 1]

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else ref.current?.requestFullscreen()
  }

  const headline = live ? (isSupervisedType(live.type) ? live.scores.supervised : live.scores.unsupervised) : null
  // Bars: the live alarm's scores, otherwise the latest scores of this camera.
  const sup = live ? live.scores.supervised : last ? last.sup : null
  const unsup = live ? live.scores.unsupervised : last ? last.unsup : null
  const supThr = live ? live.thresholds.supervised : last?.supThr
  const unsupThr = live ? live.thresholds.unsupervised : last?.unsupThr

  return (
    <article
      ref={ref}
      aria-label={live ? `${camera.name}: ${typeLabel(live.type)} detected` : `${camera.name}, large view`}
      className={cx(
        '@container col-span-2 row-span-2 flex flex-col overflow-hidden rounded-xl bg-card',
        live ? 'border-2 border-alarm' : 'border border-line',
        fullscreen && 'rounded-none',
      )}
    >
      <div className="relative min-h-0 flex-1 max-[759px]:aspect-video">
        <CameraStream camera={camera} overlay={overlay} />
        <VideoLabels camera={camera}>
          {live && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-alarm px-2 py-0.5 text-[13px] font-semibold text-white">
                <TriangleAlert size={14} aria-hidden="true" />
                {typeLabel(live.type)}
                <span className="font-mono font-medium">{headline === null ? 'n/a' : headline.toFixed(2)}</span>
              </span>
              {live.text && (
                <span className="max-w-[360px] rounded-md bg-[rgba(7,12,18,0.85)] px-1.5 py-0.5 text-[12px] text-ink-2">{live.text}</span>
              )}
            </>
          )}
        </VideoLabels>
        <OverlayToggle on={overlay} onToggle={toggleOverlay} className="absolute right-2 bottom-2 z-10" />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line px-3 py-2">
        <div className="flex h-7 items-center gap-2 text-[12px]">
          <ModelDots camera={camera} live={state} />
          <span className="truncate text-ink-2">{unsupervisedChip(camera, state?.learning_progress).label}</span>
          <ObjectCount camera={camera} live={state} />
          <span className="ml-auto flex items-center gap-2">
            {live?.incident_id && (
              <Link to={`/incidents?focus=${live.incident_id}`} className={buttonClass('primary', 'sm')}>
                Open incident
              </Link>
            )}
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              icon={fullscreen ? Minimize2 : Maximize2}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              onClick={toggleFullscreen}
            />
          </span>
        </div>
        <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 @[440px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <ScoreMeter method="supervised" value={sup} threshold={supThr} labelWidth={76} />
            <ScoreMeter method="unsupervised" value={unsup} threshold={unsupThr} labelWidth={76} />
          </div>
          <div className="min-w-0" title="Both scores over the last 60 s; dashed lines are the thresholds">
            <ScoreChart points={history} now={now} height={40} />
          </div>
        </div>
      </div>
    </article>
  )
}
