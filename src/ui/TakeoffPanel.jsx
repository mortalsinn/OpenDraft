import { useDraft } from '../store/useDraft.js'
import { computeTakeoff } from '../core/doc.js'
import { formatLength } from '../core/units.js'

/**
 * Live quantities.
 *
 * Only edges exist in Phase 1, so this is empty until railing runs land in
 * Phase 3 — but it is wired to the real `computeTakeoff` seam now, so the
 * moment a node type declares quantities they appear here without further
 * plumbing. This panel is the whole ArcSite half of the thesis: the drawing
 * IS the takeoff.
 */
export default function TakeoffPanel() {
  const doc = useDraft((s) => s.doc)
  const lines = computeTakeoff(doc)
  const edgeCount = Object.values(doc.nodes).filter((n) => n.type === 'edge').length
  const totalLength = Object.values(doc.nodes)
    .filter((n) => n.start && n.end)
    .reduce((sum, n) => sum + Math.hypot(n.end.x - n.start.x, n.end.y - n.start.y, (n.end.z ?? 0) - (n.start.z ?? 0)), 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-white/10 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Takeoff</h2>
      </header>

      <div className="border-b border-white/10 px-4 py-3 text-sm">
        <Row label="Edges" value={edgeCount} />
        <Row label="Total length" value={formatLength(totalLength)} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {lines.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            No priced objects yet. Draw edges now; promoting them to railing runs
            in Phase&nbsp;3 will fill this panel and feed the AscendOS estimator.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line) => (
                <tr key={line.sku} className="border-b border-white/5">
                  <td className="py-1.5 text-slate-300">{line.description}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-100">
                    {line.unit === 'in' ? formatLength(line.quantity) : line.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono tabular-nums text-slate-200">{value}</span>
    </div>
  )
}
