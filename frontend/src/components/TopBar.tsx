import { useEffect, useState } from 'react'
import { formatClock, formatDay } from '../lib/format'
import { MOCK_NOW } from '../mock'
import { EyeIcon } from './Icons'

const NAV = [
  { key: 'live', label: 'Live' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'compare', label: 'Compare models' },
  { key: 'training', label: 'Training' },
  { key: 'cameras', label: 'Cameras' },
] as const

/** Clock that starts at the mock "now" and ticks in real time. */
function useMockClock(): Date {
  const [now, setNow] = useState(MOCK_NOW)
  useEffect(() => {
    const t0 = Date.now()
    const id = setInterval(() => setNow(new Date(MOCK_NOW.getTime() + Date.now() - t0)), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function TopBar({ needReview }: { needReview: number }) {
  const now = useMockClock()

  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-header px-6 py-3">
      <div className="flex items-center gap-2.5">
        <EyeIcon size={28} className="text-ink" strokeWidth={1.6} />
        <div>
          <div className="text-[20px] leading-6 font-bold">Veghe</div>
          <div className="text-[12px] leading-4 text-muted">Video anomaly detection</div>
        </div>
      </div>

      <nav aria-label="Main" className="order-last flex w-full flex-wrap items-center gap-1 min-[1100px]:order-none min-[1100px]:w-auto">
        {NAV.map((item) => {
          const active = item.key === 'live'
          return (
            <a
              key={item.key}
              href={`#${item.key}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-[14px] font-medium transition-colors ${
                active ? 'bg-[#1B2A3F] text-white' : 'text-ink-2 hover:bg-[#152234] hover:text-ink'
              }`}
            >
              {item.label}
              {item.key === 'incidents' && needReview > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#3A1F24] px-1.5 font-cond text-[12px] font-semibold text-[#FFB0A6]"
                  aria-label={`${needReview} need review`}
                >
                  {needReview}
                </span>
              )}
            </a>
          )
        })}
      </nav>

      <div className="ml-auto text-right">
        <time className="block font-cond text-[22px] leading-7 font-medium">{formatClock(now)}</time>
        <div className="text-[13px] leading-4 text-muted">{formatDay(now)}</div>
      </div>
    </header>
  )
}
