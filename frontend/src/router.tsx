import { createBrowserRouter } from 'react-router'
import Layout from './components/Layout'
import { FEATURE_COMPARE } from './features'
import CamerasPage from './pages/CamerasPage'
import IncidentsPage from './pages/IncidentsPage'
import LivePage from './pages/LivePage'
import { ComparePage, NotFoundPage } from './pages/PlaceholderPages'
import TrainingPage from './pages/TrainingPage'
import TestVideosPage from './pages/TestVideosPage'

// `handle.title` becomes the browser tab title (see Layout).
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LivePage />, handle: { title: 'Live' } },
      { path: '/incidents', element: <IncidentsPage />, handle: { title: 'Incidents' } },
      { path: '/test-videos', element: <TestVideosPage />, handle: { title: 'Test videos' } },
      // Behind FEATURE_COMPARE (src/features.ts), off by default.
      ...(FEATURE_COMPARE ? [{ path: '/compare', element: <ComparePage />, handle: { title: 'Compare models' } }] : []),
      { path: '/training', element: <TrainingPage />, handle: { title: 'Training' } },
      { path: '/cameras', element: <CamerasPage />, handle: { title: 'Cameras' } },
      { path: '*', element: <NotFoundPage />, handle: { title: 'Page not found' } },
    ],
  },
])
