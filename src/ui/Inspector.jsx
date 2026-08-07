import { useDraft } from '../store/useDraft.js'
import { NODE_TYPES } from '../core/doc.js'
import { layoutRailing } from '../core/railing.js'
import { formatLength, parseLength } from '../core/units.js'

/**
 * Parameters of the selected object.
 *
 * This is where the parametric bet pays off visibly: change the max gap and the
 * pickets in the scene and the count in the takeoff both move, because both
 * read the same layout function.
 */
export default function Inspector() {
  const doc = useDraft((s) => s.doc)
  const selection = useDraft((s) => s.selection)
  const promote = useDraft((s) => s.promoteSelection)
  const edit = useDraft((s) => s.editSelection)
  const remove = useDraft((s) => s.deleteSelection)

  const node = selection ? doc.nodes[selection] : null

  if (!node) {
    return (
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Selection
        </h2>
        <p className="text-xs text-slate-500">
          Switch to the Select tool and click a line to inspect it.
        </p>
      </div>
    )
  }

  const definition = NODE_TYPES[node.type]
  const layout = node.type === 'railingRun' ? layoutRailing(node) : null

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {definition?.label ?? node.type}
        </h2>
        <button
          onClick={remove}
          className="text-xs text-slate-500 transition hover:text-red-400"
        >
          Delete
        </button>
      </div>

      {node.type === 'edge' && (
        <button
          onClick={() => promote('railingRun')}
          className="mb-2 w-full rounded bg-amber-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
        >
          Make this a railing run
        </button>
      )}

      {node.type === 'edge' && (
        <p className="mb-2 text-[11px] leading-snug text-slate-500">
          Connected lines are absorbed into one run, so corners share a post.
        </p>
      )}

      {layout && (
        <div className="mb-3 rounded bg-white/5 px-2 py-1.5 text-xs">
          <Readout label="Run" value={formatLength(layout.runLength)} />
          <Readout
            label="Shape"
            value={node.closed ? `closed, ${node.points.length} corners` : `${layout.rails.length} span${layout.rails.length === 1 ? '' : 's'}`}
          />
          <Readout label="Bays" value={layout.bays} />
          <Readout label="Posts" value={layout.posts.length} />
          <Readout label="Actual gap" value={formatLength(layout.gap, { denominator: 32 })} />
        </div>
      )}

      {definition?.editable?.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={node[field.key]}
          onCommit={(inches) => edit(field.key, clamp(inches, field.min, field.max))}
        />
      ))}
    </div>
  )
}

function Field({ field, value, onCommit }) {
  return (
    <label className="mb-1.5 flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-400">{field.label}</span>
      <input
        // Uncommitted keystrokes must not reach the canvas, or typing "42"
        // would also feed the value box and draw a line.
        onKeyDown={(event) => event.stopPropagation()}
        defaultValue={formatLength(value, { denominator: 32 })}
        key={value}
        onBlur={(event) => {
          const parsed = parseLength(event.target.value)
          if (parsed !== null) onCommit(parsed)
          else event.target.value = formatLength(value, { denominator: 32 })
        }}
        onKeyUp={(event) => {
          if (event.key === 'Enter') event.target.blur()
        }}
        className="w-24 rounded bg-slate-800 px-1.5 py-1 text-right font-mono text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
      />
    </label>
  )
}

function Readout({ label, value }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono tabular-nums text-slate-300">{value}</span>
    </div>
  )
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
