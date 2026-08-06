import Viewport from './scene/Viewport.jsx'
import ValueBox from './ui/ValueBox.jsx'
import TakeoffPanel from './ui/TakeoffPanel.jsx'
import { useDraft } from './store/useDraft.js'

export default function App() {
  const view = useDraft((s) => s.view)
  const setView = useDraft((s) => s.setView)
  const snap = useDraft((s) => s.snap)
  const lockedAxis = useDraft((s) => s.lockedAxis)
  const undo = useDraft((s) => s.undo)
  const past = useDraft((s) => s.past)

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-white/10 px-4 py-2">
        <span className="font-semibold tracking-tight">
          Open<span className="text-amber-400">Draft</span>
        </span>

        <div className="flex overflow-hidden rounded-md ring-1 ring-white/10">
          {['plan', '3d'].map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`px-3 py-1 text-xs font-medium transition ${
                view === mode ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {mode === 'plan' ? 'Plan' : '3D'}
            </button>
          ))}
        </div>

        <button
          onClick={undo}
          disabled={!past.length}
          className="rounded px-2 py-1 text-xs text-slate-400 ring-1 ring-white/10 transition hover:text-slate-100 disabled:opacity-30"
        >
          Undo
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {lockedAxis && (
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-medium text-amber-300">
              Locked: {lockedAxis.replace('axis', '')}
            </span>
          )}
          <span>
            Click to draw · type a length · <kbd>Enter</kbd> · <kbd>Esc</kbd> cancels · arrows lock an axis
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
        <TakeoffPanel />
      </div>
    </div>
  )
}
