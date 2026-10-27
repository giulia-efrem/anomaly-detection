import { useState } from 'react'

const KEY = 'veghe.overlay'

function read(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/** Whether a camera tile shows boxes, track ids and poses. Remembered per camera in this browser. */
export function useOverlay(cameraId: string): [boolean, () => void] {
  const [on, setOn] = useState(() => !!read()[cameraId])
  const toggle = () => {
    const next = !on
    setOn(next)
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [cameraId]: next }))
    } catch {
      // storage blocked: the toggle still works for this page view
    }
  }
  return [on, toggle]
}
