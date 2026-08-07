import { useDraft } from '../store/useDraft.js'
import { TEMPLATE_LIST, scaleLabelFor } from '../core/sheets.js'
import { Plus, Trash2, Crop } from 'lucide-react'

/**
 * The drawing set.
 *
 * A viewport is a window onto the SAME model, never a copy — change the
 * geometry and every sheet showing it updates. That is the whole reason
 * viewports exist rather than exporting each view separately.
 */
export default function SheetsPanel() {
  const doc = useDraft((s) => s.doc)
  const activeSheet = useDraft((s) => s.activeSheet)
  const setActiveSheet = useDraft((s) => s.setActiveSheet)
  const newSheet = useDraft((s) => s.newSheet)
  const deleteSheet = useDraft((s) => s.deleteSheet)
  const updateSheet = useDraft((s) => s.updateSheet)
  const fitViewport = useDraft((s) => s.fitViewport)

  const order = doc.sheetOrder ?? []
  const sheet = doc.sheets?.[activeSheet] ?? doc.sheets?.[order[0]]

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sheets</h2>
        <button onClick={newSheet} title="Add a sheet" className="text-slate-500 hover:text-slate-200">
          <Plus size={13} />
        </button>
      </div>

      <ul className="mb-2 space-y-0.5">
        {order.map((id) => {
          const entry = doc.sheets[id]
          if (!entry) return null

          return (
            <li
              key={id}
              className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs transition ${
                id === sheet?.id ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <button onClick={() => setActiveSheet(id)} className="flex-1 truncate text-left text-slate-200">
                {entry.sheetNumber} · {entry.sheetTitle}
              </button>
              <span className="tabular-nums text-slate-600">{entry.viewports?.length ?? 0}</span>
              {order.length > 1 && (
                <button
                  onClick={() => deleteSheet(id)}
                  className="text-slate-600 transition hover:text-red-400"
                  title="Delete sheet"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {sheet && (
        <div className="space-y-1.5">
          <Field
            label="Number"
            value={sheet.sheetNumber}
            onChange={(value) => updateSheet(sheet.id, { sheetNumber: value })}
          />
          <Field
            label="Title"
            value={sheet.sheetTitle}
            onChange={(value) => updateSheet(sheet.id, { sheetTitle: value })}
          />

          <label className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400">Title block</span>
            <select
              value={sheet.template}
              onChange={(event) => updateSheet(sheet.id, { template: event.target.value })}
              onKeyDown={(event) => event.stopPropagation()}
              className="w-28 rounded bg-slate-800 px-1.5 py-1 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
            >
              {TEMPLATE_LIST.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              Scale{' '}
              <span className="font-mono text-slate-300">
                {sheet.viewports?.length
                  ? sheet.viewports.length > 1
                    ? 'As noted'
                    : scaleLabelFor(sheet.viewports[0].inchesPerFoot)
                  : '—'}
              </span>
            </span>
            <button
              onClick={() => fitViewport(sheet.id)}
              className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-slate-100 transition hover:bg-slate-600"
              title="Frame the drawing at the largest scale that fits"
            >
              <Crop size={11} /> Fit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        className="w-32 rounded bg-slate-800 px-1.5 py-1 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
      />
    </label>
  )
}
