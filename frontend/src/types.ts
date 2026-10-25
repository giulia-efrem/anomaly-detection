export type IncidentType = 'fight' | 'fall' | 'unusual_posture' | 'other'
export type Method = 'supervised' | 'unsupervised'
export type RaisedBy = Method | 'both'
export type IncidentStatus = 'needs_review' | 'confirmed' | 'false_alarm'

export interface MethodScores {
  supervised: number | null
  unsupervised: number | null
}

export interface MethodThresholds {
  supervised: number
  unsupervised: number
}

export interface Incident {
  id: string
  camera_id: string
  type: IncidentType
  started_at: string
  ended_at: string
  alarm_count: number
  raised_by: RaisedBy
  scores: MethodScores
  thresholds: MethodThresholds
  caption: string | null
  clip_url: string | null
  status: IncidentStatus
}

export interface Camera {
  id: string
  name: string
  stream_url: string
  people_count: number
  to_review: number
  supervised: 'on' | 'off'
  unsupervised: 'collecting' | 'learning' | 'ready' | 'off'
  learning_progress: number | null
}

/** An anomaly that is above threshold right now on one camera. */
export interface LiveAnomaly {
  camera_id: string
  incident_id: string
  type: IncidentType
  scores: MethodScores
  thresholds: MethodThresholds
  above_threshold_s: number
}

export interface AlarmMarker {
  /** Position on the track, 0 to 100 percent of the window. */
  at: number
  by: RaisedBy
}

export interface AlarmTimelineData {
  window_minutes: number
  total_alarms: number
  axis: string[]
  rows: { camera_id: string; markers: AlarmMarker[] }[]
}
