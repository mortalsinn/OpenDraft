import { useEffect } from 'react'
import { useDraft } from '../store/useDraft.js'
import { formatLength } from '../core/units.js'
import { distance } from '../core/doc.js'

/**
 * The value box — SketchUp's VCB.
 *
 * You never click into it. You aim the cursor to establish a direction, then
 * just start typing a number and press Enter, and the line takes that exact
 * length. That combination — rough aim, exact number — is what makes drafting
 * fast without making it imprecise.
 */
/** Human name for a push/pull parameter. */
function labelFor(key) {
  return { thickness: 'Thickness', height: 'Height', elevation: 'Elevation' }[key] ?? key
}

export default function ValueBox() {
  const anchor = useDraft((s) => s.anchor)
  const snap = useDraft((s) => s.snap)
  const pushPull = useDraft((s) => s.pushPull)
  const doc = useDraft((s) => s.doc)
  const typed = useDraft((s) => s.typed)
  const setTyped = useDraft((s) => s.setTyped)
  const commitTyped = useDraft((s) => s.commitTyped)
  const cancel = useDraft((s) => s.cancel)
  const undo = useDraft((s) => s.undo)
  const redo = useDraft((s) => s.redo)
  const setLockedAxis = useDraft((s) => s.setLockedAxis)

  useEffect(() => {
    const onKeyDown = (event) => {
      // The value box swallows bare keystrokes from anywhere on the page, so it
      // has to stand down while the user is typing into a real field —
      // otherwise entering "42" in the inspector also draws a 42" line.
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      }

      if (event.key === 'Escape') {
        cancel()
        return
      }

      if (event.key === 'Enter') {
        commitTyped()
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        setTyped(useDraft.getState().typed.slice(0, -1))
        return
      }

      // Arrow keys lock an axis, exactly as SketchUp does.
      const axisForKey = { ArrowRight: 'axisX', ArrowLeft: 'axisX', ArrowUp: 'axisZ', ArrowDown: 'axisY' }
      if (axisForKey[event.key]) {
        event.preventDefault()
        const current = useDraft.getState().lockedAxis
        const next = axisForKey[event.key]
        setLockedAxis(current === next ? null : next)
        return
      }

      // Anything that could be part of a length goes into the box.
      if (/^[0-9./'"\- ]$/.test(event.key)) {
        setTyped(useDraft.getState().typed + event.key)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setTyped, commitTyped, cancel, undo, redo, setLockedAxis])

  // During a push/pull the box tracks the parameter being dragged, so the same
  // "aim roughly, type exactly" gesture works for thickness as for length.
  const dragged = pushPull ? doc.nodes[pushPull.id]?.[pushPull.key] : null

  const live =
    dragged != null
      ? formatLength(dragged)
      : anchor && snap
        ? formatLength(distance(anchor, snap.point))
        : null

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-md bg-slate-900/95 px-3 py-2 text-sm ring-1 ring-white/10">
      <span className="text-slate-500">{pushPull ? labelFor(pushPull.key) : 'Length'}</span>
      <span
        className={`min-w-28 text-right font-mono tabular-nums ${
          typed ? 'text-amber-300' : 'text-slate-200'
        }`}
      >
        {typed || live || '—'}
      </span>
    </div>
  )
}
