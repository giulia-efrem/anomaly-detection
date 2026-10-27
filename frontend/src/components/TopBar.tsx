import { CircleCheck, Menu, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSystem } from '../api/hooks'
import { formatClock, formatDate } from '../lib/format'
import { Button } from '../ui/Button'

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** "All systems normal", or the number of open issues with their list on click. */
function Health({ connected }: { connected: boolean }) {
  const system = useSystem()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!system.data && !system.error) return <span className="text-[13px] text-muted">Checking status</span>
  const issues = [...(connected ? [] : ['Backend not connected']), ...(system.error ? ['Status unavailable'] : system.data?.issues ?? [])]

  if (issues.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
        <CircleCheck size={16} className="text-ok" aria-hidden="true" />
        All systems normal
      </span>
    )
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink hover:bg-raised"
      >
        <TriangleAlert size={16} className="text-warn" aria-hidden="true" />
        {issues.length === 1 ? '1 issue' : `${issues.length} issues`}
      </button>
      {open && (
        <ul className="absolute top-8 right-0 z-30 w-72 rounded border border-line bg-raised py-1 text-[12px]">
          {issues.map((i) => (
            <li key={i} className="px-3 py-1 text-ink-2">
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TopBar({ title, connected, onMenu }: { title: string; connected: boolean; onMenu: () => void }) {
  const now = useClock()
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      <Button variant="ghost" size="md" iconOnly icon={Menu} aria-label="Open navigation" onClick={onMenu} className="-ml-2 md:hidden" />
      <h1 className="min-w-0 truncate text-[16px] font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-4">
        <Health connected={connected} />
        <time className="hidden font-mono text-[13px] text-ink-2 sm:block" dateTime={now.toISOString()}>
          {formatDate(now)} {formatClock(now)}
        </time>
      </div>
    </header>
  )
}
