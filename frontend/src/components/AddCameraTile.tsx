import { PlusIcon } from './Icons'

export default function AddCameraTile({ slotsLeft }: { slotsLeft: number }) {
  return (
    <button
      type="button"
      className="col-span-2 flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#2C3F59] text-center transition-colors hover:border-[#3E5470] hover:bg-[#0F1825]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2C3F59] text-ink-2">
        <PlusIcon size={16} />
      </span>
      <span className="text-[15px] font-semibold">Add camera</span>
      <span className="text-[13px] text-muted">
        RTSP or ONVIF stream, {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} left
      </span>
    </button>
  )
}
