import type { Camera, IncidentStatus, IncidentType, RaisedBy } from '../types'
import { TYPE_LABELS } from './classes'

export const NA = 'n/a'

export function typeLabel(type: IncidentType): string {
  return TYPE_LABELS[type] ?? type
}

export const RAISED_BY_LABELS: Record<RaisedBy, string> = {
  both: 'Both',
  supervised: 'Supervised',
  unsupervised: 'Unsupervised',
}

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  needs_review: 'Open',
  confirmed: 'Confirmed',
  false_alarm: 'False alarm',
}

/** "2026-10-25T11:39:00" -> "11:39:00", without timezone conversion. */
export function clockTime(iso: string): string {
  return iso.slice(11, 19)
}

/** "2026-10-25T11:39:00" -> "2026-10-25 11:39:00" */
export function dateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}

/** Two decimals, or n/a when the value does not exist. */
export function score(value: number | null | undefined): string {
  return value === null || value === undefined ? NA : value.toFixed(2)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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

/** Plain-text model states for a camera, e.g. "Sup on · Unsup learning 40%". */
export function supervisedState(camera: Camera): string {
  return camera.supervised === 'on' ? 'on' : 'off'
}

export function unsupervisedState(camera: Camera, progress?: number | null): string {
  switch (camera.unsupervised) {
    case 'ready':
      return 'ready'
    case 'collecting':
      return 'waiting for video'
    case 'learning':
      return `learning ${Math.floor((progress ?? camera.learning_progress ?? 0) * 100)}%`
    case 'off':
      return 'off'
  }
}

export const SOURCE_LABELS = { file: 'Video file', rtsp: 'Stream URL', webcam: 'Webcam' } as const
