import { useState, type FormEvent } from 'react'
import { useCreateCamera, useLibrary, useUpdateCamera } from '../api/hooks'
import { formatDuration, SOURCE_LABELS } from '../lib/format'
import type { Camera, CameraInput, LibraryVideo, SourceType } from '../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Input, Select } from '../ui/Field'
import { useToast } from '../ui/toast-context'
import { ToggleGroup } from '../ui/ToggleGroup'

interface CameraDialogProps {
  open: boolean
  onClose: () => void
  /** Edit this camera; omit to add a new one. */
  camera?: Camera
  /** Preselect a library video (from "Use as camera"). */
  videoId?: string
}

function groupByDataset(videos: LibraryVideo[]): [string, LibraryVideo[]][] {
  const groups = new Map<string, LibraryVideo[]>()
  for (const v of videos) {
    const key = v.dataset_name ?? 'Other'
    groups.set(key, [...(groups.get(key) ?? []), v])
  }
  // Joined reels first: they make the most convincing virtual cameras.
  for (const list of groups.values()) list.sort((a, b) => Number(b.origin === 'reel') - Number(a.origin === 'reel'))
  return [...groups.entries()]
}

export default function CameraDialog({ open, onClose, camera, videoId }: CameraDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={camera ? `Edit ${camera.name}` : 'Add camera'}
      description={camera ? `Camera id ${camera.id}` : 'A camera can be an RTSP stream, a webcam or a video file that loops like a live feed.'}
    >
      {/* Remount the form each time so it starts from the camera's current values. */}
      {open && <CameraForm camera={camera} videoId={videoId} onDone={onClose} />}
    </Dialog>
  )
}

function CameraForm({ camera, videoId, onDone }: { camera?: Camera; videoId?: string; onDone: () => void }) {
  const library = useLibrary()
  const create = useCreateCamera()
  const update = useUpdateCamera()
  const toast = useToast()
  const preset = videoId ? library.data?.find((v) => v.id === videoId) : undefined

  const [name, setName] = useState(camera?.name ?? preset?.title.split(':')[0] ?? '')
  const [sourceType, setSourceType] = useState<SourceType>(camera?.source_type ?? 'file')
  const [selectedVideo, setSelectedVideo] = useState(camera?.library_video_id ?? videoId ?? '')
  const [filePath, setFilePath] = useState(camera?.source_type === 'file' && !camera.library_video_id ? camera.source : '')
  const [url, setUrl] = useState(camera?.source_type === 'rtsp' ? camera.source : '')
  const [webcam, setWebcam] = useState(camera?.source_type === 'webcam' ? camera.source : '0')
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const input: CameraInput = { name: name.trim(), source_type: sourceType }
    if (sourceType === 'file') {
      if (selectedVideo) input.library_video_id = selectedVideo
      else input.source = filePath.trim()
    } else if (sourceType === 'rtsp') {
      input.source = url.trim()
    } else {
      input.source = webcam.trim()
    }
    const done = (c: Camera) => {
      toast({ title: camera ? `${c.name} saved` : `${c.name} added`, tone: 'success' })
      onDone()
    }
    const fail = (err: Error) => setError(err.message)
    if (camera) update.mutate({ id: camera.id, input }, { onSuccess: done, onError: fail })
    else create.mutate(input, { onSuccess: done, onError: fail })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Field label="Name">
        {(p) => (
          <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Front entrance" required maxLength={60} autoFocus />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">Source</span>
        <ToggleGroup
          label="Source type"
          value={sourceType}
          onChange={setSourceType}
          options={(Object.keys(SOURCE_LABELS) as SourceType[]).map((k) => ({ id: k, label: SOURCE_LABELS[k] }))}
        />
      </div>

      {sourceType === 'file' && (
        <>
          <Field
            label="Video from the library"
            hint={
              library.isError
                ? 'The library could not be loaded.'
                : library.data?.length === 0
                  ? 'The library is empty. Download a dataset or upload a video on the Test videos page.'
                  : 'The video loops forever, like a live camera.'
            }
          >
            {(p) => (
              <Select {...p} value={selectedVideo} onChange={(e) => setSelectedVideo(e.target.value)} disabled={library.isLoading}>
                <option value="">{library.isLoading ? 'Loading videos' : 'Choose a video, or enter a path below'}</option>
                {groupByDataset(library.data ?? []).map(([group, videos]) => (
                  <optgroup key={group} label={group}>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} ({formatDuration(v.duration_s)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          {!selectedVideo && (
            <Field label="Or a file path" hint="Absolute, or relative to the data folder.">
              {(p) => (
                <Input {...p} value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="C:\videos\entrance.mp4" />
              )}
            </Field>
          )}
        </>
      )}

      {sourceType === 'rtsp' && (
        <Field label="Stream address" hint="RTSP or HTTP, with user and password if the camera needs them.">
          {(p) => (
            <Input
              {...p}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="rtsp://user:password@192.168.1.20:554/stream1"
              inputMode="url"
            />
          )}
        </Field>
      )}

      {sourceType === 'webcam' && (
        <Field label="Webcam number" hint="0 is the built-in camera; external webcams are usually 1 or 2.">
          {(p) => (
            <Input {...p} value={webcam} onChange={(e) => setWebcam(e.target.value)} inputMode="numeric" className="w-24" />
          )}
        </Field>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-crit px-3 py-2 text-[13px] text-crit">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>
          {camera ? 'Save changes' : 'Add camera'}
        </Button>
      </div>
    </form>
  )
}
