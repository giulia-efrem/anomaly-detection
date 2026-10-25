import { createBrowserRouter } from 'react-router'
import Layout from './components/Layout'
import CamerasPage from './pages/CamerasPage'
import IncidentsPage from './pages/IncidentsPage'
import LivePage from './pages/LivePage'
import { ComparePage, NotFoundPage, TrainingPage } from './pages/PlaceholderPages'
import TestVideosPage from './pages/TestVideosPage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LivePage /> },
      { path: '/incidents', element: <IncidentsPage /> },
      { path: '/test-videos', element: <TestVideosPage /> },
      { path: '/compare', element: <ComparePage /> },
      { path: '/training', element: <TrainingPage /> },
      { path: '/cameras', element: <CamerasPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
