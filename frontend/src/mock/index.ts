import type { AlarmTimelineData, Camera, Incident, LiveAnomaly } from '../types'
import alarmsJson from './alarms.json'
import camerasJson from './cameras.json'
import incidentsJson from './incidents.json'
import liveJson from './live.json'

export const cameras = camerasJson as Camera[]
export const incidents = incidentsJson as Incident[]
export const liveAnomaly = liveJson as LiveAnomaly
export const alarmTimeline = alarmsJson as AlarmTimelineData

/** Older incidents that still need review but are not in the mock list. */
export const REVIEW_BACKLOG = 24

/** Fixed mock "now", matching the alarm timeline and incident times. */
export const MOCK_NOW = new Date(2026, 9, 25, 11, 40, 17)
