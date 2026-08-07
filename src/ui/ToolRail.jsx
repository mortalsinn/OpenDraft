import {
  MousePointer2,
  Move,
  Slash,
  Square,
  Hexagon,
  Circle,
  Spline,
  Scissors,
  ArrowRightToLine,
  CornerDownRight,
  Triangle,
  Ruler,
  StickyNote,
  Box,
  Boxes,
  ArrowUpDown,
  Maximize,
  Rotate3d,
  Grid3x3,
} from 'lucide-react'
import { useDraft } from '../store/useDraft.js'
import { toolGroupsForView } from '../core/tools.js'

/**
 * The tool rail.
 *
 * Two palettes, because 2D drafting and 3D modelling genuinely want different
 * tools. Trim, fillet and dimension are plan-view operations — offering them
 * while you are orbiting a model is clutter that implies they will work when
 * they will not. Conversely push/pull is meaningless in a flat plan view.
 *
 * Tools common to both keep the same position in the rail, so switching view
 * does not move the thing your hand is already reaching for.
 */

/**
 * Which icon stands for which tool. The GROUPING lives in core/tools.js, so
 * the store can consult the same lists when the view changes without knowing
 * anything about icons.
 */
const ICONS = {
  select: MousePointer2,
  move: Move,
  line: Slash,
  rectangle: Square,
  polygon: Hexagon,
  circle: Circle,
  arc: Spline,
  trim: Scissors,
  extend: ArrowRightToLine,
  fillet: CornerDownRight,
  chamfer: Triangle,
  dimension: Ruler,
  note: StickyNote,
  block: Box,
  component: Boxes,
  pushpull: ArrowUpDown,
}

export default function ToolRail() {
  const view = useDraft((s) => s.view)
  const tool = useDraft((s) => s.tool)
  const setTool = useDraft((s) => s.setTool)
  const setView = useDraft((s) => s.setView)
  const fitView = useDraft((s) => s.fitView)

  const groups = toolGroupsForView(view)

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-slate-900/60 py-2">
      {/* Which world you are in, above the tools it changes. */}
      <div className="mb-1 flex flex-col gap-0.5 rounded-md p-0.5 ring-1 ring-white/10">
        <ViewButton active={view === 'plan'} onClick={() => setView('plan')} title="Plan view" icon={Grid3x3} />
        <ViewButton active={view === '3d'} onClick={() => setView('3d')} title="3D view" icon={Rotate3d} />
      </div>

      {groups.map((group, index) => (
        <div key={index} className="flex w-full flex-col items-center gap-0.5">
          {index > 0 && <div className="my-1 h-px w-6 bg-white/10" />}
          {group.map(([id, label]) => (
            <ToolButton
              key={id}
              active={tool === id}
              onClick={() => setTool(id)}
              title={label}
              icon={ICONS[id]}
            />
          ))}
        </div>
      ))}

      <div className="mt-auto flex flex-col items-center gap-0.5">
        <div className="my-1 h-px w-6 bg-white/10" />
        <ToolButton onClick={fitView} title="Zoom to fit" icon={Maximize} />
      </div>
    </nav>
  )
}

function ToolButton({ active, onClick, title, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active ? 'true' : undefined}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
        active
          ? 'bg-sky-500 text-slate-950'
          : 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}

function ViewButton({ active, onClick, title, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded transition ${
        active ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
      }`}
    >
      <Icon size={15} />
    </button>
  )
}
