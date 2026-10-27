import { useMarkNormal, useSetIncidentStatus } from '../api/hooks'
import { typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus } from '../types'
import { useToast } from '../ui/toast-context'

const DONE: Record<Exclude<IncidentStatus, 'needs_review'>, string> = {
  confirmed: 'confirmed',
  false_alarm: 'marked as false alarm',
}

/** Confirm, reject or reopen an incident, with Undo. Confirm and False alarm are stored as training labels. */
export function useIncidentDecision(cameraById: Map<string, Camera>) {
  const setStatus = useSetIncidentStatus()
  const toast = useToast()

  return (incident: Incident, status: IncidentStatus) => {
    const previous = incident.status
    const what = `${typeLabel(incident.type)}, ${cameraById.get(incident.camera_id)?.name ?? incident.camera_id}`
    setStatus.mutate(
      { id: incident.id, status },
      {
        onSuccess: () =>
          toast({
            title: status === 'needs_review' ? `${what}: reopened` : `${what}: ${DONE[status]}`,
            tone: 'success',
            action: { label: 'Undo', onClick: () => setStatus.mutate({ id: incident.id, status: previous }) },
          }),
        onError: (err) => toast({ title: 'Decision not saved', description: err.message, tone: 'error' }),
      },
    )
  }
}

/** "This is normal": a false alarm whose clip is added to the camera's unsupervised model. */
export function useMarkNormalDecision(cameraById: Map<string, Camera>) {
  const markNormal = useMarkNormal()
  const toast = useToast()
  return (incident: Incident) => {
    const what = `${typeLabel(incident.type)}, ${cameraById.get(incident.camera_id)?.name ?? incident.camera_id}`
    markNormal.mutate(incident.id, {
      onSuccess: () =>
        toast({
          title: `${what}: marked as normal`,
          description: incident.clip_url ? 'The clip is being added to the unsupervised model of this camera.' : 'No clip was recorded, so nothing was learned.',
          tone: 'success',
        }),
      onError: (err) => toast({ title: 'Decision not saved', description: err.message, tone: 'error' }),
    })
  }
}
