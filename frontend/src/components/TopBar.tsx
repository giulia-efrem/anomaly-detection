import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useCameras, useSystem } from '../api/hooks'
import { FEATURE_COMPARE } from '../features'
import { formatClock, formatDay } from '../lib/format'
import { cx } from '../ui/cx'
import StatusDot from '../ui/StatusDot'

const NAV = [
  { to: '/', label: 'Live', end: true },
  { to: '/incidents', label: 'Incidents' },
  { to: '/test-videos', label: 'Test videos' },
  ...(FEATURE_COMPARE ? [{ to: '/compare', label: 'Compare models' }] : []),
  { to: '/cameras', label: 'Cameras' },
  { to: '/training', label: 'Training' },
]

const STATUS_COLOR = { live: 'var(--color-healthy)', connecting: 'var(--color-muted)', offline: 'var(--color-alarm)' }

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** "All cameras · 7 online". Opens the camera list; picking one shows it large on Live. */
function CameraGroupSelector() {
  const cameras = useCameras()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const list = cameras.data ?? []
  const online = list.filter((c) => c.status === 'live').length

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-panel px-3 text-[14px] transition-colors hover:bg-raised"
      >
        <span className="font-semibold">All cameras</span>
        <StatusDot color={online > 0 ? 'var(--color-healthy)' : 'var(--color-muted)'} active={online > 0} size={7} />
        <span className="font-mono text-[12px] text-ink-2">{cameras.data ? `${online} online` : 'n/a'}</span>
        <ChevronDown size={14} className="text-muted" aria-hidden="true" />
      </button>
      {open && (
        <ul className="absolute top-11 left-0 z-40 w-64 rounded-xl border border-line-strong bg-card py-1" aria-label="Cameras">
          {list.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No cameras</li>}
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate(`/?camera=${encodeURIComponent(c.id)}`)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-raised"
              >
                <StatusDot color={STATUS_COLOR[c.status]} active={c.status === 'live'} size={7} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="font-mono text-[12px] text-muted">{c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TopBar({ needReview, connected }: { needReview: number; connected: boolean }) {
  const now = useClock()
  const { data: system } = useSystem()
  const gpu = system?.gpu

  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-header px-6">
      <CameraGroupSelector />

      <nav aria-label="Main" className="order-last flex w-full items-stretch gap-1 overflow-x-auto min-[1080px]:order-none min-[1080px]:w-auto min-[1080px]:self-stretch">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx(
                'relative inline-flex h-11 items-center gap-2 px-3 text-[14px] whitespace-nowrap transition-colors min-[1080px]:h-auto',
                isActive ? 'text-white' : 'text-ink-2 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {item.label}
                {item.to === '/incidents' && needReview > 0 && (
                  <span className="font-mono text-[12px] text-muted" aria-label={`${needReview} open`}>
                    {needReview}
                  </span>
                )}
                {isActive && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-white" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-5 py-2">
        {!connected && (
          <span className="text-[12px] text-alarm" role="status">
            Backend disconnected
          </span>
        )}
        <dl className="hidden items-center gap-4 text-[12px] sm:flex">
          <div className="flex gap-1.5">
            <dt className="text-muted">GPU</dt>
            <dd className="font-mono text-ink-2">{gpu ? `${gpu.util_pct}%` : 'n/a'}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">VRAM</dt>
            <dd className="font-mono text-ink-2">{gpu ? `${(gpu.used_mb / 1024).toFixed(1)} GB` : 'n/a'}</dd>
          </div>
        </dl>
        <div className="text-right">
          <time className="block font-mono text-[16px] leading-5 font-medium" dateTime={now.toISOString()}>
            {formatClock(now)}
          </time>
          <div className="text-[12px] leading-4 text-muted">{formatDay(now)}</div>
        </div>
      </div>
    </header>
  )
}
