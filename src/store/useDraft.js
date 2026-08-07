import { create } from 'zustand'
import {
  createDocument,
  addNode,
  updateNode,
  convertNode,
  removeNode,
  computeTakeoff,
  listSegments,
} from '../core/doc.js'
import { parseLength, snapToFraction } from '../core/units.js'
import { saveDocument, loadDocument, clearDocument } from '../core/persist.js'

/**
 * Interaction state.
 *
 * The document itself is immutable — every edit swaps in a new one — so undo
 * is just holding onto the previous documents. Interaction state (which tool,
 * where the pending line started, what the cursor currently infers) lives
 * alongside it but is never part of history.
 */
export const useDraft = create((set, get) => ({
  doc: loadDocument(),
  past: [],
  future: [],

  /** Id of the selected node, or null. */
  selection: null,
  tool: 'line',
  /** Where the in-progress line began, or null when not drawing. */
  anchor: null,
  /** Latest inference result, written every pointer move by the viewport. */
  snap: null,
  /** 'axisX' | 'axisY' | 'axisZ' | null — set by arrow keys. */
  lockedAxis: null,
  /** What the user has typed into the value box, if anything. */
  typed: '',
  view: 'plan',
  gridStep: 12,

  setTool: (tool) => set({ tool, anchor: null, typed: '', lockedAxis: null }),
  select: (selection) => set({ selection }),
  setView: (view) => set({ view }),
  setSnap: (snap) => set({ snap }),
  setTyped: (typed) => set({ typed }),
  setLockedAxis: (lockedAxis) => set({ lockedAxis }),

  /** Push a new document onto history, and persist it. */
  commit: (nextDoc) => {
    saveDocument(nextDoc)
    set((state) => ({
      doc: nextDoc,
      past: [...state.past, state.doc],
      future: [],
    }))
  },

  /** Turn the selected edge into a railing run. */
  promoteSelection: (type) => {
    const { selection, doc, commit } = get()
    if (!selection || !doc.nodes[selection]) return
    commit(convertNode(doc, selection, type))
  },

  /** Edit one parameter of the selected node. */
  editSelection: (key, value) => {
    const { selection, doc, commit } = get()
    if (!selection || !doc.nodes[selection]) return
    if (!Number.isFinite(value)) return
    commit(updateNode(doc, selection, { [key]: value }))
  },

  deleteSelection: () => {
    const { selection, doc, commit } = get()
    if (!selection || !doc.nodes[selection]) return
    commit(removeNode(doc, selection))
    set({ selection: null })
  },

  /** Throw the drawing away and start over. */
  newDocument: () => {
    clearDocument()
    const doc = createDocument()
    saveDocument(doc)
    set({ doc, past: [], future: [], selection: null, anchor: null, typed: '' })
  },

  undo: () =>
    set((state) => {
      if (!state.past.length) return state
      const doc = state.past[state.past.length - 1]
      // Persist here too, or a refresh after undo resurrects the undone work.
      saveDocument(doc)
      return {
        doc,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        anchor: null,
        typed: '',
        selection: doc.nodes[state.selection] ? state.selection : null,
      }
    }),

  redo: () =>
    set((state) => {
      if (!state.future.length) return state
      const doc = state.future[0]
      saveDocument(doc)
      return {
        doc,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        anchor: null,
        typed: '',
        selection: doc.nodes[state.selection] ? state.selection : null,
      }
    }),

  /**
   * Click with the line tool. First click sets the anchor; second commits an
   * edge and — SketchUp-style — leaves the anchor at the new end so runs chain
   * without re-clicking.
   */
  clickPoint: (point, snapRefs = []) => {
    const { anchor, commit, doc, tool } = get()

    if (tool === 'select') {
      // The inference engine already worked out which node is under the
      // cursor, so selection reuses that rather than hit-testing twice.
      set({ selection: snapRefs[0] ?? null })
      return
    }

    if (!anchor) {
      set({ anchor: point, typed: '' })
      return
    }

    if (samePoint(anchor, point)) return // zero-length; ignore

    commit(addNode(doc, 'edge', { start: anchor, end: snapPoint(point) }))
    set({ anchor: snapPoint(point), typed: '', lockedAxis: null })
  },

  /**
   * Commit whatever is typed in the value box as an exact distance along the
   * current inference direction. This is the other half of what makes drafting
   * precise: you aim roughly, then state the number.
   */
  commitTyped: () => {
    const { anchor, snap, typed, doc, commit } = get()
    if (!anchor || !snap || !typed.trim()) return

    const requested = parseLength(typed)
    if (requested === null || requested === 0) {
      set({ typed: '' })
      return
    }

    const direction = normalize({
      x: snap.point.x - anchor.x,
      y: snap.point.y - anchor.y,
      z: (snap.point.z ?? 0) - (anchor.z ?? 0),
    })
    if (direction.x === 0 && direction.y === 0 && direction.z === 0) {
      set({ typed: '' })
      return
    }

    const end = {
      x: snapToFraction(anchor.x + direction.x * requested),
      y: snapToFraction(anchor.y + direction.y * requested),
      z: snapToFraction((anchor.z ?? 0) + direction.z * requested),
    }

    commit(addNode(doc, 'edge', { start: anchor, end }))
    set({ anchor: end, typed: '', lockedAxis: null })
  },

  /** Escape: abandon the in-progress line without touching the document. */
  cancel: () => set({ anchor: null, typed: '', lockedAxis: null }),

  segments: () => listSegments(get().doc),
  takeoff: () => computeTakeoff(get().doc),
}))

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6
}

function snapPoint(p) {
  return { x: snapToFraction(p.x), y: snapToFraction(p.y), z: snapToFraction(p.z ?? 0) }
}

function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z)
  return length === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / length, y: v.y / length, z: v.z / length }
}
