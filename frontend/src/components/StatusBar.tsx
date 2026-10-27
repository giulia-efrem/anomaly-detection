import type { ReactNode } from 'react'
import { useSystem } from '../api/hooks'
import { NA } from '../lib/format'
import { cx } from '../ui/cx'
import StatusDot from '../ui/StatusDot'

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className="text-muted">{label}</span>
      <span className="font-mono text-ink-2">{children}</span>
    </span>
  )
}

/** 24px bar along the bottom: live system figures from /api/system and the WebSocket. */
export default function StatusBar({ connected }: { connected: boolean }) {
  const { data } = useSystem()
  const gpu = data?.gpu
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-panel px-3 text-[12px]">
      <Item label="Cameras">{data ? `${data.cameras.online}/${data.cameras.total} online` : NA}</Item>
      <Item label="GPU" className="hidden sm:flex">{gpu ? `${gpu.util_pct}%` : NA}</Item>
      <Item label="VRAM" className="hidden sm:flex">
        {gpu ? `${(gpu.used_mb / 1024).toFixed(1)}/${(gpu.total_mb / 1024).toFixed(1)} GB` : NA}
      </Item>
      <Item label="Models" className="hidden md:flex">{data ? `${data.models.loaded}/${data.models.total} loaded` : NA}</Item>
      <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-ink-2">
        <StatusDot color={connected ? 'var(--color-ok)' : 'var(--color-crit)'} active size={6} />
        {connected ? 'Backend connected' : 'Backend disconnected'}
      </span>
    </footer>
  )
}
