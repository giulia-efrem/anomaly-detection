import { Check, Undo2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { CLASS_MODELS, isSupervisedType, TYPE_LABELS } from '../lib/classes'
import { useNow } from '../lib/useNow'
import { dateTime, NA, RAISED_BY_LABELS, score, STATUS_LABELS, typeLabel } from '../lib/format'
import type { Camera, Incident, IncidentStatus } from '../types'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import ScoreBar from './ScoreBar'
import ScoreChart from './ScoreChart'
import SeverityIcon from './SeverityIcon'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="mb-2 text-[12px] font-medium text-muted">{title}</h3>
      {children}
    </section>
  )
}

interface IncidentDrawerProps {
  incident: Incident | null
  camera: Camera | undefined
  onClose: () => void
  onDecide: (incident: Incident, status: IncidentStatus) => void
  onNormal: (incident: Incident) => void
}

/** Everything about one incident: clip, scores over time, detections, feedback. */
export default function IncidentDrawer({ incident: i, camera, onClose, onDecide, onNormal }: IncidentDrawerProps) {
  const now = useNow(5000)
  const series = i?.details.series
  const detections = i?.details.detections
  return (
    <Drawer
      open={!!i}
      onClose={onClose}
      label={i ? `Incident ${i.id}` : 'Incident'}
      title={
        i && (
          <span className="flex items-center gap-2">
            <SeverityIcon severity={i.severity} />
            {typeLabel(i.type)}
          </span>
        )
      }
      subtitle={
        i && (
          <>
            {camera?.name ?? 'Removed camera'} <span className="font-mono text-muted">{i.camera_id}</span> ·{' '}
            <span className="font-mono">{dateTime(i.started_at)}</span>
          </>
        )
      }
      footer={
        i &&
        (i.status === 'needs_review' ? (
          <>
            <Button variant="primary" icon={Check} onClick={() => onDecide(i, 'confirmed')}>
              Confirm
            </Button>
            <Button icon={X} onClick={() => onDecide(i, 'false_alarm')}>
              False alarm
            </Button>
            <Button variant="ghost" onClick={() => onNormal(i)} title="False alarm; the clip is added to the unsupervised model of this camera">
              This is normal
            </Button>
          </>
        ) : (
          <>
            <span className="self-center text-[13px] text-ink-2">{STATUS_LABELS[i.status]}</span>
            <Button variant="ghost" icon={Undo2} onClick={() => onDecide(i, 'needs_review')}>
              Reopen
            </Button>
          </>
        ))
      }
    >
      {i && (
        <>
          <div className="border-b border-line bg-video">
            {i.clip_url ? (
              <video key={i.clip_url} src={i.clip_url} controls autoPlay loop muted playsInline className="aspect-video w-full object-contain" />
            ) : (
              <div className="flex aspect-video items-center justify-center text-[13px] text-muted">
                {now - new Date(i.ended_at).getTime() < 30_000 ? 'Clip is being recorded' : 'No clip recorded'}
              </div>
            )}
          </div>

          <Section title="Summary">
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted">Severity</dt>
              <dd><SeverityIcon severity={i.severity} withLabel /></dd>
              <dt className="text-muted">Status</dt>
              <dd>{STATUS_LABELS[i.status]}</dd>
              <dt className="text-muted">Raised by</dt>
              <dd>{RAISED_BY_LABELS[i.raised_by]}</dd>
              {isSupervisedType(i.type) && (
                <>
                  <dt className="text-muted">Model</dt>
                  <dd>{CLASS_MODELS[i.type]}</dd>
                </>
              )}
              <dt className="text-muted">Started</dt>
              <dd className="font-mono">{dateTime(i.started_at)}</dd>
              <dt className="text-muted">Ended</dt>
              <dd className="font-mono">{dateTime(i.ended_at)}</dd>
              <dt className="text-muted">Alarms merged</dt>
              <dd className="font-mono">{i.alarm_count}</dd>
              <dt className="text-muted">Supervised</dt>
              <dd className="flex items-center gap-2">
                <ScoreBar method="supervised" value={i.scores.supervised} threshold={i.thresholds.supervised} width={80} />
                <span className="font-mono text-[12px] whitespace-nowrap text-muted"><span className="hidden sm:inline">threshold </span>{score(i.thresholds.supervised)}</span>
              </dd>
              <dt className="text-muted">Unsupervised</dt>
              <dd className="flex items-center gap-2">
                <ScoreBar method="unsupervised" value={i.scores.unsupervised} threshold={i.thresholds.unsupervised} width={80} />
                <span className="font-mono text-[12px] whitespace-nowrap text-muted"><span className="hidden sm:inline">threshold </span>{score(i.thresholds.unsupervised)}</span>
              </dd>
              <dt className="text-muted">Reason</dt>
              <dd className="text-ink-2">{i.caption ?? NA}</dd>
            </dl>
          </Section>

          <Section title="Scores over time">
            {series && series.points.length >= 2 ? (
              <ScoreChart
                series={series}
                thresholds={i.thresholds}
                supervisedLabel={TYPE_LABELS[series.class].toLowerCase()}
              />
            ) : (
              <p className="text-[13px] text-muted">n/a: no score history was recorded for this incident.</p>
            )}
          </Section>

          <Section title="Detections at the alert">
            {i.thumbnail_url && <img src={i.thumbnail_url} alt={`Frame at the alert with detections drawn`} className="mb-3 w-full rounded-sm" />}
            {detections && detections.length > 0 ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-muted">
                    <th className="py-1 font-medium">Object</th>
                    <th className="py-1 font-medium">Track</th>
                    <th className="py-1 font-medium">Confidence</th>
                    <th className="py-1 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((d, k) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="py-1">{d.label}</td>
                      <td className="py-1 font-mono text-ink-2">{d.track_id ?? NA}</td>
                      <td className="py-1 font-mono text-ink-2">{score(d.conf)}</td>
                      <td className="py-1 text-ink-2">{d.source === 'model' ? 'Supervised model' : 'Object tracker'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-muted">n/a: no detection list was recorded for this incident.</p>
            )}
          </Section>
          <p className="px-4 py-3 font-mono text-[12px] text-muted">{i.id}</p>
        </>
      )}
    </Drawer>
  )
}
