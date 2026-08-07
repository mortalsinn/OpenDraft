import { useDraft } from '../store/useDraft.js'
import { NODE_TYPES } from '../core/doc.js'
import { layoutRailing } from '../core/railing.js'
import { layoutStair } from '../core/stairs.js'
import { layoutRakingGuard } from '../core/rake.js'
import { buildChain } from '../core/chain.js'
import { polygonAreaSquareFeet, polygonPerimeter } from '../core/polygon.js'
import { resolveDimension, isAssociative } from '../core/dimension.js'
import { getRules } from '../core/code.js'
import { HATCH_LIST } from '../core/hatch.js'
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
  const primary = useDraft((s) => s.primary)()
  const promote = useDraft((s) => s.promoteSelection)
  const edit = useDraft((s) => s.editSelection)
  const remove = useDraft((s) => s.deleteSelection)
  const setNoteText = useDraft((s) => s.setNoteText)

  const node = primary ? doc.nodes[primary] : null

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
  const slab = node.type === 'slab'
  const stair = node.type === 'stairRun' ? layoutStair(node) : null
  // Judged against the DOCUMENT's jurisdiction, not the default — otherwise
  // the inspector and the compliance panel could disagree about the same node.
  const issues = definition?.issues?.(node, getRules(doc.jurisdiction)) ?? []
  const dimension = node.type === 'dimension' ? resolveDimension(doc, node) : null

  // Whether promoting this edge would yield a genuine ring — a deck cannot be
  // made from an open chain without inventing an edge nobody drew.
  const chainIsClosed =
    node.type === 'edge' &&
    buildChain(Object.values(doc.nodes).filter((n) => n.type === 'edge'), node.id).closed

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
        <>
          <button
            onClick={() => promote('railingRun')}
            className="mb-1.5 w-full rounded bg-amber-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            Make this a railing run
          </button>

          <button
            onClick={() => promote('stairRun')}
            className="mb-1.5 w-full rounded bg-sky-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            Make this a stair
          </button>

          <button
            onClick={() => promote('wall')}
            className="mb-1.5 w-full rounded bg-slate-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-400"
          >
            Make this a wall
          </button>

          <button
            onClick={() => promote('slab')}
            disabled={!chainIsClosed}
            title={chainIsClosed ? undefined : 'A deck needs a closed loop of lines'}
            className="mb-2 w-full rounded bg-stone-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-stone-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Make this a deck
          </button>

          <p className="mb-2 text-[11px] leading-snug text-slate-500">
            Connected lines are absorbed into one run, so corners share a post.
            {!chainIsClosed && ' A deck needs the loop to close.'}
          </p>
        </>
      )}

      {slab && (
        <>
          <div className="mb-2 rounded bg-white/5 px-2 py-1.5 text-xs">
            <Readout label="Area" value={`${polygonAreaSquareFeet(node.points).toFixed(1)} sq ft`} />
            <Readout label="Perimeter" value={formatLength(polygonPerimeter(node.points))} />
            <Readout label="Corners" value={node.points.length} />
          </div>

          <label className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">Hatch</span>
            <select
              value={node.hatch ?? 'none'}
              onChange={(event) => edit('hatch', event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              className="w-32 rounded bg-slate-800 px-1.5 py-1 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
            >
              {HATCH_LIST.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </option>
              ))}
            </select>
          </label>
        </>
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

      {node.type === 'dimension' && (
        <div className="mb-3 rounded bg-white/5 px-2 py-1.5 text-xs">
          {dimension ? (
            <>
              <Readout label="Measures" value={formatLength(dimension.length)} />
              <Readout
                label="Binding"
                value={isAssociative(node) ? 'follows geometry' : 'fixed points'}
              />
            </>
          ) : (
            <p className="text-red-300">
              Broken — what this measured has been deleted.
            </p>
          )}
        </div>
      )}

      {node.type === 'note' && (
        <textarea
          value={node.text}
          onChange={(event) => setNoteText(node.id, event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          rows={3}
          className="mb-3 w-full resize-none rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
        />
      )}

      {stair && (
        <button
          onClick={() => edit('guard', !node.guard)}
          className={`mb-2 w-full rounded px-2 py-1.5 text-xs font-semibold transition ${
            node.guard
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
          }`}
        >
          {node.guard ? 'Raking guard on' : 'Add raking guard'}
        </button>
      )}

      {stair && node.guard && (
        <div className="mb-2 rounded bg-white/5 px-2 py-1.5 text-xs">
          <Readout label="Rake length" value={formatLength(rake(node).railLength)} />
          <Readout label="Rake posts" value={rake(node).posts.length} />
          <Readout label="Rake pickets" value={rake(node).pickets.length} />
          <Readout
            label="Slope"
            value={`${((rake(node).slope * 180) / Math.PI).toFixed(1)}°`}
          />
        </div>
      )}

      {stair && (
        <div className="mb-3 rounded bg-white/5 px-2 py-1.5 text-xs">
          <Readout label="Risers" value={stair.riserCount} />
          <Readout label="Riser height" value={formatLength(stair.riserHeight, { denominator: 32 })} />
          <Readout label="Treads" value={stair.treadCount} />
          <Readout label="Total run" value={formatLength(stair.totalRun)} />
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mb-3 space-y-1">
          {issues.map((issue, i) => (
            <li
              key={i}
              className={`rounded px-2 py-1 text-[11px] leading-snug ${
                issue.severity === 'error'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {issue.message}
              {issue.citation && (
                <span className="mt-0.5 block text-slate-500">{issue.citation}</span>
              )}
            </li>
          ))}
        </ul>
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

/** Guard layout for a stair, with its own parameters folded in. */
const rake = (node) => layoutRakingGuard(node, node.guardParams ?? {})

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
