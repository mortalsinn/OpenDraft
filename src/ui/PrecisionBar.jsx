import { useDraft } from '../store/useDraft.js'
import { SNAP_KINDS } from '../core/inference.js'

/** The snap kinds worth exposing a toggle for. */
const TOGGLEABLE = ['endpoint', 'midpoint', 'centre', 'quadrant', 'intersection', 'onEdge', 'extension', 'grid']

const POLAR_STEPS = [
  { label: 'Off', degrees: 0 },
  // Ortho is a HARD constraint — it always holds. The angle presets are soft
  // tracking, grabbing only when you aim near an increment.
  { label: 'Ortho', degrees: 90, hard: true },
  { label: '45°', degrees: 45 },
  { label: '30°', degrees: 30 },
  { label: '15°', degrees: 15 },
]

/**
 * Ortho, polar tracking and per-snap toggles.
 *
 * This is what turns the inference engine from clever into controllable.
 * Object snapping is wonderful right up until the one you do not want keeps
 * winning, and being able to silence it is the difference between precise and
 * infuriating.
 */
export default function PrecisionBar() {
  const polarIncrement = useDraft((s) => s.polarIncrement)
  const setPolarIncrement = useDraft((s) => s.setPolarIncrement)
  const disabledSnaps = useDraft((s) => s.disabledSnaps)
  const toggleSnap = useDraft((s) => s.toggleSnap)

  const currentDegrees = Math.round((polarIncrement * 180) / Math.PI)

  return (
    <div className="border-b border-white/10 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Precision
      </h2>

      <div className="mb-2 flex overflow-hidden rounded ring-1 ring-white/10">
        {POLAR_STEPS.map((step) => (
          <button
            key={step.label}
            onClick={() => setPolarIncrement(step.degrees, !!step.hard)}
            className={`flex-1 px-1 py-1 text-[11px] transition ${
              currentDegrees === step.degrees
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {TOGGLEABLE.map((kind) => {
          const off = disabledSnaps.includes(kind)
          return (
            <button
              key={kind}
              onClick={() => toggleSnap(kind)}
              title={off ? 'Switched off' : 'Active'}
              className={`rounded px-1.5 py-0.5 text-[10px] transition ${
                off
                  ? 'bg-slate-800 text-slate-600 line-through'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
              style={off ? undefined : { color: SNAP_KINDS[kind]?.color }}
            >
              {SNAP_KINDS[kind]?.label ?? kind}
            </button>
          )
        })}
      </div>
    </div>
  )
}
