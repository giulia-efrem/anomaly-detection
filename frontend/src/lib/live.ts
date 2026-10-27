import { SUPERVISED_TYPES, type Camera, type CameraLive, type LiveAnomaly, type SupervisedType } from '../types'

/** The anomalies above threshold right now, longest first, built from the "camera.live" events. */
export function liveAnomalies(cameras: Camera[] | undefined, live: Record<string, CameraLive>): LiveAnomaly[] {
  const out: LiveAnomaly[] = []
  for (const cam of cameras ?? []) {
    const state = live[cam.id]
    if (!state || cam.status !== 'live') continue
    // The most likely pretrained class, shown next to a scene normality alert.
    const best: SupervisedType = SUPERVISED_TYPES.reduce((a, b) => (state.scores[b] > state.scores[a] ? b : a))
    for (const alert of state.alerts) {
      const scene = alert.key === 'unsupervised'
      const cls = scene ? best : (alert.key as SupervisedType)
      out.push({
        camera_id: cam.id,
        incident_id: alert.incident_id,
        type: scene ? (state.unsupervised.reason ?? 'other') : cls,
        scores: { supervised: state.scores[cls], unsupervised: state.unsupervised.score },
        thresholds: { supervised: cam.thresholds[cls], unsupervised: cam.thresholds.unsupervised },
        above_threshold_s: alert.above_threshold_s,
        text: scene ? state.unsupervised.text : null,
      })
    }
  }
  return out.sort((a, b) => b.above_threshold_s - a.above_threshold_s)
}
