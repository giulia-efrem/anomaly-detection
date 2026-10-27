import { RefreshCw, VideoOff } from 'lucide-react'
import { useState } from 'react'
import { streamSrc } from '../api/client'
import { useRestartCamera } from '../api/hooks'
import type { Camera } from '../types'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

interface CameraStreamProps {
  camera: Camera
  compact?: boolean
  /** Draw the pipeline's boxes, track ids and poses into the picture. */
  overlay?: boolean
}

/** Live MJPEG picture that fills its box, with Connecting and Offline (Retry) states. */
export default function CameraStream({ camera, compact = false, overlay = false }: CameraStreamProps) {
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
          className={cx('h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}

      {!offline && !loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-video" role="status">
          <span className="text-[13px] text-muted">Connecting</span>
        </div>
      )}

      {offline && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-video px-4 text-center" role="status">
          <VideoOff size={compact ? 18 : 22} className="text-muted" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-ink-2">Offline</span>
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={restart.isPending} onClick={retry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
