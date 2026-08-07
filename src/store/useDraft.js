import { create } from 'zustand'
import {
  createDocument,
  addNode,
  updateNode,
  convertNode,
  promoteChain,
  removeNode,
  removeNodeCascade,
  nodeVertices,
  moveVertex,
  translateNode,
  computeTakeoff,
  listSegments,
  NODE_TYPES,
} from '../core/doc.js'
import { parseLength, snapToFraction } from '../core/units.js'
import { saveDocument, loadDocument, clearDocument } from '../core/persist.js'
import { makeAnchor } from '../core/dimension.js'
import {
  DEFAULT_LAYER_ID,
  addLayer,
  updateLayer,
  removeLayer,
  assignLayer,
} from '../core/layers.js'

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
  /** First end of a dimension being placed. */
  pendingAnchor: null,
  /** Latest inference result, written every pointer move by the viewport. */
  snap: null,
  /** 'axisX' | 'axisY' | 'axisZ' | null — set by arrow keys. */
  lockedAxis: null,
  /** What the user has typed into the value box, if anything. */
  typed: '',
  view: 'plan',
  gridStep: 12,
  projectName: 'Untitled',

  setProjectName: (projectName) => set({ projectName }),

  /**
   * Judge the drawing against a different code. Deliberately only changes what
   * is REPORTED — geometry is left exactly as drawn, because silently
   * reshaping a drawing someone has already checked is not acceptable.
   */
  setJurisdiction: (jurisdiction) => {
    const { doc, commit } = get()
    commit({ ...doc, jurisdiction })
  },

  /** Which layer new geometry lands on. */
  activeLayer: DEFAULT_LAYER_ID,
  setActiveLayer: (activeLayer) => set({ activeLayer }),

  toggleLayer: (id, flag) => {
    const { doc, commit } = get()
    const layer = doc.layers?.[id]
    if (!layer) return
    commit(updateLayer(doc, id, { [flag]: !layer[flag] }))
  },

  newLayer: () => {
    const { doc, commit } = get()
    const index = (doc.layerOrder?.length ?? 0) + 1
    const id = `layer-${index}-${Object.keys(doc.layers ?? {}).length}`
    commit(addLayer(doc, id, `Layer ${index}`))
    set({ activeLayer: id })
  },

  deleteLayer: (id) => {
    const { doc, commit, activeLayer } = get()
    commit(removeLayer(doc, id))
    if (activeLayer === id) set({ activeLayer: DEFAULT_LAYER_ID })
  },

  /** Move the selected object onto a layer. */
  assignSelectionToLayer: (layerId) => {
    const { doc, commit, selection } = get()
    if (!selection) return
    commit(assignLayer(doc, selection, layerId))
  },

  setTool: (tool) => set({ tool, anchor: null, pendingAnchor: null, typed: '', lockedAxis: null }),
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

  /**
   * Turn the selected edge — and everything chained to it — into one run.
   * Falls back to a plain conversion for anything that is not a raw edge.
   */
  promoteSelection: (type) => {
    const { selection, doc, commit } = get()
    const node = selection && doc.nodes[selection]
    if (!node) return

    commit(node.type === 'edge' ? promoteChain(doc, selection, type) : convertNode(doc, selection, type))
  },

  /**
   * Push/pull state. `dragging` holds what the drag started from, so the whole
   * gesture resolves against the original value rather than accumulating
   * rounding error frame by frame.
   */
  pushPull: null,

  beginPushPull: (screenY) => {
    const { selection, doc } = get()
    const node = selection && doc.nodes[selection]
    const definition = node && NODE_TYPES[node.type]
    const key = definition?.pushPull
    if (!key) return

    set({ pushPull: { id: selection, key, startY: screenY, startValue: node[key] ?? 0 } })
  },

  /**
   * Update the dragged parameter. `worldPerPixel` converts the screen drag into
   * world units so the gesture tracks the cursor at any zoom.
   */
  updatePushPull: (screenY, worldPerPixel) => {
    const { pushPull, doc } = get()
    if (!pushPull) return

    const definition = NODE_TYPES[doc.nodes[pushPull.id]?.type]
    const field = definition?.editable?.find((f) => f.key === pushPull.key)

    // Screen Y grows downward; dragging up should make things thicker.
    const delta = (pushPull.startY - screenY) * worldPerPixel
    const next = clamp(snapToFraction(pushPull.startValue + delta), field?.min ?? 0, field?.max ?? Infinity)

    // Live preview only — not pushed onto the undo stack until the drag ends,
    // or a single push/pull would leave dozens of entries behind it.
    set({ doc: updateNode(doc, pushPull.id, { [pushPull.key]: next }) })
  },

  endPushPull: () => {
    const { pushPull, doc, past } = get()
    if (!pushPull) return

    const settled = doc.nodes[pushPull.id]?.[pushPull.key]
    set({ pushPull: null })

    if (settled === pushPull.startValue) return // nothing actually moved

    // Rewind the live preview and commit the net change as one history entry.
    saveDocument(doc)
    set({ past: [...past, updateNode(doc, pushPull.id, { [pushPull.key]: pushPull.startValue })], future: [] })
  },

  /**
   * Move state. Holds the document as it was when the drag started, so every
   * frame resolves against the original rather than compounding.
   */
  moving: null,

  /**
   * Begin a move. Grabbing within snapping distance of a vertex moves just
   * that vertex; grabbing anywhere else on the object moves the whole thing.
   */
  beginMove: (worldPoint, snapRefs = []) => {
    const { doc } = get()
    const id = snapRefs[0]
    const node = id && doc.nodes[id]
    if (!node) return

    const vertices = nodeVertices(node)
    let index = null
    let nearest = Infinity

    vertices.forEach((vertex, i) => {
      const d = Math.hypot(vertex.x - worldPoint.x, vertex.y - worldPoint.y)
      if (d < nearest) {
        nearest = d
        index = i
      }
    })

    // The click already snapped, so landing exactly on a vertex is what
    // distinguishes "drag this corner" from "drag the whole object".
    const onVertex = nearest < 1e-6

    set({
      moving: { id, index: onVertex ? index : null, grab: worldPoint, before: doc },
      selection: id,
    })
  },

  /** Update the move. `point` is the inferred target, so moves snap. */
  updateMove: (point) => {
    const { moving } = get()
    if (!moving) return

    const next =
      moving.index !== null
        ? moveVertex(moving.before, moving.id, moving.index, point)
        : translateNode(moving.before, moving.id, {
            x: point.x - moving.grab.x,
            y: point.y - moving.grab.y,
            z: (point.z ?? 0) - (moving.grab.z ?? 0),
          })

    // Live preview; history is written once, on release.
    set({ doc: next })
  },

  endMove: () => {
    const { moving, doc, past } = get()
    if (!moving) return
    set({ moving: null })

    if (doc === moving.before) return // never actually moved

    saveDocument(doc)
    set({ past: [...past, moving.before], future: [] })
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
    // Cascades to the dimensions that measured it, so no invisible orphans
    // are left behind. One undo restores the lot.
    commit(removeNodeCascade(doc, selection))
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

    // The dimension tool takes two clicks: the first parks an anchor, the
    // second creates the dimension between them.
    if (tool === 'dimension') {
      const anchor = makeAnchor(doc, point, snapRefs)
      const { pendingAnchor } = get()

      if (!pendingAnchor) {
        set({ pendingAnchor: anchor })
        return
      }

      commit(addNode(doc, 'dimension', { from: pendingAnchor, to: anchor, layer: get().activeLayer }))
      set({ pendingAnchor: null })
      return
    }

    if (tool === 'note') {
      commit(addNode(doc, 'note', { position: point, text: 'Note', layer: get().activeLayer }))
      return
    }

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

    commit(addNode(doc, 'edge', { start: anchor, end: snapPoint(point), layer: get().activeLayer }))
    set({ anchor: snapPoint(point), typed: '', lockedAxis: null })
  },

  /**
   * Commit whatever is typed in the value box as an exact distance along the
   * current inference direction. This is the other half of what makes drafting
   * precise: you aim roughly, then state the number.
   */
  commitTyped: () => {
    const { anchor, snap, typed, doc, commit, pushPull, selection, tool } = get()
    if (!typed.trim()) return

    // During a push/pull — or with something selected and the tool active —
    // a typed number sets the parameter exactly. Dragging gets you close at
    // whatever the zoom allows; typing is how you land on 5 1/2".
    if (tool === 'pushpull' && (pushPull || selection)) {
      const id = pushPull?.id ?? selection
      const node = doc.nodes[id]
      const key = NODE_TYPES[node?.type]?.pushPull
      const exact = parseLength(typed)
      if (!node || !key || exact === null) {
        set({ typed: '' })
        return
      }

      const field = NODE_TYPES[node.type].editable?.find((f) => f.key === key)
      const value = clamp(exact, field?.min ?? 0, field?.max ?? Infinity)

      // Land on the original value as the undo point, not the dragged preview.
      const base = pushPull ? updateNode(doc, id, { [key]: pushPull.startValue }) : doc
      set({ doc: base, pushPull: null, typed: '' })
      get().commit(updateNode(base, id, { [key]: value }))
      return
    }

    if (!anchor || !snap) return

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

    commit(addNode(doc, 'edge', { start: anchor, end, layer: get().activeLayer }))
    set({ anchor: end, typed: '', lockedAxis: null })
  },

  /** Escape: abandon the in-progress line without touching the document. */
  cancel: () => set({ anchor: null, pendingAnchor: null, typed: '', lockedAxis: null }),

  /** Change a note's text. */
  setNoteText: (id, text) => {
    const { doc, commit } = get()
    if (doc.nodes[id]?.type !== 'note') return
    commit(updateNode(doc, id, { text }))
  },

  segments: () => listSegments(get().doc),
  takeoff: () => computeTakeoff(get().doc),
}))

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6
}

function snapPoint(p) {
  return { x: snapToFraction(p.x), y: snapToFraction(p.y), z: snapToFraction(p.z ?? 0) }
}

// A handle on the store from the console during development. The canvas eats
// most interactions, so without this there is no way to see why a gesture did
// not take.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__draft = useDraft
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z)
  return length === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / length, y: v.y / length, z: v.z / length }
}
