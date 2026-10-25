import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Camera,
  CameraInput,
  Catalog,
  Incident,
  IncidentStatus,
  LibraryJob,
  LibraryVideo,
  PipelineStatus,
} from '../types'
import { api } from './client'

export const keys = {
  cameras: ['cameras'] as const,
  incidents: ['incidents'] as const,
  status: ['status'] as const,
  library: ['library'] as const,
  catalog: ['catalog'] as const,
  jobs: ['jobs'] as const,
}

// --- queries -----------------------------------------------------------------

export const useCameras = () => useQuery({ queryKey: keys.cameras, queryFn: () => api.get<Camera[]>('/api/cameras') })

export const useIncidents = () =>
  useQuery({ queryKey: keys.incidents, queryFn: () => api.get<Incident[]>('/api/incidents') })

export const usePipelineStatus = () =>
  useQuery({ queryKey: keys.status, queryFn: () => api.get<PipelineStatus>('/api/status') })

export const useLibrary = () =>
  useQuery({ queryKey: keys.library, queryFn: () => api.get<LibraryVideo[]>('/api/library') })

export const useCatalog = () => useQuery({ queryKey: keys.catalog, queryFn: () => api.get<Catalog>('/api/library/catalog') })

export const useJobs = () => useQuery({ queryKey: keys.jobs, queryFn: () => api.get<LibraryJob[]>('/api/library/jobs') })

// --- mutations ---------------------------------------------------------------

export function useSetIncidentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: IncidentStatus }) =>
      api.patch<Incident>(`/api/incidents/${id}`, { status }),
    // Optimistic: the card leaves the queue immediately.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: keys.incidents })
      const previous = qc.getQueryData<Incident[]>(keys.incidents)
      qc.setQueryData<Incident[]>(keys.incidents, (list) => list?.map((i) => (i.id === id ? { ...i, status } : i)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => ctx?.previous && qc.setQueryData(keys.incidents, ctx.previous),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.incidents })
      qc.invalidateQueries({ queryKey: keys.cameras })
    },
  })
}

function useCameraMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.cameras })
      qc.invalidateQueries({ queryKey: keys.status })
      qc.invalidateQueries({ queryKey: keys.library })
    },
  })
}

export const useCreateCamera = () => useCameraMutation((input: CameraInput) => api.post<Camera>('/api/cameras', input))

export const useUpdateCamera = () =>
  useCameraMutation(({ id, input }: { id: string; input: Partial<CameraInput> }) =>
    api.patch<Camera>(`/api/cameras/${id}`, input),
  )

export const useDeleteCamera = () => useCameraMutation((id: string) => api.delete(`/api/cameras/${id}`))

export const useRestartCamera = () => useCameraMutation((id: string) => api.post<Camera>(`/api/cameras/${id}/restart`))

function useLibraryMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.jobs })
      qc.invalidateQueries({ queryKey: keys.catalog })
      qc.invalidateQueries({ queryKey: keys.library })
    },
  })
}

export const useDownloadDataset = () =>
  useLibraryMutation((datasetId: string) => api.post<LibraryJob>('/api/library/download', { dataset_id: datasetId }))

export const useDownloadUrl = () =>
  useLibraryMutation((body: { url: string; title?: string; anomaly_types: string[] }) =>
    api.post<LibraryJob>('/api/library/download', body),
  )

export const useUploadVideos = () =>
  useLibraryMutation(({ files, anomalyTypes }: { files: File[]; anomalyTypes: string[] }) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (anomalyTypes.length) form.append('anomaly_types', anomalyTypes.join(','))
    return api.post<LibraryJob[]>('/api/library/upload', form)
  })

export const useDeleteVideo = () => useLibraryMutation((id: string) => api.delete(`/api/library/${id}`))
