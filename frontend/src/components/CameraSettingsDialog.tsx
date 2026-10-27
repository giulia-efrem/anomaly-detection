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
import { CLASS_COLORS, SCENE_COLOR, THRESHOLD_LABELS } from '../lib/classes'
import { formatDuration, unsupervisedChip } from '../lib/format'
import { SUPERVISED_TYPES, type Camera, type ThresholdKey } from '../types'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
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
      description="Alerts fire when a score stays above its threshold for about 2 seconds; then the camera and class stay quiet for 20 seconds."
    >
      {camera && <Settings key={camera.id} camera={camera} />}
    </Dialog>
  )
}

function ThresholdSlider({ k, value, onCommit }: { k: ThresholdKey; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value)
  const color = k === 'unsupervised' ? SCENE_COLOR : CLASS_COLORS[k]
  const id = `thr-${k}`
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex w-[150px] shrink-0 items-center gap-2 text-[13px] text-ink-2">
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
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
        className="h-8 flex-1 accent-[#C3CFDC]"
      />
      <span className="w-10 text-right font-cond text-[13px]">{v.toFixed(2)}</span>
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
        onError: (err) => toast({ title: "Couldn't save", description: err.message, tone: 'error' }),
      },
    )

  const chip = unsupervisedChip(camera, live?.learning_progress)
  const learningJob = job && (job.stage === 'queued' || job.stage === 'learning')
  const n = normality.data

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="sup-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sup-title" className="text-[15px] font-semibold">
            Pretrained models
          </h3>
          <ToggleGroup
            label="Pretrained models"
            value={camera.supervised}
            onChange={(v) => save({ supervised: v }, v === 'on' ? 'Pretrained models on' : 'Pretrained models off')}
            options={[
              { id: 'on', label: 'On' },
              { id: 'off', label: 'Off' },
            ]}
          />
        </div>
        <p className="text-[13px] text-muted">
          Each model runs only when it makes sense: fight when two or more people are close, crash when vehicles are
          in view, the gun detector when a person is in view, the fire detector once a second.
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

      <section className="flex flex-col gap-4" aria-labelledby="unsup-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="unsup-title" className="flex items-center gap-2 text-[15px] font-semibold">
            Scene normality
            <Chip dot="var(--color-unsup)" active={chip.active}>
              {chip.label}
            </Chip>
          </h3>
          <ToggleGroup
            label="Scene normality"
            value={camera.unsupervised === 'off' ? 'off' : 'on'}
            onChange={(v) => save({ unsupervised: v === 'on' ? 'learning' : 'off' })}
            options={[
              { id: 'on', label: 'On' },
              { id: 'off', label: 'Off' },
            ]}
          />
        </div>
        <p className="text-[13px] text-muted">
          Learns what is normal for this camera: which objects appear where, how fast and in which direction they move,
          how many people are usually in view, how long they stay, and the usual body poses. After learning it flags
          anything rare and says why.
        </p>
        <ThresholdSlider
          k="unsupervised"
          value={camera.thresholds.unsupervised}
          onCommit={(v) => save({ thresholds: { unsupervised: v } }, `Scene normality threshold set to ${v.toFixed(2)}`)}
        />

        {normality.error ? (
          <ErrorState title="Couldn't load what this camera learned" error={normality.error} onRetry={() => normality.refetch()} />
        ) : normality.isLoading || !n ? (
          <Skeleton className="aspect-video w-full rounded-xl" />
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <figure className="flex flex-col gap-2">
              <img
                key={`${heatClass}-${heatTick}`}
                src={`/api/cameras/${camera.id}/normality/heatmap?${new URLSearchParams({ ...(heatClass && { cls: heatClass }), t: String(heatTick) })}`}
                alt={`Where ${heatClass || 'objects'} normally appear on ${camera.name}`}
                className="aspect-video w-full rounded-xl bg-video object-cover"
              />
              <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                <span>Brighter cells: where {heatClass ? `a ${heatClass}` : 'something'} was seen more often while learning.</span>
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
                <dd className="font-cond">{formatDuration(n.seconds)} of footage</dd>
                <dt className="text-muted">Usually</dt>
                <dd className="font-cond">{n.people_p99 === null ? 'n/a' : `at most ${n.people_p99} people`}</dd>
                <dt className="text-muted">Poses</dt>
                <dd className="font-cond">{n.poses} kept</dd>
              </dl>
              <Field label="Learning length (minutes)" hint="A new camera learns this long before it starts scoring.">
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

        <div className="flex flex-col gap-2 rounded-xl bg-card p-4">
          <h4 className="text-[14px] font-semibold">Teach it normal footage</h4>
          <p className="text-[13px] text-muted">
            Add a library clip of the same scene with nothing unusual in it. It is analysed faster than real time. Use
            "This is normal" on an incident to add its clip the same way.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Field label="Library clip">
                {(p) => (
                  <Select {...p} value={clip} onChange={(e) => setClip(e.target.value)} disabled={library.isLoading}>
                    <option value="">{library.isLoading ? 'Loading videos' : 'Choose a clip of normal footage'}</option>
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
                  { onError: (err) => toast({ title: "Couldn't start learning", description: err.message, tone: 'error' }) },
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
              <span className="text-[13px] text-ink-2">Forget everything this camera learned?</span>
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
                      toast({ title: `${camera.name} is learning again`, tone: 'success' })
                    },
                    onError: (err) => toast({ title: "Couldn't reset", description: err.message, tone: 'error' }),
                  })
                }
              >
                Forget and relearn
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              Forget and relearn
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
