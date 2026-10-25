import { Cctv, Clapperboard, Plus } from 'lucide-react'
import { Link } from 'react-router'
import type { Camera, LiveAnomaly } from '../types'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonClass'
import { Panel } from '../ui/Panel'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import AddCameraTile from './AddCameraTile'
import CameraTile from './CameraTile'
import FocusTile from './FocusTile'

interface CameraGridProps {
  cameras: Camera[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  live: LiveAnomaly | null
  focusId: string | null
  onFocus: (id: string) => void
  slotsLeft: number
  onAddCamera: () => void
}

const GRID = 'grid grid-cols-2 gap-3 min-[760px]:grid-cols-4'

export default function CameraGrid({
  cameras,
  isLoading,
  error,
  onRetry,
  live,
  focusId,
  onFocus,
  slotsLeft,
  onAddCamera,
}: CameraGridProps) {
  if (isLoading) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading cameras">
        <Skeleton className="col-span-2 row-span-2 aspect-video rounded-xl min-[760px]:aspect-auto" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-video rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Panel>
        <ErrorState title="Couldn't load cameras" error={error} onRetry={onRetry} />
      </Panel>
    )
  }

  if (!cameras || cameras.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={Cctv}
          title="No cameras yet"
          description="Add an RTSP camera or a webcam, or turn a test video into a virtual camera that loops like a live feed."
          action={
            <>
              <Button variant="primary" size="sm" icon={Plus} onClick={onAddCamera}>
                Add camera
              </Button>
              <Link to="/test-videos" className={buttonClass('secondary', 'sm')}>
                <Clapperboard size={15} aria-hidden="true" />
                Get test videos
              </Link>
            </>
          }
        />
      </Panel>
    )
  }

  // A live anomaly always takes the big tile; otherwise the user's pick or the first camera.
  const focus =
    cameras.find((c) => c.id === live?.camera_id) ?? cameras.find((c) => c.id === focusId) ?? cameras[0]
  const rest = cameras.filter((c) => c !== focus)

  return (
    <section aria-label="Cameras" className={GRID}>
      <FocusTile camera={focus} live={live?.camera_id === focus.id ? live : null} />
      {rest.map((c) => (
        <CameraTile key={c.id} camera={c} onFocus={() => onFocus(c.id)} />
      ))}
      <AddCameraTile slotsLeft={slotsLeft} onClick={onAddCamera} />
    </section>
  )
}
