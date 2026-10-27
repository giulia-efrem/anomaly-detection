import { OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import { SUPERVISED_TYPES, type IncidentType, type Severity, type SupervisedType, type ThresholdKey } from '../types'

export const TYPE_LABELS: Record<IncidentType, string> = {
  fight: 'Fight',
  car_accident: 'Car accident',
  fire_explosion: 'Fire or explosion',
  unusual_object: 'Unusual object',
  unusual_motion: 'Unusual motion',
  unusual_posture: 'Unusual posture',
  loitering: 'Loitering',
  crowding: 'Crowding',
  other: 'Other',
}

export function isSupervisedType(t: string): t is SupervisedType {
  return (SUPERVISED_TYPES as readonly string[]).includes(t)
}

/** Critical for the supervised classes, warning for unsupervised alerts. */
export function severityOf(t: IncidentType): Severity {
  return isSupervisedType(t) ? 'critical' : 'warning'
}

export const SEVERITY: Record<Severity, { label: string; icon: LucideIcon; text: string; color: string }> = {
  critical: { label: 'Critical', icon: OctagonAlert, text: 'text-crit', color: 'var(--color-crit)' },
  warning: { label: 'Warning', icon: TriangleAlert, text: 'text-warn', color: 'var(--color-warn)' },
}

/** Short model names shown next to a class. */
export const CLASS_MODELS: Record<SupervisedType, string> = {
  fight: 'X3D-M, RWF-2000',
  car_accident: '3D ResNet-18 crash detector',
  fire_explosion: 'YOLOv8n, D-Fire',
}

export const THRESHOLD_LABELS: Record<ThresholdKey, string> = {
  fight: 'Fight',
  car_accident: 'Car accident',
  fire_explosion: 'Fire or explosion',
  unsupervised: 'Unsupervised',
}
