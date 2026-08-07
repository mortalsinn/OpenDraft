import { useDraft } from '../store/useDraft.js'
import { BLOCK_LIST, BLOCKS } from '../core/blocks.js'
import { parseLength, formatLength } from '../core/units.js'

/**
 * The symbol library, and the attributes of whatever is armed or selected.
 *
 * Attributes are the reason blocks exist rather than just being drawings: a
 * door that knows its width can be scheduled and counted, and one that is only
 * lines on a page cannot.
 */
export default function BlocksPanel() {
  const doc = useDraft((s) => s.doc)
  const selection = useDraft((s) => s.selection)
  const pendingBlock = useDraft((s) => s.pendingBlock)
  const blockAttributes = useDraft((s) => s.blockAttributes)
  const armBlock = useDraft((s) => s.armBlock)
  const setBlockAttribute = useDraft((s) => s.setBlockAttribute)
  const setPlacedAttribute = useDraft((s) => s.setPlacedAttribute)

  const placed = selection ? doc.nodes[selection] : null
  const editingPlaced = placed?.type === 'blockInstance'

  // Editing a placed symbol takes precedence over the one armed for insertion.
  const activeId = editingPlaced ? placed.blockId : pendingBlock
  const block = activeId ? BLOCKS[activeId] : null
  const values = editingPlaced ? placed.attributes : blockAttributes

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Blocks</h2>

      <div className="mb-2 grid grid-cols-2 gap-1">
        {BLOCK_LIST.map((entry) => (
          <button
            key={entry.id}
            onClick={() => armBlock(entry.id)}
            className={`rounded px-2 py-1 text-[11px] transition ${
              pendingBlock === entry.id && !editingPlaced
                ? 'bg-violet-500/25 text-violet-200'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {entry.name}
          </button>
        ))}
      </div>

      {block && values && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-500">
            {editingPlaced ? `Editing placed ${block.name.toLowerCase()}` : 'Click in the drawing to place'}
          </p>

          {block.attributes.map((attribute) => (
            <Attribute
              key={attribute.tag}
              attribute={attribute}
              value={values[attribute.tag]}
              onChange={(next) =>
                editingPlaced
                  ? setPlacedAttribute(attribute.tag, next)
                  : setBlockAttribute(attribute.tag, next)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Attribute({ attribute, value, onChange }) {
  if (attribute.type === 'choice') {
    return (
      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-400">{attribute.label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          className="w-24 rounded bg-slate-800 px-1.5 py-1 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
        >
          {attribute.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-400">{attribute.label}</span>
      <input
        key={value}
        defaultValue={formatLength(value, { denominator: 32 })}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') event.target.blur()
        }}
        onBlur={(event) => {
          const parsed = parseLength(event.target.value)
          if (parsed !== null && parsed > 0) onChange(parsed)
          else event.target.value = formatLength(value, { denominator: 32 })
        }}
        className="w-24 rounded bg-slate-800 px-1.5 py-1 text-right font-mono text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
      />
    </label>
  )
}
