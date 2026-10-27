import { useModels } from '../api/hooks'
import { formatBytes, NA } from '../lib/format'
import type { ModelInfo } from '../types'
import { PageBar, Panel, PanelHeader } from '../ui/Panel'
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '../ui/States'
import StatusDot from '../ui/StatusDot'

const FAMILY: Record<ModelInfo['family'], string> = {
  base: 'Shared',
  pretrained: 'Supervised, pretrained',
  thesis: 'Supervised, thesis',
}

function status(m: ModelInfo): { label: string; color: string; active: boolean } {
  if (m.loaded) return { label: 'Loaded', color: 'var(--color-ok)', active: true }
  if (!m.downloaded) return { label: 'Not downloaded', color: 'var(--color-warn)', active: true }
  if (m.error) return { label: 'Load failed', color: 'var(--color-crit)', active: true }
  return { label: 'Loading', color: 'var(--color-muted)', active: false }
}

export default function TrainingPage() {
  const models = useModels()
  const d = models.data
  const gpu = d?.gpu
  const fb = d?.feedback ?? {}

  return (
    <>
      <PageBar>
        Models used by the analysis and the review labels collected for retraining. Weights are downloaded with{' '}
        <span className="font-mono">backend\scripts\download_models.py</span>
        {d && (
          <>
            ; links and licenses checked on <span className="font-mono">{d.verified_at}</span>
          </>
        )}
        .
      </PageBar>
      <div className="flex flex-col gap-4 p-4">
        <Panel>
          <PanelHeader
            title="Models"
            description={d ? `${d.models.filter((m) => m.loaded).length} of ${d.models.length} loaded` : undefined}
            actions={
              gpu && (
                <div className="flex w-[360px] max-w-full flex-col gap-1">
                  <div className="flex justify-between gap-3 text-[12px] whitespace-nowrap">
                    <span className="truncate text-muted">{gpu.name}</span>
                    <span className="font-mono text-ink-2">
                      {(gpu.used_mb / 1024).toFixed(1)}/{(gpu.total_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <ProgressBar value={gpu.used_mb / gpu.total_mb} label="GPU memory in use, all programs" />
                </div>
              )
            }
          />
          {models.error ? (
            <ErrorState title="Models could not be loaded" error={models.error} onRetry={() => models.refetch()} />
          ) : models.isLoading ? (
            <div className="flex flex-col gap-px" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-10 rounded-none" />
              ))}
            </div>
          ) : !d?.models.length ? (
            <EmptyState title="No models listed" description="backend/models/models.json is empty. Restore it from the repository." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className="h-8 border-b border-line text-left text-[12px] text-ink-2">
                    <th className="px-3 font-medium">Model</th>
                    <th className="px-3 font-medium">Type</th>
                    <th className="px-3 font-medium">Used for</th>
                    <th className="px-3 font-medium">Status</th>
                    <th className="px-3 font-medium">Device</th>
                    <th className="px-3 text-right font-medium">VRAM</th>
                    <th className="px-3 text-right font-medium">Weights</th>
                    <th className="px-3 font-medium">License</th>
                  </tr>
                </thead>
                <tbody>
                  {d.models.map((m) => {
                    const s = status(m)
                    return (
                      <tr key={m.id} className="h-8 border-b border-line last:border-0 hover:bg-raised">
                        <td className="px-3">
                          <a href={m.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                            {m.name}
                          </a>
                        </td>
                        <td className="px-3 text-ink-2">{FAMILY[m.family]}</td>
                        <td className="max-w-[320px] truncate px-3 text-ink-2" title={m.role}>
                          {m.role}
                        </td>
                        <td className="px-3" title={m.error ?? undefined}>
                          <span className="flex items-center gap-1.5">
                            <StatusDot color={s.color} active={s.active} size={6} />
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 font-mono text-ink-2">{m.device ? (m.device === 'cuda' ? 'GPU' : 'CPU') : NA}</td>
                        <td className="px-3 text-right font-mono text-ink-2">
                          {m.vram_mb === null ? NA : `${Math.max(1, Math.round(m.vram_mb))} MB`}
                        </td>
                        <td className="px-3 text-right font-mono text-ink-2">{formatBytes(m.size_bytes)}</td>
                        <td className="px-3">
                          <a href={m.license_url} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-ink hover:underline">
                            {m.license}
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Review labels" description="Kept with their clips in data/incidents for the next training run." />
          <dl className="flex flex-wrap gap-x-8 gap-y-2 px-3 py-3 text-[13px]">
            {(
              [
                ['confirmed', 'Confirmed'],
                ['false_alarm', 'False alarm'],
                ['normal', 'Marked normal'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-baseline gap-2">
                <dt className="text-muted">{label}</dt>
                <dd className="font-mono text-[16px] text-ink">{d ? (fb[k] ?? 0) : NA}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  )
}
