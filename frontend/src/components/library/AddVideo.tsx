import { Link2, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useDownloadUrl, useUploadVideos } from '../../api/hooks'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Field, Input, Select } from '../../ui/Field'
import { Card } from '../../ui/Panel'
import { useToast } from '../../ui/toast-context'

const ACCEPT = '.mp4,.avi,.mov,.mkv,.mpg,.mpeg,.webm,.m4v,.wmv,video/*'

function TypeSelect({ value, onChange, typeLabels, id, ...rest }: {
  value: string
  onChange: (v: string) => void
  typeLabels: Record<string, string>
  id: string
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {Object.entries(typeLabels).map(([k, label]) => (
        <option key={k} value={k}>{label}</option>
      ))}
    </Select>
  )
}

export default function AddVideo({ typeLabels }: { typeLabels: Record<string, string> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <UploadCard typeLabels={typeLabels} />
      <UrlCard typeLabels={typeLabels} />
    </div>
  )
}

function UploadCard({ typeLabels }: { typeLabels: Record<string, string> }) {
  const upload = useUploadVideos()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [type, setType] = useState('normal')
  const [dragging, setDragging] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('video/') || /\.(mp4|avi|mov|mkv|mpe?g|webm|m4v|wmv)$/i.test(f.name)))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!files.length) return
    upload.mutate(
      { files, anomalyTypes: [type] },
      {
        onSuccess: (jobs) => {
          toast({ title: `Uploading ${jobs.length} ${jobs.length === 1 ? 'video' : 'videos'}`, description: 'They appear under Clips once converted.', tone: 'success' })
          setFiles([])
          if (input.current) input.current.value = ''
        },
        onError: (err) => toast({ title: 'Upload failed', description: err.message, tone: 'error' }),
      },
    )
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h3 className="text-[16px] font-semibold">Upload video files</h3>
          <p className="text-[13px] text-muted">MP4, AVI, MOV, MKV and more. Converted to H.264 with a thumbnail.</p>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
            'focus-within:ring-2 focus-within:ring-unsup',
            dragging ? 'border-unsup bg-raised' : 'border-[#2C3F59] hover:border-[#3E5470] hover:bg-[#13202F]',
          )}
        >
          <Upload size={22} className="text-ink-2" aria-hidden="true" />
          <span className="text-[14px] font-semibold">
            {files.length ? files.map((f) => f.name).join(', ') : 'Drop videos here or choose files'}
          </span>
          <span className="text-[12px] text-muted">
            {files.length ? `${files.length} selected` : 'Several files at once are fine'}
          </span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </label>
        <Field label="What happens in these videos">
          {(p) => <TypeSelect {...p} value={type} onChange={setType} typeLabels={typeLabels} />}
        </Field>
        <Button type="submit" variant="primary" icon={Upload} loading={upload.isPending} disabled={!files.length} className="self-start">
          Upload
        </Button>
      </form>
    </Card>
  )
}

function UrlCard({ typeLabels }: { typeLabels: Record<string, string> }) {
  const download = useDownloadUrl()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState('normal')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    download.mutate(
      { url: url.trim(), title: title.trim() || undefined, anomaly_types: [type] },
      {
        onSuccess: (job) => {
          toast({ title: `Downloading ${job.label}`, description: 'It appears under Clips once converted.', tone: 'success' })
          setUrl('')
          setTitle('')
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <h3 className="text-[16px] font-semibold">Add from a link</h3>
          <p className="text-[13px] text-muted">A direct link to a video file, not a YouTube or streaming page.</p>
        </div>
        <Field label="Video link" error={error}>
          {(p) => (
            <Input {...p} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/clip.mp4" inputMode="url" />
          )}
        </Field>
        <Field label="Title" hint="Optional. The file name is used otherwise.">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />}
        </Field>
        <Field label="What happens in this video">
          {(p) => <TypeSelect {...p} value={type} onChange={setType} typeLabels={typeLabels} />}
        </Field>
        <Button type="submit" variant="primary" icon={Link2} loading={download.isPending} disabled={!url.trim()} className="self-start">
          Download
        </Button>
      </form>
    </Card>
  )
}
