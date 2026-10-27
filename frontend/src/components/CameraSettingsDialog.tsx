import { GraduationCap, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import {
  useLearnFromClip,
  useLibrary,
  useLiveState,
  useNormality,
  useNormalityJobs,
  useResetNormality,
  useUpdateCamera,
} from '../api/hooks'
import { THRESHOLD_LABELS } from '../lib/classes'
import { formatDuration, NA, unsupervisedState } from '../lib/format'
import { SUPERVISED_TYPES, type Camera, type ThresholdKey } from '../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Input, Select } from '../ui/Field'
import { ErrorState, ProgressBar, Skeleton } from '../ui/States'
import { useToast } from '../ui/toast-context'
import { ToggleGroup } from '../ui/ToggleGroup'

interface Props {
  camera: Camera | null
  onClose: () => void
}

/** Detection settings for one camera: pretrained models, thresholds, scene normality. */
export default function CameraSettingsDialog({ camera, onClose }: Props) {
  return (
    <Dialog
      open={!!camera}
      onClose={onClose}
      size="lg"
      title={camera ? `Detection on ${camera.name}` : 'Detection'}
      description="An alarm is raised when a score stays above its threshold for 2 s. Further alarms of the same class on this camera within 20 s are merged into it."
    >
      {camera && <Settings key={camera.id} camera={camera} />}
    </Dialog>
  )
}

function ThresholdSlider({ k, value, onCommit }: { k: ThresholdKey; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value)
  const id = `thr-${k}`
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-[150px] shrink-0 text-[13px] text-ink-2">
        {THRESHOLD_LABELS[k]}
      </label>
      <input
        id={id}
        type="range"
        min={0.05}
        max={0.99}
        step={0.01}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onCommit(v)}
        onKeyUp={() => v !== value && onCommit(v)}
        onBlur={() => v !== value && onCommit(v)}
        className="h-6 flex-1 accent-[#4c8dff]"
      />
      <span className="w-10 text-right font-mono text-[13px]">{v.toFixed(2)}</span>
    </div>
  )
}

function Settings({ camera }: { camera: Camera }) {
  const update = useUpdateCamera()
  const reset = useResetNormality()
  const learn = useLearnFromClip()
  const library = useLibrary()
  const normality = useNormality(camera.id)
  const live = useLiveState()[camera.id]
  const job = useNormalityJobs()[camera.id] ?? normality.data?.job ?? null
  const toast = useToast()
  const [heatClass, setHeatClass] = useState('')
  const [heatTick, setHeatTick] = useState(0)
  const [clip, setClip] = useState('')
  const [minutes, setMinutes] = useState(String(Math.round(camera.learn_seconds / 60)))
  const [confirmReset, setConfirmReset] = useState(false)

  const save = (input: Parameters<typeof update.mutate>[0]['input'], done?: string) =>
    update.mutate(
      { id: camera.id, input },
      {
        onSuccess: () => done && toast({ title: done, tone: 'success' }),
        onError: (err) => toast({ title: 'Not saved', description: err.message, tone: 'error' }),
      },
    )

  const unsupState = unsupervisedState(camera, live?.learning_progress)
  const learningJob = job && (job.stage === 'queued' || job.stage === 'learning')
  const n = normality.data

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="sup-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sup-title" className="text-[14px] font-semibold">
            Supervised models
          </h3>
          <ToggleGroup
            label="Supervised models"
            value={camera.supervised}
            onChange={(v) => save({ supervised: v }, v === 'on' ? 'Supervised models on' : 'Supervised models off')}
            options={[
              { id: 'on', label: 'On' },
              { id: 'off', label: 'Off' },
            ]}
          />
        </div>
        <p className="text-[12px] text-muted">
          Fight runs when two or more people are close together, car accident when vehicles are in view, fire or
          explosion once per second.
        </p>
        <div className="flex flex-col gap-1">
          {SUPERVISED_TYPES.map((k) => (
            <ThresholdSlider
              key={k}
              k={k}
              value={camera.thresholds[k]}
              onCommit={(v) => save({ thresholds: { [k]: v } }, `${THRESHOLD_LABELS[k]} threshold set to ${v.toFixed(2)}`)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="unsup-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="unsup-title" className="text-[14px] font-semibold">
            Unsupervised model <span className="ml-1 text-[13px] font-normal text-ink-2">{unsupState}</span>
          </h3>
          <ToggleGroup
            label="Unsupervised model"
            value={camera.unsupervised === 'off' ? 'off' : 'on'}
            onChange={(v) => save({ unsupervised: v === 'on' ? 'learning' : 'off' })}
            options={[
              { id: 'on', label: 'On' },
              { id: 'off', label: 'Off' },
            ]}
          />
        </div>
        <p className="text-[12px] text-muted">
          Learns from normal footage which objects appear where, their speed and direction, how many people are in
          view, how long they stay and their body poses. After learning it raises a warning for anything rare.
        </p>
        <ThresholdSlider
          k="unsupervised"
          value={camera.thresholds.unsupervised}
          onCommit={(v) => save({ thresholds: { unsupervised: v } }, `Unsupervised threshold set to ${v.toFixed(2)}`)}
        />

        {normality.error ? (
          <ErrorState title="Model data could not be loaded" error={normality.error} onRetry={() => normality.refetch()} />
        ) : normality.isLoading || !n ? (
          <Skeleton className="aspect-video w-full" />
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <figure className="flex flex-col gap-2">
              <img
                key={`${heatClass}-${heatTick}`}
                src={`/api/cameras/${camera.id}/normality/heatmap?${new URLSearchParams({ ...(heatClass && { cls: heatClass }), t: String(heatTick) })}`}
                alt={`Where ${heatClass || 'objects'} normally appear on ${camera.name}`}
                className="aspect-video w-full rounded-sm bg-video object-cover"
              />
              <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                <span>Stronger blue: where {heatClass ? `a ${heatClass}` : 'objects'} appeared more often during learning.</span>
                <Button size="sm" variant="ghost" onClick={() => setHeatTick((t) => t + 1)}>
                  Refresh
                </Button>
              </figcaption>
            </figure>
            <div className="flex flex-col gap-4 text-[13px]">
              <Field label="Show">
                {(p) => (
                  <Select {...p} value={heatClass} onChange={(e) => setHeatClass(e.target.value)} disabled={!n.classes.length}>
                    <option value="">Everything</option>
                    {n.classes.map((c) => (
                      <option key={c.cls} value={c.cls}>
                        {c.cls} ({Math.round(c.share * 100)}% of frames)
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted">Learned</dt>
                <dd className="font-mono">{formatDuration(n.seconds)}</dd>
                <dt className="text-muted">People (99th pct.)</dt>
                <dd className="font-mono">{n.people_p99 ?? NA}</dd>
                <dt className="text-muted">Poses kept</dt>
                <dd className="font-mono">{n.poses}</dd>
              </dl>
              <Field label="Learning length (minutes)" hint="Footage learned before scoring starts.">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={1440}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    onBlur={() => {
                      const s = Math.round(Number(minutes) * 60)
                      if (s >= 60 && s !== Math.round(camera.learn_seconds)) save({ learn_seconds: s }, 'Learning length saved')
                    }}
                    className="w-28"
                  />
                )}
              </Field>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h4 className="text-[13px] font-semibold">Learn from a clip</h4>
          <p className="text-[12px] text-muted">
            A library clip of the same scene with nothing unusual in it. "This is normal" on an incident adds its clip
            the same way.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Field label="Library clip">
                {(p) => (
                  <Select {...p} value={clip} onChange={(e) => setClip(e.target.value)} disabled={library.isLoading}>
                    <option value="">{library.isLoading ? 'Loading' : 'Select a clip'}</option>
                    {(library.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.dataset_name}: {v.title} ({formatDuration(v.duration_s)})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={GraduationCap}
              disabled={!clip || !!learningJob}
              loading={learn.isPending}
              onClick={() =>
                learn.mutate(
                  { id: camera.id, videoId: clip },
                  { onError: (err) => toast({ title: 'Learning not started', description: err.message, tone: 'error' }) },
                )
              }
            >
              Learn from clip
            </Button>
          </div>
          {job && (
            <div className="flex flex-col gap-1 text-[13px]" role="status">
              <span className="text-ink-2">
                {job.stage === 'done'
                  ? `Learned ${formatDuration(job.seconds_added)} from ${job.title}`
                  : job.stage === 'error'
                    ? `Learning from ${job.title} failed: ${job.error}`
                    : `Learning from ${job.title}`}
              </span>
              {learningJob && <ProgressBar value={job.progress} label={`Learning from ${job.title}`} />}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <>
              <span className="text-[13px] text-ink-2">Delete what this camera learned?</span>
              <Button
                size="sm"
                variant="primary"
                icon={RotateCcw}
                loading={reset.isPending}
                onClick={() =>
                  reset.mutate(camera.id, {
                    onSuccess: () => {
                      setConfirmReset(false)
                      normality.refetch()
                      toast({ title: `${camera.name}: learning restarted`, tone: 'success' })
                    },
                    onError: (err) => toast({ title: 'Reset failed', description: err.message, tone: 'error' }),
                  })
                }
              >
                Reset learning
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              Reset learning
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
