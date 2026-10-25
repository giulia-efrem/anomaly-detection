import type { Camera, IncidentType, RaisedBy } from '../types'

const TYPE_LABELS: Record<IncidentType, string> = {
  fight: 'Fight',
  fall: 'Fall',
  unusual_posture: 'Unusual posture',
  other: 'Other',
}

export function typeLabel(type: IncidentType): string {
  return TYPE_LABELS[type]
}

export const RAISED_BY_LABELS: Record<RaisedBy, string> = {
  both: 'Both models',
  supervised: 'Supervised only',
  unsupervised: 'Unsupervised only',
}

/** "2026-10-25T11:39:00" -> "11:39:00", without timezone conversion. */
export function clockTime(iso: string): string {
  return iso.slice(11, 19)
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

export interface ChipState {
  label: string
  active: boolean
}

export function supervisedChip(camera: Camera): ChipState {
  return camera.supervised === 'on'
    ? { label: 'Supervised on', active: true }
    : { label: 'Supervised off', active: false }
}

export function unsupervisedChip(camera: Camera): ChipState {
  switch (camera.unsupervised) {
    case 'ready':
      return { label: 'Unsupervised ready', active: true }
    case 'collecting':
      return { label: 'Collecting footage', active: false }
    case 'learning':
      return { label: `Learning ${Math.round((camera.learning_progress ?? 0) * 100)}%`, active: false }
    case 'off':
      return { label: 'Unsupervised off', active: false }
  }
}
