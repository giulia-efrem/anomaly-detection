import { Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { formatClock, formatDay } from '../lib/format'
import { Pill } from '../ui/Chip'
import { cx } from '../ui/cx'

const NAV = [
  { to: '/', label: 'Live', end: true },
  { to: '/incidents', label: 'Incidents' },
  { to: '/test-videos', label: 'Test videos' },
  { to: '/compare', label: 'Compare models' },
  { to: '/training', label: 'Training' },
  { to: '/cameras', label: 'Cameras' },
]

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function TopBar({ needReview, connected }: { needReview: number; connected: boolean }) {
  const now = useClock()

  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-3 bg-header px-6 py-3">
      <NavLink to="/" className="flex items-center gap-3 rounded-lg">
        <Eye size={28} strokeWidth={1.6} aria-hidden="true" />
        <span>
          <span className="block text-[20px] leading-6 font-semibold">Veghe</span>
          <span className="block text-[12px] leading-4 text-muted">Video anomaly detection</span>
        </span>
      </NavLink>

      <nav aria-label="Main" className="order-last flex w-full flex-wrap items-center gap-1 min-[1180px]:order-none min-[1180px]:w-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx(
                'inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-medium transition-colors',
                isActive ? 'bg-raised text-white' : 'text-ink-2 hover:bg-[#152234] hover:text-ink',
              )
            }
          >
            {item.label}
            {item.to === '/incidents' && needReview > 0 && (
              <Pill tone="review" aria-label={`${needReview} need review`}>
                {needReview}
              </Pill>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        {!connected && (
          <span className="rounded-full bg-raised px-3 py-1 text-[12px] text-muted" role="status">
            Reconnecting to backend
          </span>
        )}
        <div className="text-right">
          <time className="block font-cond text-[22px] leading-7 font-medium">{formatClock(now)}</time>
          <div className="text-[13px] leading-4 text-muted">{formatDay(now)}</div>
        </div>
      </div>
    </header>
  )
}
