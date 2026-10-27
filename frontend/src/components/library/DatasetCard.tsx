import { CircleCheck, Download, ExternalLink, Film, RefreshCw } from 'lucide-react'
import { useDownloadDataset } from '../../api/hooks'
import { formatBytes } from '../../lib/format'
import type { CatalogDataset } from '../../types'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { Card } from '../../ui/Panel'
import { useToast } from '../../ui/toast-context'
import JobProgress from './JobProgress'

interface DatasetCardProps {
  dataset: CatalogDataset
  typeLabels: Record<string, string>
  onBrowse: (datasetId: string) => void
}

export default function DatasetCard({ dataset: d, typeLabels, onBrowse }: DatasetCardProps) {
  const download = useDownloadDataset()
  const toast = useToast()
  const job = d.job
  const busy = !!job && job.stage !== 'done' && job.stage !== 'error'
  const complete = d.clips_imported >= d.clip_count

  const start = () =>
    download.mutate(d.id, {
      onError: (err) => toast({ title: `${d.name}: download not started`, description: err.message, tone: 'error' }),
    })

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-[14px] font-semibold">{d.name}</h3>
        <div className="flex flex-wrap gap-1">
          {d.anomaly_types.map((t) => (
            <Chip key={t}>{typeLabels[t] ?? t}</Chip>
          ))}
          {d.has_normal && <Chip className="text-muted">Includes normal footage</Chip>}
        </div>
      </div>

      <p className="text-[13px] text-ink-2">{d.description}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-muted">Size</dt>
        <dd className="font-mono">
          {formatBytes(d.size_bytes)}, {d.clip_count} clips
        </dd>
        <dt className="text-muted">License</dt>
        <dd>
          {d.license_url ? (
            <a href={d.license_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
              {d.license}
            </a>
          ) : (
            d.license
          )}
        </dd>
        <dt className="text-muted">Cite</dt>
        <dd className="text-ink-2">{d.citation}</dd>
      </dl>

      {d.credits.length > 0 && (
        <details className="group text-[13px]">
          <summary className="w-fit rounded-md text-ink-2 hover:text-ink">Credits for each clip</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {d.credits.map((c) => (
              <li key={c.page_url} className="text-ink-2">
                <a href={c.page_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
                  {c.title}
                </a>
                <span className="text-muted">
                  {' '}
                  by {c.author}, {c.license}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-auto flex flex-col gap-4">
        {busy && job && <JobProgress job={job} />}
        {job?.stage === 'error' && (
          <p role="alert" className="rounded-md border border-crit px-3 py-2 text-[13px] text-crit">
            Download failed: {job.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {complete ? (
            <>
              <span className="mr-auto flex items-center gap-2 text-[13px] text-ink-2">
                <CircleCheck size={16} className="text-ok" aria-hidden="true" />
                {d.clips_imported} clips in the library
              </span>
              <Button size="sm" icon={Film} onClick={() => onBrowse(d.id)}>
                Browse clips
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={job?.stage === 'error' ? RefreshCw : Download}
              loading={busy || download.isPending}
              onClick={start}
            >
              {busy ? 'Working' : job?.stage === 'error' ? 'Try again' : d.clips_imported > 0 ? 'Resume download' : `Download ${formatBytes(d.size_bytes)}`}
            </Button>
          )}
          <a
            href={d.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            Source
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </Card>
  )
}
