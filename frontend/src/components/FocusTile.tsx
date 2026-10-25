import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { score, typeLabel } from '../lib/format'
import type { Camera, LiveAnomaly } from '../types'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonClass'
import { Pill } from '../ui/Chip'
import { cx } from '../ui/cx'
import { CameraTitle, ModelChips } from './CameraTile'
import CameraStream from './CameraStream'
import ScoreMeter from './ScoreMeter'

interface FocusTileProps {
  camera: Camera
  /** Set while this camera has an anomaly above threshold (detection arrives in step 3). */
  live: LiveAnomaly | null
}

/** Large tile: the camera with a live anomaly, or the one the user picked. */
export default function FocusTile({ camera, live }: FocusTileProps) {
  const ref = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else ref.current?.requestFullscreen()
  }

  const headline = live ? (live.scores.supervised ?? live.scores.unsupervised) : null

  return (
    <article
      ref={ref}
      aria-label={live ? `${camera.name}: ${typeLabel(live.type)} detected` : `${camera.name}, large view`}
      className={cx(
        '@container relative col-span-2 row-span-2 aspect-video overflow-hidden rounded-xl bg-video min-[760px]:aspect-auto',
        live && 'live-glow ring-[1.5px] ring-alarm',
        fullscreen && 'rounded-none',
      )}
    >
      <CameraStream camera={camera} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-[rgba(5,9,15,0.9)] to-transparent px-4 pt-4 pb-8">
        <div className="min-w-0">
          <CameraTitle camera={camera} large />
          {live && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-4">
              <Pill tone="live" className="h-6 px-2.5 text-[13px]">
                {typeLabel(live.type)} detected{headline !== null && ` ${score(headline)}`}
              </Pill>
              <span className="font-cond text-[13px] text-ink-2">
                Above threshold for {live.above_threshold_s.toFixed(1)} s
              </span>
            </div>
          )}
        </div>
        {camera.to_review > 0 && <Pill>{camera.to_review} to review</Pill>}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 bg-gradient-to-t from-[rgba(5,9,15,0.88)] to-transparent px-4 pt-8 pb-4">
        {live ? (
          <div className="hidden w-[232px] flex-col gap-2 rounded-lg bg-[rgba(8,14,22,0.82)] px-3 py-2 backdrop-blur-sm @[400px]:flex">
            <ScoreMeter method="supervised" value={live.scores.supervised} labelWidth={80} trackClass="bg-[#1A2638]" />
            <ScoreMeter method="unsupervised" value={live.scores.unsupervised} labelWidth={80} trackClass="bg-[#1A2638]" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            <ModelChips camera={camera} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {live && (
            <Link to={`/incidents?focus=${live.incident_id}`} className={buttonClass('primary', 'sm')}>
              Open incident
            </Link>
          )}
          <Button
            variant="overlay"
            size="sm"
            iconOnly
            icon={fullscreen ? Minimize2 : Maximize2}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFullscreen}
          />
        </div>
      </div>
    </article>
  )
}
