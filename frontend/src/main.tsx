import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router.tsx'
import './index.css'
import { ToastProvider } from './ui/Toast.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The WebSocket pushes changes, so polling is only a safety net.
      staleTime: 10_000,
      refetchInterval: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
