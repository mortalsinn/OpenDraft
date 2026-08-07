import { useRef, useState } from 'react'
import { useDraft } from '../store/useDraft.js'
import { toFile } from '../core/library.js'
import { Save, FolderOpen, Copy, Trash2, Upload, Download, FilePlus } from 'lucide-react'

/**
 * The drawing library.
 *
 * Until now the app held exactly one drawing, which is fine for a demo and
 * useless for a shop running several jobs. Import and export exist so a
 * drawing can leave the machine at all — everything else lives in one
 * browser's storage, which is not somewhere work should be trapped.
 */
export default function LibraryPanel() {
  const doc = useDraft((s) => s.doc)
  const library = useDraft((s) => s.library)
  const drawingId = useDraft((s) => s.drawingId)
  const drawingName = useDraft((s) => s.drawingName)
  const saveDrawingAs = useDraft((s) => s.saveDrawingAs)
  const openDrawing = useDraft((s) => s.openDrawing)
  const removeDrawing = useDraft((s) => s.removeDrawing)
  const copyDrawing = useDraft((s) => s.copyDrawing)
  const closeDrawing = useDraft((s) => s.closeDrawing)
  const importDrawing = useDraft((s) => s.importDrawing)

  const [name, setName] = useState(drawingName)
  const [status, setStatus] = useState(null)
  const fileInput = useRef(null)

  const save = () => {
    const entry = saveDrawingAs(name.trim() || 'Untitled')
    setStatus(entry ? `Saved “${entry.name}”` : 'Could not save — storage unavailable')
  }

  const exportFile = () => {
    const file = toFile(doc, { name, exportedAt: new Date().toISOString() })
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${(name || 'drawing').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.opendraft.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const importFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // so the same file can be picked twice
    if (!file) return

    try {
      const error = importDrawing(JSON.parse(await file.text()))
      setStatus(error ?? `Opened “${file.name}”`)
      if (!error) setName(useDraft.getState().drawingName)
    } catch {
      setStatus('That file is not readable JSON')
    }
  }

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Drawings
      </h2>

      <div className="mb-2 flex gap-1">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') save()
          }}
          placeholder="Drawing name"
          className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
        />
        <button
          onClick={save}
          title="Save"
          className="rounded bg-amber-500 px-2 py-1 text-slate-950 transition hover:bg-amber-400"
        >
          <Save size={12} />
        </button>
      </div>

      <div className="mb-2 flex gap-1">
        <IconButton onClick={closeDrawing} title="New drawing" icon={FilePlus} />
        <IconButton onClick={exportFile} title="Export to a file" icon={Download} />
        <IconButton onClick={() => fileInput.current?.click()} title="Open a file" icon={Upload} />
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          onChange={importFile}
          className="hidden"
        />
      </div>

      {library.length === 0 ? (
        <p className="text-[11px] leading-snug text-slate-500">
          Nothing saved yet. Name this drawing and save it, or open a file.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {library.map((entry) => (
            <li
              key={entry.id}
              className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition ${
                entry.id === drawingId ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <button
                onClick={() => {
                  const opened = openDrawing(entry.id)
                  if (opened) setName(entry.name)
                  else setStatus('That drawing could not be read')
                }}
                className="flex flex-1 items-center gap-1.5 truncate text-left text-slate-200"
              >
                <FolderOpen size={11} className="shrink-0 text-slate-500" />
                <span className="truncate">{entry.name}</span>
              </button>

              <button
                onClick={() => copyDrawing(entry.id, `${entry.name} copy`)}
                title="Duplicate"
                className="text-slate-600 transition hover:text-slate-200"
              >
                <Copy size={11} />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete “${entry.name}”? This cannot be undone.`)) {
                    removeDrawing(entry.id)
                  }
                }}
                title="Delete"
                className="text-slate-600 transition hover:text-red-400"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {status && <p className="mt-2 text-[11px] leading-snug text-slate-500">{status}</p>}
    </div>
  )
}

function IconButton({ onClick, title, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-1 rounded bg-slate-700 px-2 py-1 text-slate-100 transition hover:bg-slate-600"
    >
      <Icon size={12} className="mx-auto" />
    </button>
  )
}
