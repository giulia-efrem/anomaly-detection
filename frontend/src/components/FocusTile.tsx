import { score, typeLabel } from '../lib/format'
import { cameraScenes } from '../mock/scenes'
import type { Camera, LiveAnomaly } from '../types'
import { PeopleCount } from './CameraTile'
import { ExpandIcon } from './Icons'
import Scene from './Scene'
import ScoreMeter from './ScoreMeter'

interface FocusTileProps {
  camera: Camera
  live: LiveAnomaly
}

/** Large tile for the camera with a live anomaly. */
export default function FocusTile({ camera, live }: FocusTileProps) {
  const scene = cameraScenes[camera.id]
  const sup = live.scores.supervised
  const headline = sup ?? live.scores.unsupervised

  return (
    <article
      className="live-glow @container relative col-span-2 row-span-2 aspect-video overflow-hidden rounded-[10px] border-[1.5px] border-alarm bg-video min-[760px]:aspect-auto"
      aria-label={`${camera.name}: ${typeLabel(live.type)} detected`}
    >
      {scene && <Scene scene={scene} className="absolute inset-0 h-full w-full" strokeWidth={1.8} />}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-[rgba(5,9,15,0.92)] to-transparent px-3 pt-2.5 pb-8 @[420px]:px-4 @[420px]:pt-3.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[17px] leading-[22px] font-bold">{camera.name}</h3>
            <span className="font-cond text-[13px] text-muted">{camera.id}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex h-6 items-center rounded-full bg-alarm px-2.5 font-cond text-[13px] font-bold whitespace-nowrap text-[#1A0B0B]">
              {typeLabel(live.type)} detected{headline !== null && ` ${score(headline)}`}
            </span>
            <span className="font-cond text-[13px] whitespace-nowrap text-ink-2">
              Above threshold for {live.above_threshold_s.toFixed(1)} s
            </span>
          </div>
        </div>
        <PeopleCount count={camera.people_count} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-[rgba(5,9,15,0.88)] to-transparent px-3 pt-8 pb-3 @[420px]:px-4 @[420px]:pb-3.5">
        <div className="hidden w-[230px] flex-col gap-2 rounded-lg border border-[#2A3D57] bg-[rgba(8,14,22,0.82)] px-3 py-2.5 @[400px]:flex">
          <ScoreMeter method="supervised" value={live.scores.supervised} labelWidth={78} trackClass="bg-[#1A2638]" />
          <ScoreMeter method="unsupervised" value={live.scores.unsupervised} labelWidth={78} trackClass="bg-[#1A2638]" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={`#incident-${live.incident_id}`}
            className="inline-flex h-[34px] items-center rounded-lg bg-ink px-3.5 text-[13px] font-semibold whitespace-nowrap text-[#0C141F] transition-colors hover:bg-white"
          >
            Open incident
          </a>
          <button
            type="button"
            aria-label="Expand camera"
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#2A3D57] bg-[rgba(8,14,22,0.72)] text-ink-2 transition-colors hover:text-ink"
          >
            <ExpandIcon size={16} />
          </button>
        </div>
      </div>
    </article>
  )
}
