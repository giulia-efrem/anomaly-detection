import { Boxes, ExternalLink } from 'lucide-react'
import { useModels } from '../api/hooks'
import { formatBytes } from '../lib/format'
import type { ModelInfo } from '../types'
import { Chip } from '../ui/Chip'
import { PageHeader, Panel, PanelHeader } from '../ui/Panel'
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '../ui/States'
import StatusDot from '../ui/StatusDot'

const FAMILY: Record<ModelInfo['family'], string> = {
  base: 'Shared',
  pretrained: 'Pretrained',
  thesis: 'Thesis model',
}

function status(m: ModelInfo): { label: string; color: string; active: boolean } {
  if (m.loaded) return { label: 'Loaded', color: 'var(--color-healthy)', active: true }
  if (!m.downloaded) return { label: 'Not downloaded', color: 'var(--color-muted)', active: false }
  if (m.error) return { label: 'Failed to load', color: 'var(--color-muted)', active: false }
  return { label: 'Loading', color: 'var(--color-muted)', active: false }
}

function ModelRow({ m }: { m: ModelInfo }) {
  const s = status(m)
  return (
    <li className="grid gap-x-6 gap-y-2 rounded-lg p-3 transition-colors hover:bg-[#142133] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold">{m.name}</h3>
          <Chip dot={m.family === 'pretrained' ? 'var(--color-sup)' : undefined}>{FAMILY[m.family]}</Chip>
        </div>
        <p className="text-[13px] text-ink-2">{m.role}</p>
        {m.error && !m.loaded && <p className="mt-1 text-[12px] text-[#FFB0A6]">{m.error}</p>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 text-[13px]">
        <dt className="text-muted">Status</dt>
        <dd className="flex items-center gap-2">
          <StatusDot color={s.color} active={s.active} size={7} />
          {s.label}
        </dd>
        <dt className="text-muted">Runs on</dt>
        <dd className="font-cond">{m.device ? (m.device === 'cuda' ? 'GPU' : 'CPU') : 'n/a'}</dd>
        <dt className="text-muted">Memory</dt>
        <dd className="font-cond">{m.vram_mb === null ? 'n/a' : `${Math.max(1, Math.round(m.vram_mb))} MB of VRAM`}</dd>
      </dl>
      <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 text-[13px]">
        <dt className="text-muted">License</dt>
        <dd>
          <a href={m.license_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
            {m.license}
          </a>
        </dd>
        <dt className="text-muted">Weights</dt>
        <dd className="font-cond">{formatBytes(m.size_bytes)}</dd>
        <dt className="text-muted">Source</dt>
        <dd>
          <a
            href={m.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:text-ink hover:underline"
          >
            Model page
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </dd>
      </dl>
    </li>
  )
}

export default function TrainingPage() {
  const models = useModels()
  const d = models.data
  const gpu = d?.gpu
  const fb = d?.feedback ?? {}

  return (
    <>
      <PageHeader
        title="Training"
        description="The models behind the detectors, and the labels your reviews collect for retraining. The thesis model will be added here as one more plugin."
      />
      <div className="flex flex-col gap-6 px-6 pb-8">
        <Panel className="p-4">
          <PanelHeader
            className="px-2 pb-2"
            title="Models"
            description={
              d
                ? `${d.models.filter((m) => m.loaded).length} of ${d.models.length} loaded${d.ready ? '' : ', still loading'}. Links and licenses checked on ${d.verified_at}. Re-download with backend\\scripts\\download_models.py.`
                : undefined
            }
          />
          {models.error ? (
            <ErrorState title="Couldn't load the models" error={models.error} onRetry={() => models.refetch()} />
          ) : models.isLoading ? (
            <div className="flex flex-col gap-2 p-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[76px]" />
              ))}
            </div>
          ) : !d?.models.length ? (
            <EmptyState
              icon={Boxes}
              title="No models listed"
              description="backend/models/models.json is empty. Restore it from the repository and run scripts/download_models.py."
            />
          ) : (
            <>
              {gpu && (
                <div className="mx-2 mb-4 flex flex-col gap-2 rounded-lg bg-card p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-[13px]">
                    <span className="text-ink-2">{gpu.name}</span>
                    <span className="font-cond text-muted">
                      {(gpu.used_mb / 1024).toFixed(1)} of {(gpu.total_mb / 1024).toFixed(1)} GB in use (all programs)
                    </span>
                  </div>
                  <ProgressBar value={gpu.used_mb / gpu.total_mb} label="GPU memory in use" />
                </div>
              )}
              <ul className="flex flex-col">
                {d.models.map((m) => (
                  <ModelRow key={m.id} m={m} />
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel className="p-6">
          <PanelHeader
            title="Labels collected"
            description="Every review decision is kept with its clip in data/incidents for the next training run."
          />
          <dl className="mt-4 grid grid-cols-3 gap-4 sm:max-w-[520px]">
            {(
              [
                ['confirmed', 'Confirmed'],
                ['false_alarm', 'False alarms'],
                ['normal', 'Marked normal'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="rounded-lg bg-card p-3">
                <dt className="text-[13px] text-muted">{label}</dt>
                <dd className="font-cond text-[24px] leading-8 font-medium">{models.isLoading ? '–' : (fb[k] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  )
}
