import type { Camera, LiveAnomaly } from '../types'
import AddCameraTile from './AddCameraTile'
import CameraTile from './CameraTile'
import FocusTile from './FocusTile'

const CAMERA_SLOTS = 10

interface CameraGridProps {
  cameras: Camera[]
  live: LiveAnomaly | null
}

export default function CameraGrid({ cameras, live }: CameraGridProps) {
  const focus = live ? cameras.find((c) => c.id === live.camera_id) : undefined
  const rest = cameras.filter((c) => c !== focus)

  return (
    <section aria-label="Cameras" className="grid grid-cols-2 gap-3 min-[760px]:grid-cols-4">
      {focus && live && <FocusTile camera={focus} live={live} />}
      {rest.map((c) => (
        <CameraTile key={c.id} camera={c} />
      ))}
      <AddCameraTile slotsLeft={CAMERA_SLOTS - cameras.length} />
    </section>
  )
}
