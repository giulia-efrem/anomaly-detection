import type { ReactNode } from 'react'
import { Dialog } from '../ui/Dialog'

interface VideoDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  src: string | null
  footer?: ReactNode
}

export default function VideoDialog({ open, onClose, title, description, src, footer }: VideoDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="lg" footer={footer}>
      {src && (
        <video
          key={src}
          src={src}
          controls
          autoPlay
          loop
          playsInline
          className="aspect-video w-full rounded-md bg-video object-contain"
        />
      )}
    </Dialog>
  )
}
