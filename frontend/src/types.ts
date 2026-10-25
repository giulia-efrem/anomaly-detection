// Event contract (see CLAUDE.md) plus the extra fields the backend returns.

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

export type SourceType = 'rtsp' | 'webcam' | 'file'
export type StreamStatus = 'connecting' | 'live' | 'offline'

export interface Camera {
  id: string
  name: string
  stream_url: string
  people_count: number
  to_review: number
  supervised: 'on' | 'off'
  unsupervised: 'collecting' | 'learning' | 'ready' | 'off'
  learning_progress: number | null
  // Not in the contract: source and runtime state.
  source_type: SourceType
  source: string
  library_video_id: string | null
  status: StreamStatus
  position: number
}

export interface CameraInput {
  name: string
  source_type: SourceType
  source?: string | null
  library_video_id?: string | null
}

/** An anomaly that is above threshold right now on one camera (step 3). */
export interface LiveAnomaly {
  camera_id: string
  incident_id: string
  type: IncidentType
  scores: MethodScores
  thresholds: MethodThresholds
  above_threshold_s: number
}

export interface PipelineStage {
  key: string
  label: string
  active: boolean
  detail: string
}

export interface PipelineStatus {
  camera_slots: { used: number; total: number }
  stages: PipelineStage[]
}

export interface LibraryVideo {
  id: string
  title: string
  dataset_id: string | null
  dataset_name: string | null
  anomaly_types: string[]
  origin: 'catalog' | 'upload' | 'url' | 'reel'
  original_name: string | null
  duration_s: number | null
  width: number | null
  height: number | null
  fps: number | null
  size_bytes: number | null
  created_at: string
  video_url: string
  thumbnail_url: string | null
  used_by: string[]
}

export type JobStage = 'queued' | 'downloading' | 'extracting' | 'converting' | 'done' | 'error'

export interface LibraryJob {
  id: string
  kind: 'dataset' | 'url' | 'upload'
  label: string
  dataset_id: string | null
  stage: JobStage
  progress: number
  bytes_done: number
  bytes_total: number | null
  items_done: number
  items_total: number
  clips_added: number
  error: string | null
  created_at: string
  finished_at: string | null
}

export interface CatalogDataset {
  id: string
  name: string
  description: string
  anomaly_types: string[]
  has_normal: boolean
  clip_count: number
  size_bytes: number
  license: string
  license_url: string | null
  source_url: string
  citation: string
  clips_imported: number
  job: LibraryJob | null
}

export interface Catalog {
  verified_at: string
  anomaly_types: Record<string, string>
  datasets: CatalogDataset[]
  excluded: { name: string; source_url: string; reason: string }[]
}
