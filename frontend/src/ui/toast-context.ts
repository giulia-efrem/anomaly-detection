import { createContext, useContext } from 'react'

export type Tone = 'success' | 'info' | 'error'

export interface ToastInput {
  title: string
  description?: string
  tone?: Tone
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it disappears. */
  duration?: number
}

export const ToastContext = createContext<(t: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)
