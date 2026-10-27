import {
  CarFront,
  CircleHelp,
  Clock4,
  Crosshair,
  Flame,
  PackageSearch,
  PersonStanding,
  Swords,
  Users,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { SUPERVISED_TYPES, type IncidentType, type SupervisedType, type ThresholdKey } from '../types'

export const TYPE_LABELS: Record<IncidentType, string> = {
  fight: 'Fight',
  car_accident: 'Car accident',
  fire_explosion: 'Fire or explosion',
  shooting: 'Gun or shooting',
  unusual_object: 'Unusual object',
  unusual_motion: 'Unusual motion',
  unusual_posture: 'Unusual posture',
  loitering: 'Loitering',
  crowding: 'Crowding',
  other: 'Other',
}

export const TYPE_ICONS: Record<IncidentType, LucideIcon> = {
  fight: Swords,
  car_accident: CarFront,
  fire_explosion: Flame,
  shooting: Crosshair,
  unusual_object: PackageSearch,
  unusual_motion: Wind,
  unusual_posture: PersonStanding,
  loitering: Clock4,
  crowding: Users,
  other: CircleHelp,
}

/**
 * One hue per pretrained class and one for every scene normality reason (which also
 * carry an icon and a label). Validated with the dataviz palette script on the
 * timeline track (#0D1622): CVD and normal-vision separation pass for neighbours.
 * No red: red is reserved for a live anomaly.
 */
export const SCENE_COLOR = '#3987e5'
export const CLASS_COLORS: Record<SupervisedType, string> = {
  fight: '#d95926',
  car_accident: '#199e70',
  fire_explosion: '#c98500',
  shooting: '#d55181',
}

export function isSupervisedType(t: string): t is SupervisedType {
  return (SUPERVISED_TYPES as readonly string[]).includes(t)
}

export function typeColor(t: IncidentType): string {
  return isSupervisedType(t) ? CLASS_COLORS[t] : SCENE_COLOR
}

/** Short model names shown next to a class. */
export const CLASS_MODELS: Record<SupervisedType, string> = {
  fight: 'X3D-M, RWF-2000',
  car_accident: '3D ResNet-18 crash detector',
  fire_explosion: 'YOLOv8n, D-Fire',
  shooting: 'YOLOv8n threat detector',
}

export const THRESHOLD_LABELS: Record<ThresholdKey, string> = {
  fight: 'Fight',
  car_accident: 'Car accident',
  fire_explosion: 'Fire or explosion',
  shooting: 'Gun or shooting',
  unsupervised: 'Scene normality',
}
