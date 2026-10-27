import { Plus } from 'lucide-react'

export default function AddCameraTile({ slotsLeft, onClick }: { slotsLeft: number; onClick: () => void }) {
  const full = slotsLeft <= 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={full}
      className="col-span-2 flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#2C3F59] px-4 py-4 text-center transition-colors hover:border-[#3E5470] hover:bg-panel disabled:opacity-50"
    >
      <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-raised text-ink-2">
        <Plus size={16} aria-hidden="true" />
      </span>
      <span className="text-[15px] font-semibold">Add camera</span>
      <span className="text-[13px] text-muted">
        {full ? 'All camera slots are in use' : `RTSP, webcam or video file, ${slotsLeft} ${slotsLeft === 1 ? 'slot' : 'slots'} left`}
      </span>
    </button>
  )
}
