import { useState } from 'react'
import { useDraft } from '../store/useDraft.js'
import { exportPlanPdf } from '../core/plan.js'
import { pdfToBlob } from '../core/pdf.js'
import { buildHandoff, validateHandoff } from '../core/handoff.js'

/** Trigger a browser download for a blob. */
function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const safeName = (name) => name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'drawing'

export default function ExportMenu() {
  const doc = useDraft((s) => s.doc)
  const projectName = useDraft((s) => s.projectName)
  const [status, setStatus] = useState(null)

  // The clock is read HERE, not in the export core, so the core stays
  // deterministic and its output can be diffed and tested.
  const today = () => new Date().toISOString().slice(0, 10)

  const exportPdf = () => {
    const { pdf, scale } = exportPlanPdf(doc, { projectName, date: today() })
    download(pdfToBlob(pdf), `${safeName(projectName)}-plan.pdf`)
    setStatus(`Plan exported at ${scale.label}`)
  }

  const exportHandoff = () => {
    const handoff = buildHandoff(doc, { projectName, exportedAt: new Date().toISOString() })
    const problems = validateHandoff(handoff)

    if (problems.length) {
      // Better to refuse than to hand the estimator numbers it will quote from.
      setStatus(`Not exported — ${problems[0]}`)
      return
    }

    download(
      new Blob([JSON.stringify(handoff, null, 2)], { type: 'application/json' }),
      `${safeName(projectName)}-takeoff.json`,
    )
    setStatus(`${handoff.lines.length} line(s) ready for AscendOS`)
  }

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Export</h2>

      <div className="flex gap-1.5">
        <button
          onClick={exportPdf}
          className="flex-1 rounded bg-slate-700 px-2 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600"
        >
          Plan PDF
        </button>
        <button
          onClick={exportHandoff}
          className="flex-1 rounded bg-slate-700 px-2 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600"
        >
          Takeoff
        </button>
      </div>

      {status && <p className="mt-2 text-[11px] leading-snug text-slate-500">{status}</p>}
    </div>
  )
}
