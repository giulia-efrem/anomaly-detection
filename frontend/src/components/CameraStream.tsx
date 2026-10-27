import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { streamSrc } from '../api/client'
import { useRestartCamera } from '../api/hooks'
import type { Camera } from '../types'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

interface CameraStreamProps {
  camera: Camera
  /** Draw the pipeline's boxes, track ids and poses into the picture. */
  overlay?: boolean
}

/** Live MJPEG picture filling its box, with Connecting and Camera offline states. */
export default function CameraStream({ camera, overlay = false }: CameraStreamProps) {
  const [attempt, setAttempt] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [prevStatus, setPrevStatus] = useState(camera.status)
  const restart = useRestartCamera()

  // When the backend reports the camera live again, open a fresh connection.
  if (camera.status !== prevStatus) {
    setPrevStatus(camera.status)
    if (camera.status === 'live') setAttempt((a) => a + 1)
  }

  const src = `${streamSrc(camera)}?a=${attempt}&s=${encodeURIComponent(camera.source)}${overlay ? '&overlay=1' : ''}`
  const offline = camera.status === 'offline' || failedSrc === src
  const loaded = loadedSrc === src

  const retry = () => restart.mutate(camera.id, { onSettled: () => setAttempt((a) => a + 1) })

  return (
    <div className="absolute inset-0 bg-video">
      {!offline && camera.status === 'live' && (
        <img
          key={src}
          src={src}
          alt={`Live view of ${camera.name}`}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={cx('h-full w-full object-contain', loaded ? 'visible' : 'invisible')}
        />
      )}
      {!offline && !loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted" role="status">
          Connecting
        </div>
      )}
      {offline && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center" role="status">
          <span className="text-[13px] text-ink-2">Camera offline</span>
          <Button size="sm" icon={RefreshCw} loading={restart.isPending} onClick={retry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
