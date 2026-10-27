import type { Camera, IncidentType, RaisedBy } from '../types'
import { TYPE_LABELS } from './classes'

export function typeLabel(type: IncidentType): string {
  return TYPE_LABELS[type] ?? type
}

export const RAISED_BY_LABELS: Record<RaisedBy, string> = {
  both: 'Both',
  supervised: 'Supervised',
  unsupervised: 'Unsupervised',
}

/** Swatch for a "raised by" tag or timeline marker: amber, blue, or half and half. */
export const RAISED_BY_SWATCH: Record<RaisedBy, string> = {
  supervised: 'var(--color-sup)',
  unsupervised: 'var(--color-unsup)',
  both: 'linear-gradient(to right, var(--color-sup) 50%, var(--color-unsup) 50%)',
}

/** "2026-10-25T11:39:00" -> "11:39:00", without timezone conversion. */
export function clockTime(iso: string): string {
  return iso.slice(11, 19)
}

/** "2026-10-25T11:39:00" -> "Sun 25 Oct, 11:39" */
export function dayAndTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDay(d)}, ${iso.slice(11, 16)}`
}

export function score(value: number): string {
  return value.toFixed(2)
}

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDay(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 MB'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} kB`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}

export interface ChipState {
  label: string
  active: boolean
}

export function supervisedChip(camera: Camera): ChipState {
  return camera.supervised === 'on'
    ? { label: 'Supervised on', active: true }
    : { label: 'Supervised off', active: false }
}

/** State of the unsupervised model in one word or two. `progress` is the live value. */
export function unsupervisedChip(camera: Camera, progress?: number | null): ChipState {
  switch (camera.unsupervised) {
    case 'ready':
      return { label: 'Ready', active: true }
    case 'collecting':
      return { label: 'Collecting footage', active: false }
    case 'learning':
      return { label: `Learning ${Math.floor((progress ?? camera.learning_progress ?? 0) * 100)}%`, active: false }
    case 'off':
      return { label: 'Unsupervised off', active: false }
  }
}

export const SOURCE_LABELS = { file: 'Video file', rtsp: 'Stream URL', webcam: 'Webcam' } as const
