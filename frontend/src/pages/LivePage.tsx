import { ChevronLeft, ChevronRight, Grid2x2, Grid3x3, Layers, LayoutGrid, Plus, Siren, Square } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCameras, useIncidents, useLiveState, usePipelineStatus } from '../api/hooks'
import AlarmQueue from '../components/AlarmQueue'
import CameraDialog from '../components/CameraDialog'
import IncidentDrawer from '../components/IncidentDrawer'
import { useIncidentDecision, useMarkNormalDecision } from '../components/useIncidentDecision'
import VideoTile from '../components/VideoTile'
import { liveAnomalies } from '../lib/live'
import { useNow } from '../lib/useNow'
import { usePref } from '../lib/prefs'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonClass'
import { cx } from '../ui/cx'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { ToggleButton, ToggleGroup } from '../ui/ToggleGroup'

type Layout = '1' | '4' | '9' | '16'

// Columns per layout; phones show at most two.
const GRID: Record<Layout, string> = {
  '1': 'grid-cols-1',
  '4': 'grid-cols-1 sm:grid-cols-2',
  '9': 'grid-cols-2 md:grid-cols-3',
  '16': 'grid-cols-2 md:grid-cols-4',
}

export default function LivePage() {
  const cameras = useCameras()
  const incidents = useIncidents()
  const status = usePipelineStatus()
  const liveState = useLiveState()
  const now = useNow(1000)
  const [layout, setLayout] = usePref<Layout>('live.layout', '4')
  const [alertingOnly, setAlertingOnly] = usePref('live.alertingOnly', false)
  const [overlay, setOverlay] = usePref('live.overlay', false)
  const [page, setPage] = useState(0)
  const [solo, setSolo] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const cameraById = new Map((cameras.data ?? []).map((c) => [c.id, c]))
  const decide = useIncidentDecision(cameraById)
  const markNormal = useMarkNormalDecision(cameraById)
  const anomalies = liveAnomalies(cameras.data, liveState)
  const alertByCamera = new Map<string, (typeof anomalies)[number]>()
  for (const a of anomalies) if (!alertByCamera.has(a.camera_id)) alertByCamera.set(a.camera_id, a)

  const all = cameras.data ?? []
  const shown = alertingOnly ? all.filter((c) => alertByCamera.has(c.id)) : all
  const soloCam = solo ? all.find((c) => c.id === solo) : undefined
  const perPage = soloCam ? 1 : Number(layout)
  const pages = Math.max(1, Math.ceil(shown.length / perPage))
  const current = Math.min(page, pages - 1)
  const visible = soloCam ? [soloCam] : shown.slice(current * perPage, current * perPage + perPage)
  const empty = soloCam || layout === '1' ? 0 : perPage - visible.length
  const slots = status.data?.camera_slots
  const openIncident = (incidents.data ?? []).find((i) => i.id === openId) ?? null

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <ToggleGroup
          label="Layout"
          value={soloCam ? '1' : layout}
          onChange={(v) => {
            setSolo(null)
            setLayout(v)
            setPage(0)
          }}
          options={[
            { id: '1', label: 'One camera', icon: Square, iconOnly: true },
            { id: '4', label: 'Two by two', icon: Grid2x2, iconOnly: true },
            { id: '9', label: 'Three by three', icon: Grid3x3, iconOnly: true },
            { id: '16', label: 'Four by four', icon: LayoutGrid, iconOnly: true },
          ]}
        />
        <ToggleButton
          label="Alerting only"
          icon={Siren}
          pressed={alertingOnly}
          onChange={(v) => {
            setAlertingOnly(v)
            setPage(0)
          }}
        />
        <ToggleButton label="Overlays" icon={Layers} pressed={overlay} onChange={setOverlay} />
        {soloCam && (
          <Button size="sm" variant="ghost" onClick={() => setSolo(null)}>
            Back to grid
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!soloCam && pages > 1 && (
            <span className="flex items-center gap-1 text-[12px] text-ink-2">
              <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} />
              <span className="font-mono">
                {current + 1}/{pages}
              </span>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} />
            </span>
          )}
          <Button size="sm" icon={Plus} disabled={!!slots && slots.used >= slots.total} onClick={() => setAdding(true)}>
            Add camera
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <section aria-label="Video wall" className="min-w-0 flex-1 bg-video p-0.5">
          {cameras.error ? (
            <ErrorState title="Cameras could not be loaded" error={cameras.error} onRetry={() => cameras.refetch()} />
          ) : cameras.isLoading ? (
            <div className={cx('grid gap-0.5', GRID[layout])} aria-busy="true">
              {Array.from({ length: Number(layout) }, (_, k) => (
                <Skeleton key={k} className="aspect-video" />
              ))}
            </div>
          ) : all.length === 0 ? (
            <EmptyState
              title="No cameras"
              description="Add an RTSP stream or a webcam, or use a test video as a virtual camera."
              action={
                <>
                  <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                    Add camera
                  </Button>
                  <Link to="/test-videos" className={buttonClass('secondary', 'sm')}>
                    Test videos
                  </Link>
                </>
              }
            />
          ) : visible.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-muted">No camera is alerting</p>
          ) : (
            <div className={cx('grid gap-0.5', soloCam ? 'grid-cols-1' : GRID[layout])}>
              {visible.map((c) => (
                <VideoTile
                  key={c.id}
                  camera={c}
                  live={liveState[c.id]}
                  alert={alertByCamera.get(c.id)}
                  overlay={overlay}
                  solo={!!soloCam}
                  onToggleSolo={() => setSolo(soloCam ? null : c.id)}
                  now={now}
                />
              ))}
              {Array.from({ length: alertingOnly ? 0 : empty }, (_, k) => (
                <div key={`empty-${k}`} className="flex aspect-video items-center justify-center bg-panel/40 text-[12px] text-muted">
                  Empty
                </div>
              ))}
            </div>
          )}
        </section>

        <AlarmQueue
          incidents={incidents.data}
          cameraById={cameraById}
          isLoading={incidents.isLoading}
          error={incidents.error}
          onRetry={() => incidents.refetch()}
          onOpen={(i) => setOpenId(i.id)}
          onDecide={decide}
          className="h-[480px] border-t border-line xl:h-auto xl:w-[400px] xl:shrink-0 xl:border-t-0 xl:border-l"
        />
      </div>

      <IncidentDrawer
        incident={openIncident}
        camera={openIncident ? cameraById.get(openIncident.camera_id) : undefined}
        onClose={() => setOpenId(null)}
        onDecide={decide}
        onNormal={markNormal}
      />
      <CameraDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
