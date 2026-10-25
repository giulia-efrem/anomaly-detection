import { Outlet } from 'react-router'
import { useIncidents } from '../api/hooks'
import { useLiveUpdates } from '../api/live'
import TopBar from './TopBar'

export default function Layout() {
  const connected = useLiveUpdates()
  const incidents = useIncidents()
  const needReview = (incidents.data ?? []).filter((i) => i.status === 'needs_review').length

  return (
    <div className="min-h-screen bg-page text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-ink px-4 py-2 text-on-light focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <TopBar needReview={needReview} connected={connected} />
      <main id="main">
        <Outlet />
      </main>
    </div>
  )
}
