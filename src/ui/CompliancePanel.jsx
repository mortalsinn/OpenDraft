import { useDraft } from '../store/useDraft.js'
import { documentIssues } from '../core/doc.js'
import { JURISDICTIONS, getRules } from '../core/code.js'

/**
 * Code findings for the whole drawing, and the jurisdiction they are judged
 * against.
 *
 * Every finding shows its clause. A compliance warning without a citation is
 * an opinion, and the first thing anyone asks about one is "says who?".
 */
export default function CompliancePanel() {
  const doc = useDraft((s) => s.doc)
  const setJurisdiction = useDraft((s) => s.setJurisdiction)
  const select = useDraft((s) => s.select)

  const issues = documentIssues(doc)
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const rules = getRules(doc.jurisdiction)

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Code</h2>

      <select
        value={doc.jurisdiction ?? rules.id}
        onChange={(event) => setJurisdiction(event.target.value)}
        className="mb-2 w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
      >
        {Object.values(JURISDICTIONS).map((jurisdiction) => (
          <option key={jurisdiction.id} value={jurisdiction.id}>
            {jurisdiction.label}
          </option>
        ))}
      </select>

      {issues.length === 0 ? (
        <p className="text-[11px] text-emerald-400">
          Nothing flagged against {rules.authority}.
        </p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] text-slate-500">
            {errors.length} failing, {warnings.length} to review
          </p>

          <ul className="space-y-1">
            {issues.map((issue, i) => (
              <li key={i}>
                <button
                  onClick={() => select(issue.nodeId)}
                  className={`w-full rounded px-2 py-1 text-left text-[11px] leading-snug transition ${
                    issue.severity === 'error'
                      ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
                      : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                  }`}
                >
                  {issue.message}
                  {issue.citation && (
                    <span className="mt-0.5 block text-slate-500">{issue.citation}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
