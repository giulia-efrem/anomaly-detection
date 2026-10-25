import { useSetIncidentStatus } from '../api/hooks'
import { typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus } from '../types'
import { useToast } from '../ui/toast-context'

const MESSAGES: Record<Exclude<IncidentStatus, 'needs_review'>, string> = {
  confirmed: 'Saved as a labelled example for the next supervised training run.',
  false_alarm: 'Saved as a hard negative for retraining.',
}

/** Confirm, reject or reopen an incident, with an Undo toast. */
export function useIncidentDecision(cameraById: Map<string, Camera>) {
  const setStatus = useSetIncidentStatus()
  const toast = useToast()

  return (incident: Incident, status: IncidentStatus) => {
    const previous = incident.status
    const where = cameraById.get(incident.camera_id)?.name ?? incident.camera_id
    const what = `${typeLabel(incident.type)} on ${where}`

    setStatus.mutate(
      { id: incident.id, status },
      {
        onSuccess: () => {
          if (status === 'needs_review') {
            toast({ title: `${what} is back in the review queue`, tone: 'info' })
            return
          }
          toast({
            title: status === 'confirmed' ? `${what} confirmed` : `${what} marked as a false alarm`,
            description: MESSAGES[status],
            tone: 'success',
            action: { label: 'Undo', onClick: () => setStatus.mutate({ id: incident.id, status: previous }) },
          })
        },
        onError: (err) => toast({ title: "Couldn't save the decision", description: err.message, tone: 'error' }),
      },
    )
  }
}
