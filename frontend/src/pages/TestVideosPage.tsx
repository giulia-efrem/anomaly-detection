import { useState } from 'react'
import { useCatalog, useJobs, useLibrary, usePipelineStatus } from '../api/hooks'
import CameraDialog from '../components/CameraDialog'
import AddVideo from '../components/library/AddVideo'
import ClipBrowser from '../components/library/ClipBrowser'
import DatasetCard from '../components/library/DatasetCard'
import JobProgress from '../components/library/JobProgress'
import { PageHeader, Panel } from '../ui/Panel'
import { ErrorState, Skeleton } from '../ui/States'
import { Tabs } from '../ui/Tabs'
import { tabPanelProps } from '../ui/tabPanelProps'

type Tab = 'datasets' | 'clips' | 'add'

export default function TestVideosPage() {
  const catalog = useCatalog()
  const library = useLibrary()
  const jobs = useJobs()
  const status = usePipelineStatus()
  const [tab, setTab] = useState<Tab>('datasets')
  const [dataset, setDataset] = useState('')
  const [cameraFor, setCameraFor] = useState<string | null>(null)

  const typeLabels = catalog.data?.anomaly_types ?? {}
  const slots = status.data?.camera_slots
  const slotsLeft = slots ? slots.total - slots.used : 0
  // Uploads and links have no dataset card, so show their progress here.
  const otherJobs = (jobs.data ?? []).filter((j) => j.kind !== 'dataset' && j.stage !== 'done')

  return (
    <>
      <PageHeader
        title="Test videos"
        description={
          <>
            Public footage with fights, car crashes, fires and unusual motion, plus normal scenes to learn from. Download one, play the clips, and turn
            any clip into a virtual camera that loops like a live feed.
            {catalog.data && ` Links and licenses checked on ${catalog.data.verified_at}.`}
          </>
        }
      />
      <div className="flex flex-col gap-4 px-6 pb-8">
        <Tabs
          idBase="videos"
          label="Test videos"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'datasets', label: 'Datasets', count: catalog.data?.datasets.length },
            { id: 'clips', label: 'Clips', count: library.data?.length },
            { id: 'add', label: 'Add your own' },
          ]}
          className="self-start"
        />

        {otherJobs.length > 0 && (
          <Panel className="flex flex-col gap-4 p-4" aria-label="Uploads in progress">
            {otherJobs.map((j) => (
              <div key={j.id} className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold">{j.label}</span>
                {j.stage === 'error' ? (
                  <span role="alert" className="text-[13px] text-[#FFB0A6]">Failed: {j.error}</span>
                ) : (
                  <JobProgress job={j} />
                )}
              </div>
            ))}
          </Panel>
        )}

        <div {...tabPanelProps('videos', tab)}>
          {tab === 'datasets' &&
            (catalog.error ? (
              <Panel>
                <ErrorState title="Couldn't load the catalog" error={catalog.error} onRetry={() => catalog.refetch()} />
              </Panel>
            ) : catalog.isLoading || !catalog.data ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-[380px] rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {catalog.data.datasets.map((d) => (
                    <DatasetCard
                      key={d.id}
                      dataset={d}
                      typeLabels={typeLabels}
                      onBrowse={(id) => {
                        setDataset(id)
                        setTab('clips')
                      }}
                    />
                  ))}
                </div>
                {catalog.data.excluded.length > 0 && (
                  <p className="text-[13px] text-muted">
                    Left out:{' '}
                    {catalog.data.excluded.map((x) => (
                      <span key={x.name}>
                        <a href={x.source_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
                          {x.name}
                        </a>{' '}
                        ({x.reason})
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ))}

          {tab === 'clips' && (
            <ClipBrowser
              typeLabels={typeLabels}
              dataset={dataset}
              onDatasetChange={setDataset}
              onUseAsCamera={(v) => setCameraFor(v.id)}
              slotsLeft={slotsLeft}
              onGoToDatasets={() => setTab('datasets')}
            />
          )}

          {tab === 'add' && <AddVideo typeLabels={typeLabels} />}
        </div>
      </div>
      <CameraDialog open={!!cameraFor} onClose={() => setCameraFor(null)} videoId={cameraFor ?? undefined} />
    </>
  )
}
