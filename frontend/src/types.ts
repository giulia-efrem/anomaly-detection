// Event contract (see CLAUDE.md) plus the extra fields the backend returns.

export const SUPERVISED_TYPES = ['fight', 'car_accident', 'fire_explosion', 'shooting'] as const
export const UNSUPERVISED_TYPES = ['unusual_object', 'unusual_motion', 'unusual_posture', 'loitering', 'crowding'] as const
export type SupervisedType = (typeof SUPERVISED_TYPES)[number]
export type UnsupervisedType = (typeof UNSUPERVISED_TYPES)[number]
export type IncidentType = SupervisedType | UnsupervisedType | 'other'
export type ThresholdKey = SupervisedType | 'unsupervised'
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
  // Not in the contract
  thumbnail_url: string | null
  /** Scene normality reason when that model contributed. */
  reason: UnsupervisedType | null
  details: { class_scores?: Partial<Record<SupervisedType, number>>; keys?: string[]; clip_seconds?: number }
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
  thresholds: Record<ThresholdKey, number>
  learn_seconds: number
}

export interface CameraInput {
  name: string
  source_type: SourceType
  source?: string | null
  library_video_id?: string | null
}

export interface CameraSettings {
  supervised?: 'on' | 'off'
  unsupervised?: 'learning' | 'off'
  thresholds?: Partial<Record<ThresholdKey, number>>
  learn_seconds?: number
}

/** What the pipeline sees on one camera right now ("camera.live", about once a second). */
export interface CameraLive {
  camera_id: string
  people_count: number
  scores: Record<SupervisedType, number>
  unsupervised: { score: number; reason: UnsupervisedType | null; text: string | null }
  learning_progress: number | null
  alerts: { key: ThresholdKey; incident_id: string | null; above_threshold_s: number }[]
  fps: number
}

/** An anomaly that is above threshold right now on one camera. */
export interface LiveAnomaly {
  camera_id: string
  incident_id: string | null
  type: IncidentType
  scores: MethodScores
  thresholds: MethodThresholds
  above_threshold_s: number
  text: string | null
}

export interface NormalityJob {
  camera_id: string
  title: string
  kind: 'clip' | 'incident'
  progress: number
  stage: 'queued' | 'learning' | 'done' | 'error'
  seconds_added: number
  error: string | null
}

export interface NormalitySummary {
  state: Camera['unsupervised']
  learn_seconds: number
  reasons: Record<UnsupervisedType, string>
  job: NormalityJob | null
  frames: number
  seconds: number
  updated_at: string | null
  grid: [number, number]
  classes: { cls: string; frames: number; share: number }[]
  people_p99: number | null
  poses: number
  hours: number[]
}

export interface ModelInfo {
  id: string
  name: string
  role: string
  family: 'base' | 'pretrained' | 'thesis'
  classes: string[]
  license: string
  license_url: string
  source_url: string
  size_bytes: number
  downloaded: boolean
  loaded: boolean
  device: string | null
  vram_mb: number | null
  error: string | null
}

export interface ModelsStatus {
  verified_at: string
  ready: boolean
  device: string
  gpu: { name: string; used_mb: number; total_mb: number } | null
  models: ModelInfo[]
  feedback: Partial<Record<'confirmed' | 'false_alarm' | 'normal', number>>
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
  credits: { title: string; author: string; license: string; page_url: string }[]
}

export interface Catalog {
  verified_at: string
  anomaly_types: Record<string, string>
  datasets: CatalogDataset[]
  excluded: { name: string; source_url: string; reason: string }[]
}
