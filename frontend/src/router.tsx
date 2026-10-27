import { createBrowserRouter } from 'react-router'
import Layout from './components/Layout'
import { FEATURE_COMPARE } from './features'
import CamerasPage from './pages/CamerasPage'
import IncidentsPage from './pages/IncidentsPage'
import LivePage from './pages/LivePage'
import { ComparePage, NotFoundPage } from './pages/PlaceholderPages'
import TestVideosPage from './pages/TestVideosPage'
import TrainingPage from './pages/TrainingPage'

// `handle.title` is the top bar title and the browser tab title.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LivePage />, handle: { title: 'Live' } },
      { path: '/incidents', element: <IncidentsPage />, handle: { title: 'Incidents' } },
      { path: '/cameras', element: <CamerasPage />, handle: { title: 'Cameras' } },
      { path: '/test-videos', element: <TestVideosPage />, handle: { title: 'Test videos' } },
      { path: '/training', element: <TrainingPage />, handle: { title: 'Training' } },
      ...(FEATURE_COMPARE ? [{ path: '/compare', element: <ComparePage />, handle: { title: 'Compare models' } }] : []),
      { path: '*', element: <NotFoundPage />, handle: { title: 'Page not found' } },
    ],
  },
])
