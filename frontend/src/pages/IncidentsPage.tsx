import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCameras, useIncidents } from '../api/hooks'
import IncidentDrawer from '../components/IncidentDrawer'
import ScoreBar from '../components/ScoreBar'
import SeverityIcon from '../components/SeverityIcon'
import { useIncidentDecision, useMarkNormalDecision } from '../components/useIncidentDecision'
import { SEVERITY, TYPE_LABELS } from '../lib/classes'
import { dateTime, RAISED_BY_LABELS, STATUS_LABELS } from '../lib/format'
import { SUPERVISED_TYPES, UNSUPERVISED_TYPES, type Incident, type IncidentStatus, type RaisedBy, type Severity } from '../types'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Select } from '../ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { ToggleGroup } from '../ui/ToggleGroup'

type StatusFilter = IncidentStatus | 'all'
const SEVERITY_RANK: Record<Severity, number> = { critical: 2, warning: 1 }
const col = createColumnHelper<Incident>()

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-muted">
      {label}
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-auto min-w-[120px] text-[12px]">
        {children}
      </Select>
    </label>
  )
}

export default function IncidentsPage() {
  const incidents = useIncidents()
  const cameras = useCameras()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<StatusFilter>('needs_review')
  const [severity, setSeverity] = useState<'' | Severity>('')
  const [type, setType] = useState('')
  const [camera, setCamera] = useState('')
  const [raisedBy, setRaisedBy] = useState<'' | RaisedBy>('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'time', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 })
  const openId = params.get('focus')

  const cameraById = new Map((cameras.data ?? []).map((c) => [c.id, c]))
  const decide = useIncidentDecision(cameraById)
  const markNormal = useMarkNormalDecision(cameraById)
  const all = incidents.data ?? []
  const count = (s: StatusFilter) => (s === 'all' ? all.length : all.filter((i) => i.status === s).length)
  const rows = all.filter(
    (i) =>
      (status === 'all' || i.status === status) &&
      (!severity || i.severity === severity) &&
      (!type || i.type === type) &&
      (!camera || i.camera_id === camera) &&
      (!raisedBy || i.raised_by === raisedBy),
  )
  const filtersKey = `${status}|${severity}|${type}|${camera}|${raisedBy}`
  const [lastFilters, setLastFilters] = useState(filtersKey)
  if (filtersKey !== lastFilters) {
    setLastFilters(filtersKey)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const columns = [
    col.accessor((i) => SEVERITY_RANK[i.severity], {
      id: 'severity',
      header: 'Severity',
      cell: (c) => <SeverityIcon severity={c.row.original.severity} withLabel />,
      size: 110,
    }),
    col.accessor('started_at', { id: 'time', header: 'Time', cell: (c) => <span className="font-mono">{dateTime(c.getValue())}</span>, size: 160 }),
    col.accessor((i) => cameraById.get(i.camera_id)?.name ?? `${i.camera_id} (removed)`, {
      id: 'camera',
      header: 'Camera',
      cell: (c) => c.getValue(),
      size: 160,
    }),
    col.accessor((i) => TYPE_LABELS[i.type], { id: 'class', header: 'Class', size: 150 }),
    col.accessor((i) => RAISED_BY_LABELS[i.raised_by], { id: 'raised_by', header: 'Raised by', size: 110 }),
    col.accessor((i) => i.scores.supervised ?? -1, {
      id: 'supervised',
      header: 'Supervised',
      cell: (c) => <ScoreBar method="supervised" value={c.row.original.scores.supervised} threshold={c.row.original.thresholds.supervised} />,
      size: 110,
    }),
    col.accessor((i) => i.scores.unsupervised ?? -1, {
      id: 'unsupervised',
      header: 'Unsupervised',
      cell: (c) => <ScoreBar method="unsupervised" value={c.row.original.scores.unsupervised} threshold={c.row.original.thresholds.unsupervised} />,
      size: 120,
    }),
    col.accessor((i) => STATUS_LABELS[i.status], { id: 'status', header: 'Status', size: 100 }),
  ]

  // TanStack Table returns new functions each render, so React Compiler skips memoizing this page.
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  })

  const open = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('focus', id)
    else next.delete('focus')
    setParams(next, { replace: true })
  }
  // The drawer shows the incident from ?focus= even when the filters hide its row.
  const openIncident = all.find((i) => i.id === openId) ?? null

  const { pageIndex, pageSize } = table.getState().pagination
  const first = rows.length ? pageIndex * pageSize + 1 : 0
  const last = Math.min(rows.length, (pageIndex + 1) * pageSize)

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-1.5">
        <ToggleGroup
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { id: 'needs_review', label: 'Open', count: count('needs_review') },
            { id: 'confirmed', label: 'Confirmed', count: count('confirmed') },
            { id: 'false_alarm', label: 'False alarm', count: count('false_alarm') },
            { id: 'all', label: 'All', count: count('all') },
          ]}
        />
        <FilterSelect label="Severity" value={severity} onChange={(v) => setSeverity(v as '' | Severity)}>
          <option value="">Any</option>
          <option value="critical">{SEVERITY.critical.label}</option>
          <option value="warning">{SEVERITY.warning.label}</option>
        </FilterSelect>
        <FilterSelect label="Class" value={type} onChange={setType}>
          <option value="">Any</option>
          <optgroup label="Supervised">
            {SUPERVISED_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </optgroup>
          <optgroup label="Unsupervised">
            {UNSUPERVISED_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </optgroup>
        </FilterSelect>
        <FilterSelect label="Camera" value={camera} onChange={setCamera}>
          <option value="">Any</option>
          {(cameras.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Raised by" value={raisedBy} onChange={(v) => setRaisedBy(v as '' | RaisedBy)}>
          <option value="">Any</option>
          {(Object.keys(RAISED_BY_LABELS) as RaisedBy[]).map((r) => (
            <option key={r} value={r}>{RAISED_BY_LABELS[r]}</option>
          ))}
        </FilterSelect>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-auto">
        {incidents.error ? (
          <ErrorState title="Incidents could not be loaded" error={incidents.error} onRetry={() => incidents.refetch()} />
        ) : incidents.isLoading ? (
          <div className="flex flex-col gap-px" aria-busy="true">
            {Array.from({ length: 12 }, (_, k) => (
              <Skeleton key={k} className="h-8 rounded-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={all.length === 0 ? 'No incidents' : 'No incidents match these filters'}
            description={all.length === 0 ? 'Incidents appear here when a model raises an alarm on a camera.' : undefined}
          />
        ) : (
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-panel">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-line">
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted()
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.getSize() }}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                        className="h-8 px-3 text-left text-[12px] font-medium text-ink-2"
                      >
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-ink">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' && <ArrowUp size={16} aria-hidden="true" />}
                          {sorted === 'desc' && <ArrowDown size={16} aria-hidden="true" />}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  aria-label={`${TYPE_LABELS[r.original.type]}, ${cameraById.get(r.original.camera_id)?.name ?? r.original.camera_id}, ${dateTime(r.original.started_at)}`}
                  onClick={() => open(r.original.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      open(r.original.id)
                    }
                  }}
                  className={cx(
                    'h-8 cursor-pointer border-b border-line hover:bg-raised focus-visible:bg-raised focus-visible:outline-none',
                    r.original.id === openId && 'bg-raised',
                  )}
                >
                  {r.getVisibleCells().map((c) => (
                    <td key={c.id} className="truncate px-3 text-ink">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > 0 && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-t border-line px-3 text-[12px] text-ink-2">
          <span className="font-mono">
            {first}–{last} of {rows.length}
          </span>
          <label className="ml-auto flex items-center gap-1.5">
            Rows
            <Select
              value={String(pageSize)}
              onChange={(e) => table.setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}
              className="h-7 w-[72px] text-[12px]"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </label>
          <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} />
          <span className="font-mono">
            {pageIndex + 1}/{table.getPageCount()}
          </span>
          <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} />
        </div>
      )}

      <IncidentDrawer
        incident={openIncident}
        camera={openIncident ? cameraById.get(openIncident.camera_id) : undefined}
        onClose={() => open(null)}
        onDecide={decide}
        onNormal={markNormal}
      />
    </div>
  )
}
