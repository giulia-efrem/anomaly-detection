import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Camera,
  CameraInput,
  CameraLive,
  CameraSettings,
  Catalog,
  Incident,
  IncidentStatus,
  LibraryJob,
  LibraryVideo,
  ModelsStatus,
  NormalityJob,
  NormalitySummary,
  PipelineStatus,
  SystemStatus,
} from '../types'
import { api } from './client'

export const keys = {
  cameras: ['cameras'] as const,
  incidents: ['incidents'] as const,
  status: ['status'] as const,
  library: ['library'] as const,
  catalog: ['catalog'] as const,
  jobs: ['jobs'] as const,
  models: ['models'] as const,
  system: ['system'] as const,
  normality: (cameraId: string) => ['normality', cameraId] as const,
  /** Filled only by WebSocket events, never fetched. */
  live: ['live'] as const,
  normalityJobs: ['normality-jobs'] as const,
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

/** Status bar and health. Polled: GPU load changes without any event. */
export const useSystem = () =>
  useQuery({ queryKey: keys.system, queryFn: () => api.get<SystemStatus>('/api/system'), refetchInterval: 5_000 })

export const useModels = () =>
  useQuery({ queryKey: keys.models, queryFn: () => api.get<ModelsStatus>('/api/models'), refetchInterval: 10_000 })

export const useNormality = (cameraId: string | undefined) =>
  useQuery({
    queryKey: keys.normality(cameraId ?? ''),
    queryFn: () => api.get<NormalitySummary>(`/api/cameras/${cameraId}/normality`),
    enabled: !!cameraId,
  })

const noFetch = () => ({})

/** Per-camera live state pushed over the WebSocket ("camera.live"). */
export const useLiveState = () =>
  useQuery<Record<string, CameraLive>>({ queryKey: keys.live, queryFn: noFetch, enabled: false, initialData: {} }).data

/** Learning-from-clip jobs per camera ("normality.job"). */
export const useNormalityJobs = () =>
  useQuery<Record<string, NormalityJob>>({ queryKey: keys.normalityJobs, queryFn: noFetch, enabled: false, initialData: {} })
    .data

// --- mutations ---------------------------------------------------------------

export function useMarkNormal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Incident>(`/api/incidents/${id}/normal`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.incidents })
      qc.invalidateQueries({ queryKey: keys.cameras })
    },
  })
}

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
  useCameraMutation(({ id, input }: { id: string; input: Partial<CameraInput> & CameraSettings }) =>
    api.patch<Camera>(`/api/cameras/${id}`, input),
  )

export const useResetNormality = () =>
  useCameraMutation((id: string) => api.post<Camera>(`/api/cameras/${id}/normality/reset`))

export const useLearnFromClip = () =>
  useCameraMutation(({ id, videoId }: { id: string; videoId: string }) =>
    api.post<NormalityJob>(`/api/cameras/${id}/normality/learn`, { library_video_id: videoId }),
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
