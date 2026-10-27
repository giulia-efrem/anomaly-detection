import { useState } from 'react'

/** A setting remembered in this browser only (layout, sidebar, overlays). Falls back to memory. */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`vad.${key}`)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(`vad.${key}`, JSON.stringify(v))
    } catch {
      // storage blocked: the setting lasts for this page view
    }
  }
  return [value, set]
}
