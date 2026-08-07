import { useDraft } from '../store/useDraft.js'
import { layerCounts, DEFAULT_LAYER_ID } from '../core/layers.js'
import { Eye, EyeOff, Lock, LockOpen, DollarSign, Plus, Trash2 } from 'lucide-react'

/**
 * Layer list.
 *
 * The takeoff toggle is deliberately separate from the eye. Hiding something to
 * see behind it must not quietly drop it from the quote — excluding work from
 * a contract is a decision, not a side effect of looking at the drawing.
 */
export default function LayersPanel() {
  const doc = useDraft((s) => s.doc)
  const activeLayer = useDraft((s) => s.activeLayer)
  const setActiveLayer = useDraft((s) => s.setActiveLayer)
  const toggleLayer = useDraft((s) => s.toggleLayer)
  const newLayer = useDraft((s) => s.newLayer)
  const deleteLayer = useDraft((s) => s.deleteLayer)

  const counts = layerCounts(doc)
  const order = doc.layerOrder ?? []

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Layers</h2>
        <button
          onClick={newLayer}
          title="Add a layer"
          className="text-slate-500 transition hover:text-slate-200"
        >
          <Plus size={13} />
        </button>
      </div>

      <ul className="space-y-0.5">
        {order.map((id) => {
          const layer = doc.layers[id]
          if (!layer) return null
          const isActive = id === activeLayer

          return (
            <li
              key={id}
              className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs transition ${
                isActive ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <button
                onClick={() => toggleLayer(id, 'visible')}
                title={layer.visible ? 'Hide' : 'Show'}
                className={layer.visible ? 'text-slate-300' : 'text-slate-600'}
              >
                {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>

              <button
                onClick={() => toggleLayer(id, 'locked')}
                title={layer.locked ? 'Unlock' : 'Lock'}
                className={layer.locked ? 'text-amber-400' : 'text-slate-600'}
              >
                {layer.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>

              <button
                onClick={() => toggleLayer(id, 'includeInTakeoff')}
                title={
                  layer.includeInTakeoff
                    ? 'Counted in the takeoff — click to exclude'
                    : 'Excluded from the takeoff'
                }
                className={layer.includeInTakeoff ? 'text-emerald-400' : 'text-slate-600 line-through'}
              >
                <DollarSign size={12} />
              </button>

              <button
                onClick={() => setActiveLayer(id)}
                className="flex-1 truncate text-left text-slate-200"
                title="Draw on this layer"
              >
                {layer.name}
              </button>

              <span className="tabular-nums text-slate-600">{counts[id] ?? 0}</span>

              {id !== DEFAULT_LAYER_ID && (
                <button
                  onClick={() => deleteLayer(id)}
                  title="Delete — its contents move to Default"
                  className="text-slate-600 transition hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
