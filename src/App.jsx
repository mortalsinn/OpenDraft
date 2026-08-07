import Viewport from './scene/Viewport.jsx'
import ValueBox from './ui/ValueBox.jsx'
import TakeoffPanel from './ui/TakeoffPanel.jsx'
import Inspector from './ui/Inspector.jsx'
import ExportMenu from './ui/ExportMenu.jsx'
import CompliancePanel from './ui/CompliancePanel.jsx'
import LayersPanel from './ui/LayersPanel.jsx'
import ComponentsPanel from './ui/ComponentsPanel.jsx'
import TransformPanel from './ui/TransformPanel.jsx'
import BlocksPanel from './ui/BlocksPanel.jsx'
import PrecisionBar from './ui/PrecisionBar.jsx'
import SheetsPanel from './ui/SheetsPanel.jsx'
import { useDraft } from './store/useDraft.js'

const SEGMENTED = 'px-3 py-1 text-xs font-medium transition'

export default function App() {
  const view = useDraft((s) => s.view)
  const setView = useDraft((s) => s.setView)
  const tool = useDraft((s) => s.tool)
  const setTool = useDraft((s) => s.setTool)
  const snap = useDraft((s) => s.snap)
  const lockedAxis = useDraft((s) => s.lockedAxis)
  const selectionCount = useDraft((s) => s.selection.length)
  const undo = useDraft((s) => s.undo)
  const past = useDraft((s) => s.past)
  const newDocument = useDraft((s) => s.newDocument)
  const projectName = useDraft((s) => s.projectName)
  const setProjectName = useDraft((s) => s.setProjectName)
  const polygonSides = useDraft((s) => s.polygonSides)
  const setPolygonSides = useDraft((s) => s.setPolygonSides)
  const editRadius = useDraft((s) => s.editRadius)
  const setEditRadius = useDraft((s) => s.setEditRadius)

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-white/10 px-4 py-2">
        <span className="font-semibold tracking-tight">
          Open<span className="text-amber-400">Draft</span>
        </span>

        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Project name"
          className="w-44 rounded bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none ring-1 ring-white/10 focus:ring-amber-500"
        />

        <div className="flex overflow-hidden rounded-md ring-1 ring-white/10">
          {[
            ['line', 'Line'],
            ['select', 'Select'],
            ['move', 'Move'],
            ['pushpull', 'Push/Pull'],
            ['rectangle', 'Rect'],
            ['polygon', 'Polygon'],
            ['circle', 'Circle'],
            ['arc', 'Arc'],
            ['trim', 'Trim'],
            ['extend', 'Extend'],
            ['fillet', 'Fillet'],
            ['chamfer', 'Chamfer'],
            ['dimension', 'Dimension'],
            ['note', 'Note'],
            ['block', 'Block'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setTool(mode)}
              className={`${SEGMENTED} ${
                tool === mode ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-md ring-1 ring-white/10">
          {['plan', '3d'].map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`${SEGMENTED} ${
                view === mode ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {mode === 'plan' ? 'Plan' : '3D'}
            </button>
          ))}
        </div>

        {(tool === 'fillet' || tool === 'chamfer') && (
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            {tool === 'fillet' ? 'Radius' : 'Setback'}
            <input
              type="number"
              min={0}
              value={editRadius}
              onChange={(event) => setEditRadius(Number(event.target.value))}
              onKeyDown={(event) => event.stopPropagation()}
              className="w-16 rounded bg-slate-900 px-1.5 py-1 text-slate-200 outline-none ring-1 ring-white/10 focus:ring-amber-500"
            />
          </label>
        )}

        {tool === 'polygon' && (
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            Sides
            <input
              type="number"
              min={3}
              max={64}
              value={polygonSides}
              onChange={(event) => setPolygonSides(Number(event.target.value))}
              onKeyDown={(event) => event.stopPropagation()}
              className="w-14 rounded bg-slate-900 px-1.5 py-1 text-slate-200 outline-none ring-1 ring-white/10 focus:ring-amber-500"
            />
          </label>
        )}

        <button
          onClick={undo}
          disabled={!past.length}
          className="rounded px-2 py-1 text-xs text-slate-400 ring-1 ring-white/10 transition hover:text-slate-100 disabled:opacity-30"
        >
          Undo
        </button>

        <button
          onClick={() => {
            if (confirm('Discard this drawing and start over?')) newDocument()
          }}
          className="rounded px-2 py-1 text-xs text-slate-400 ring-1 ring-white/10 transition hover:text-slate-100"
        >
          New
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {selectionCount > 1 && (
            <span className="rounded bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300">
              {selectionCount} selected
            </span>
          )}
          {lockedAxis && (
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-medium text-amber-300">
              Locked: {lockedAxis.replace('axis', '')}
            </span>
          )}
          <span>
            {tool === 'line' &&
              'Click to draw · type a length · Enter · Esc cancels · arrows lock an axis'}
            {tool === 'select' &&
              'Click to select · shift adds · drag right for a window, left to cross · Ctrl+C/V/D/A'}
            {tool === 'move' &&
              'Drag a corner to move it, or anywhere else on an object to move the whole thing'}
            {tool === 'pushpull' &&
              'Select something first, then drag up or down · type a size and press Enter'}
            {tool === 'dimension' &&
              'Click two points · snapping to a corner binds the dimension so it follows the geometry'}
            {tool === 'note' && 'Click to drop a note, then edit its text on the right'}
            {tool === 'block' && 'Pick a symbol on the right, set its attributes, then click to place'}
            {tool === 'rectangle' &&
              'Click two corners · or type a size like 120,96 or 10′,8′ and press Enter'}
            {tool === 'polygon' && 'Click the centre, then a corner · sides set on the right'}
            {tool === 'circle' && 'Click the centre, then a point on the rim'}
            {tool === 'arc' && 'Click both ends, then a point the arc passes through'}
            {tool === 'trim' && 'Click the part of a line to KEEP, then the line to cut it at'}
            {tool === 'extend' && 'Click the line to stretch, then the line to meet'}
            {(tool === 'fillet' || tool === 'chamfer') &&
              'Click two lines that meet · radius set on the right'}
          </span>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <main className="relative flex-1">
          <Viewport />
          <ValueBox />
          <div className="pointer-events-none absolute bottom-4 left-4 text-xs text-slate-500">
            {snap?.label ? (
              <span style={{ color: snap.color }}>{snap.label}</span>
            ) : (
              <span>—</span>
            )}
          </div>
        </main>
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-slate-900/60">
          <Inspector />
          <PrecisionBar />
          <TransformPanel />
          <BlocksPanel />
          <ComponentsPanel />
          <LayersPanel />
          <CompliancePanel />
          <TakeoffPanel />
          <SheetsPanel />
          <ExportMenu />
        </aside>
      </div>
    </div>
  )
}
