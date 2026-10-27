import { formatBytes } from '../../lib/format'
import type { LibraryJob } from '../../types'
import { ProgressBar } from '../../ui/States'

const STAGE_TEXT: Record<LibraryJob['stage'], string> = {
  queued: 'Waiting',
  downloading: 'Downloading',
  extracting: 'Extracting',
  converting: 'Converting to H.264',
  done: 'Done',
  error: 'Failed',
}

function jobDetail(job: LibraryJob): string {
  if (job.stage === 'downloading') {
    return job.bytes_total
      ? `${formatBytes(job.bytes_done)} of ${formatBytes(job.bytes_total)}`
      : formatBytes(job.bytes_done)
  }
  if (job.stage === 'converting' && job.items_total > 1) return `${job.items_done} of ${job.items_total} clips`
  if (job.stage === 'done') return `${job.clips_added} ${job.clips_added === 1 ? 'clip' : 'clips'} added`
  return ''
}

export default function JobProgress({ job }: { job: LibraryJob }) {
  const indeterminate = job.stage === 'extracting' || job.stage === 'queued' || (job.stage === 'downloading' && !job.bytes_total)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-ink-2">{STAGE_TEXT[job.stage]}</span>
        <span className="font-mono text-muted">
          {jobDetail(job)}
          {!indeterminate && job.stage !== 'done' && ` · ${Math.round(job.progress * 100)}%`}
        </span>
      </div>
      <ProgressBar value={indeterminate ? null : job.progress} label={`${job.label}: ${STAGE_TEXT[job.stage]}`} />
    </div>
  )
}
