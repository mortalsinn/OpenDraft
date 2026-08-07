import { useState } from 'react'
import { useDraft } from '../store/useDraft.js'
import { parseLength, formatLength } from '../core/units.js'

/**
 * Transforms applied to the selection.
 *
 * Everything works about the object's own centre, so nothing is ever flung
 * across the drawing by a stray click. Values are typed rather than dragged
 * because these are the operations you reach for when you already know the
 * number — "offset 5 1/2", "array at 16 centres".
 */
export default function TransformPanel() {
  const selection = useDraft((s) => s.selection)
  const doc = useDraft((s) => s.doc)
  const transform = useDraft((s) => s.transformSelection)

  const [offset, setOffset] = useState('5 1/2"')
  const [angle, setAngle] = useState('90')
  const [factor, setFactor] = useState('2')
  const [columns, setColumns] = useState('4')
  const [spacing, setSpacing] = useState('16"')
  const [polarCount, setPolarCount] = useState('6')

  const node = selection ? doc.nodes[selection] : null
  const disabled = !node

  const degrees = (value) => (Number(value) * Math.PI) / 180

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Transform
      </h2>

      {disabled ? (
        <p className="text-[11px] text-slate-500">Select something to transform it.</p>
      ) : (
        <div className="space-y-1.5">
          <Row
            value={offset}
            onChange={setOffset}
            label="Offset"
            onApply={() => transform('offset', { distance: parseLength(offset) ?? 0 })}
          />
          <Row
            value={angle}
            onChange={setAngle}
            label="Rotate°"
            onApply={() => transform('rotate', { angle: degrees(angle) })}
          />
          <Row
            value={angle}
            onChange={setAngle}
            label="Mirror°"
            onApply={() => transform('mirror', { angle: degrees(angle) })}
          />
          <Row
            value={factor}
            onChange={setFactor}
            label="Scale ×"
            onApply={() => transform('scale', { factor: Number(factor) })}
          />

          <div className="flex items-center gap-1">
            <span className="w-16 shrink-0 text-[11px] text-slate-400">Array</span>
            <input
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-10 rounded bg-slate-800 px-1 py-1 text-right text-[11px] text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
            />
            <span className="text-[11px] text-slate-600">@</span>
            <input
              value={spacing}
              onChange={(e) => setSpacing(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-14 rounded bg-slate-800 px-1 py-1 text-right text-[11px] text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
            />
            <button
              onClick={() =>
                transform('arrayRectangular', {
                  columns: Number(columns),
                  rows: 1,
                  spacingX: parseLength(spacing) ?? 0,
                  spacingY: 0,
                })
              }
              className="rounded bg-slate-700 px-2 py-1 text-[11px] text-slate-100 transition hover:bg-slate-600"
            >
              Go
            </button>
          </div>

          <Row
            value={polarCount}
            onChange={setPolarCount}
            label="Polar ×"
            onApply={() => transform('arrayPolar', { count: Number(polarCount) })}
          />
        </div>
      )}
    </div>
  )
}

function Row({ label, value, onChange, onApply }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-16 shrink-0 text-[11px] text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') onApply()
        }}
        className="flex-1 rounded bg-slate-800 px-1.5 py-1 text-right font-mono text-[11px] text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-500"
      />
      <button
        onClick={onApply}
        className="rounded bg-slate-700 px-2 py-1 text-[11px] text-slate-100 transition hover:bg-slate-600"
      >
        Go
      </button>
    </div>
  )
}
