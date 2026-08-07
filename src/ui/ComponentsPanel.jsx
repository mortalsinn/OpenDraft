import { useDraft } from '../store/useDraft.js'
import { definitionUsage } from '../core/components.js'

/**
 * Component definitions and how many times each is placed.
 *
 * Editing a definition changes every instance of it — which is the difference
 * between drawing twelve newel posts and drawing one twelve times.
 */
export default function ComponentsPanel() {
  const doc = useDraft((s) => s.doc)
  const selection = useDraft((s) => s.selection)
  const makeComponentFromSelection = useDraft((s) => s.makeComponentFromSelection)
  const setPendingDefinition = useDraft((s) => s.setPendingDefinition)
  const pendingDefinition = useDraft((s) => s.pendingDefinition)

  const definitions = Object.values(doc.definitions ?? {})
  const usage = definitionUsage(doc)
  const selected = selection ? doc.nodes[selection] : null
  const canMake = selected && selected.type !== 'componentInstance'

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Components
      </h2>

      <button
        onClick={() => makeComponentFromSelection(prompt('Component name', 'Component') ?? undefined)}
        disabled={!canMake}
        className="mb-2 w-full rounded bg-violet-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        Make component from selection
      </button>

      {definitions.length === 0 ? (
        <p className="text-[11px] leading-snug text-slate-500">
          No components yet. Select something and make one — placing it again
          reuses the definition, so editing it updates every copy.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {definitions.map((definition) => (
            <li key={definition.id}>
              <button
                onClick={() => setPendingDefinition(definition.id)}
                className={`flex w-full items-center justify-between rounded px-1.5 py-1 text-xs transition ${
                  pendingDefinition === definition.id
                    ? 'bg-violet-500/25 text-violet-200'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <span className="truncate">{definition.name}</span>
                <span className="tabular-nums text-slate-500">
                  ×{usage[definition.id] ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDefinition && (
        <p className="mt-2 text-[11px] text-violet-300">Click in the drawing to place it.</p>
      )}
    </div>
  )
}
