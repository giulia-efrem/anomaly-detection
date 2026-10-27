import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router'
import { useIncidents } from '../api/hooks'
import { useLiveUpdates } from '../api/live'
import { usePref } from '../lib/prefs'
import Sidebar from './Sidebar'
import StatusBar from './StatusBar'
import TopBar from './TopBar'

/** Phone navigation: the sidebar in a <dialog> (focus trap, Escape to close). */
function NavDrawer({ open, onClose, openAlarms }: { open: boolean; onClose: () => void; openAlarms: number }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 h-full max-h-none w-[220px] bg-panel p-0 text-ink md:hidden"
    >
      {open && <Sidebar collapsed={false} openAlarms={openAlarms} className="h-full border-r-0" />}
    </dialog>
  )
}

export default function Layout() {
  const connected = useLiveUpdates()
  const incidents = useIncidents()
  const openAlarms = (incidents.data ?? []).filter((i) => i.status === 'needs_review').length
  const matches = useMatches()
  const title = (matches.at(-1)?.handle as { title?: string } | undefined)?.title ?? 'Page not found'
  const [collapsed, setCollapsed] = usePref('sidebar.collapsed', false)
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)

  // Close the phone drawer after navigating.
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setDrawer(false)
  }

  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <div className="flex h-screen flex-col bg-page text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-1.5 text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          openAlarms={openAlarms}
          className="hidden md:flex"
        />
        <NavDrawer open={drawer} onClose={() => setDrawer(false)} openAlarms={openAlarms} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar title={title} connected={connected} onMenu={() => setDrawer(true)} />
          <main id="main" className="thin-scroll min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <StatusBar connected={connected} />
    </div>
  )
}
