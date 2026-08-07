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
  makeComponent,
  placeInstance,
  addChainedEdges,
  applyEdgeEdit,
  duplicateNode,
  insertCopy,
  transformNode,
  arrayNode,
  NODE_TYPES,
} from '../core/doc.js'
import { SHAPE_TOOLS, parsePair } from '../core/shapes.js'
import { arcThroughPoints } from '../core/curves.js'
import { defaultAttributes } from '../core/blocks.js'
import {
  rotatePoint,
  scalePoint,
  mirrorPoint,
  offsetPolyline,
  rectangularArray,
  polarArray,
} from '../core/transform.js'
import { withVertices } from '../core/vertices.js'
import { parseLength, snapToFraction } from '../core/units.js'
import { saveDocument, loadDocument, clearDocument } from '../core/persist.js'
import { makeAnchor } from '../core/dimension.js'
import { applySelection, boxFromDrag, nodesInBox } from '../core/selection.js'
import { createSheet, createViewport, makeSheetId, frameBounds } from '../core/sheets.js'
import { documentBounds } from '../core/plan.js'
import { isSelectable } from '../core/layers.js'
import {
  DEFAULT_LAYER_ID,
  addLayer,
  updateLayer,
  removeLayer,
  assignLayer,
} from '../core/layers.js'

/** Tools that work on two picked edges. */
const EDGE_EDIT_TOOLS = new Set(['trim', 'extend', 'fillet', 'chamfer'])

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

  /**
   * Selected node ids. A SET, not a single id — every transform, delete and
   * clipboard operation works on however many are chosen.
   *
   * `primary` below is the one the single-object panels show: with several
   * selected, the LAST one picked is the one you were most recently thinking
   * about, which is the least surprising thing to inspect.
   */
  selection: [],
  tool: 'line',
  /** Where the in-progress line began, or null when not drawing. */
  anchor: null,
  /** First end of a dimension being placed. */
  pendingAnchor: null,
  /** Base point of a shape being drawn — first corner, or centre. */
  shapeBase: null,
  /** Second point of a three-point arc. */
  arcSecond: null,
  /** True while shift is held — selection adds instead of replacing. */
  additive: false,
  setAdditive: (additive) => set({ additive }),

  /** Corner a selection box is being dragged from. */
  boxFrom: null,

  beginBox: (point) => set({ boxFrom: point }),

  /** Finish a box selection, catching whatever the drag enclosed or crossed. */
  endBox: (point) => {
    const { boxFrom, doc, additive } = get()
    set({ boxFrom: null })
    if (!boxFrom) return

    // A drag that never really moved is a click, and clicks are handled
    // elsewhere — treating it as a box would select nothing and clear the set.
    if (Math.hypot(point.x - boxFrom.x, point.y - boxFrom.y) < 1) return

    const box = boxFromDrag(boxFrom, point)
    const caught = nodesInBox(
      Object.values(doc.nodes).filter((node) => isSelectable(doc, node)),
      box,
      (node) => listSegments(doc).filter((s) => s.id === node.id).map((s) => [s.start, s.end]),
    )

    set((state) => ({ selection: applySelection(state.selection, caught, { additive }) }))
  },

  /** First edge picked for a two-edge edit, and where it was clicked. */
  editFirst: null,
  /** Radius for fillet, setback for chamfer. */
  editRadius: 6,
  setEditRadius: (editRadius) => set({ editRadius: Math.max(0, editRadius) }),
  polygonSides: 6,
  setPolygonSides: (polygonSides) => set({ polygonSides: Math.max(3, Math.round(polygonSides)) }),
  /** Latest inference result, written every pointer move by the viewport. */
  snap: null,
  /** 'axisX' | 'axisY' | 'axisZ' | null — set by arrow keys. */
  lockedAxis: null,
  /** What the user has typed into the value box, if anything. */
  typed: '',
  view: 'plan',
  gridStep: 12,

  /**
   * Precision aids. `polarIncrement` is in radians; ortho is simply 90°.
   * `disabledSnaps` silences individual snap kinds — object snapping is
   * wonderful until the one you do not want keeps winning.
   */
  polarIncrement: 0,
  polarHard: false,
  disabledSnaps: [],
  setPolarIncrement: (degrees, hard = false) =>
    set({ polarIncrement: degrees > 0 ? (degrees * Math.PI) / 180 : 0, polarHard: hard }),
  toggleSnap: (kind) =>
    set((state) => ({
      disabledSnaps: state.disabledSnaps.includes(kind)
        ? state.disabledSnaps.filter((k) => k !== kind)
        : [...state.disabledSnaps, kind],
    })),
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

  /** The sheet being edited in the sheets panel. */
  activeSheet: 'sheet1',
  setActiveSheet: (activeSheet) => set({ activeSheet }),

  newSheet: () => {
    const { doc, commit } = get()
    const index = (doc.sheetOrder?.length ?? 0) + 1
    const id = makeSheetId()
    const sheet = createSheet(id, {
      name: `Sheet ${index}`,
      sheetNumber: `A-${index}`,
      viewports: [createViewport()],
    })

    commit({
      ...doc,
      sheets: { ...doc.sheets, [id]: sheet },
      sheetOrder: [...(doc.sheetOrder ?? []), id],
    })
    set({ activeSheet: id })
  },

  deleteSheet: (id) => {
    const { doc, commit, activeSheet } = get()
    // A document with no sheet cannot be exported as a set, so the last one
    // stays.
    if ((doc.sheetOrder?.length ?? 0) <= 1) return

    const sheets = { ...doc.sheets }
    delete sheets[id]
    const sheetOrder = doc.sheetOrder.filter((sheetId) => sheetId !== id)

    commit({ ...doc, sheets, sheetOrder })
    if (activeSheet === id) set({ activeSheet: sheetOrder[0] })
  },

  updateSheet: (id, changes) => {
    const { doc, commit } = get()
    if (!doc.sheets?.[id]) return
    commit({ ...doc, sheets: { ...doc.sheets, [id]: { ...doc.sheets[id], ...changes } } })
  },

  /** Frame a sheet's first viewport onto the drawing at the largest scale that fits. */
  fitViewport: (id) => {
    const { doc, commit } = get()
    const sheet = doc.sheets?.[id]
    if (!sheet?.viewports?.length) return

    const bounds = documentBounds(doc)
    if (!bounds) return

    const viewports = [frameBounds(sheet.viewports[0], bounds), ...sheet.viewports.slice(1)]
    commit({ ...doc, sheets: { ...doc.sheets, [id]: { ...sheet, viewports } } })
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

  /** Turn the selection into a reusable component, leaving an instance behind. */
  makeComponentFromSelection: (name) => {
    const { doc, commit } = get()
    const id = get().primary()
    if (!id) return
    commit(makeComponent(doc, id, name || 'Component'))
  },

  /**
   * Arm the component tool with a definition. The next click places one.
   */
  pendingDefinition: null,
  setPendingDefinition: (pendingDefinition) => set({ pendingDefinition, tool: 'component' }),

  /** The block armed for insertion, and the attributes it will carry. */
  pendingBlock: null,
  blockAttributes: null,
  armBlock: (blockId) =>
    set({ pendingBlock: blockId, blockAttributes: defaultAttributes(blockId), tool: 'block' }),
  setBlockAttribute: (tag, value) =>
    set((state) => ({ blockAttributes: { ...state.blockAttributes, [tag]: value } })),

  /** Change an attribute on an already-placed block. */
  setPlacedAttribute: (tag, value) => {
    const { doc, commit } = get()
    const id = get().primary()
    const node = id && doc.nodes[id]
    if (node?.type !== 'blockInstance') return
    commit(updateNode(doc, id, { attributes: { ...node.attributes, [tag]: value } }))
  },

  /**
   * Transform the selection.
   *
   * All of these work about the selection's own centre unless a base point is
   * given, so a transform never silently flings an object across the drawing.
   */
  transformSelection: (kind, options = {}) => {
    const { doc, commit, selection } = get()
    const ids = selection.filter((id) => doc.nodes[id])
    if (!ids.length) return

    // One shared pivot for the whole set. Transforming each object about its
    // OWN centre would scatter a selection instead of moving it as a unit.
    const base = options.base ?? setCentroid(doc, ids)

    const overAll = (transform) => {
      let next = doc
      for (const id of ids) next = transformNode(next, id, transform)
      commit(next)
    }

    if (kind === 'rotate') {
      overAll((p) => rotatePoint(p, base, options.angle ?? 0))
      return
    }

    if (kind === 'scale') {
      const factor = options.factor ?? 1
      if (!(factor > 0)) return
      overAll((p) => scalePoint(p, base, factor))
      return
    }

    if (kind === 'mirror') {
      // Mirror about a line through the centre, at the given angle.
      const angle = options.angle ?? 0
      const far = { x: base.x + Math.cos(angle), y: base.y + Math.sin(angle), z: base.z ?? 0 }
      overAll((p) => mirrorPoint(p, base, far))
      return
    }

    if (kind === 'offset') {
      const distance = options.distance ?? 0
      if (!distance) return

      let next = doc
      for (const id of ids) {
        const source = next.nodes[id]
        const points = nodeVertices(source)
        if (points.length < 2) continue

        const moved = offsetPolyline(points, distance, !!source.closed)
        const { doc: withCopy, id: copyId } = duplicateNode(next, id)
        if (!copyId) continue

        next = {
          ...withCopy,
          nodes: { ...withCopy.nodes, [copyId]: withVertices(withCopy.nodes[copyId], moved) },
        }
      }
      commit(next)
      return
    }

    if (kind === 'arrayRectangular') {
      const { columns = 2, rows = 1, spacingX = 24, spacingY = 24 } = options
      // Drop the identity placement — the original is already there.
      const placements = rectangularArray(columns, rows, spacingX, spacingY).slice(1)
      const transforms = placements.map((offset) => (p) => ({
        x: p.x + offset.x,
        y: p.y + offset.y,
        z: p.z ?? 0,
      }))

      let next = doc
      for (const id of ids) next = arrayNode(next, id, transforms)
      commit(next)
      return
    }

    if (kind === 'arrayPolar') {
      const { count = 6, totalAngle = Math.PI * 2, centre = base } = options
      const angles = polarArray(count, totalAngle).slice(1)
      const transforms = angles.map((angle) => (p) => rotatePoint(p, centre, angle))

      let next = doc
      for (const id of ids) next = arrayNode(next, id, transforms)
      commit(next)
    }
  },

  /**
   * Clipboard. Holds copies of the nodes themselves, so pasting still works
   * after the originals have been deleted.
   */
  clipboard: [],

  copySelection: () => {
    const { doc, selection } = get()
    const copied = selection.map((id) => doc.nodes[id]).filter(Boolean)
    if (copied.length) set({ clipboard: copied.map((node) => ({ ...node })) })
  },

  /** Paste, offset slightly so the copies are visible rather than hidden underneath. */
  pasteClipboard: (offset = { x: 12, y: -12, z: 0 }) => {
    const { doc, commit, clipboard, activeLayer } = get()
    if (!clipboard.length) return

    let next = doc
    const pasted = []

    for (const node of clipboard) {
      const { doc: withCopy, id } = insertCopy(next, { ...node, layer: activeLayer }, offset)
      if (!id) continue
      next = withCopy
      pasted.push(id)
    }

    commit(next)
    // Selecting what you just pasted is what lets you immediately move it.
    set({ selection: pasted })
  },

  /** Copy and paste in one step — the common case. */
  duplicateSelection: () => {
    get().copySelection()
    get().pasteClipboard()
  },

  /** Move the selected object onto a layer. */
  assignSelectionToLayer: (layerId) => {
    const { doc, commit, selection } = get()
    if (!selection.length) return
    // Every selected object moves, not just the one being inspected.
    let next = doc
    for (const id of selection) next = assignLayer(next, id, layerId)
    commit(next)
  },

  setTool: (tool) =>
    set({
      tool,
      anchor: null,
      pendingAnchor: null,
      shapeBase: null,
      arcSecond: null,
      editFirst: null,
      typed: '',
      lockedAxis: null,
    }),
  select: (id) => set({ selection: id ? [id] : [] }),
  selectMany: (ids, additive = false) =>
    set((state) => ({ selection: applySelection(state.selection, ids, { additive }) })),
  clearSelection: () => set({ selection: [] }),

  /** The node the single-object panels act on. */
  primary: () => {
    const { selection, doc } = get()
    for (let i = selection.length - 1; i >= 0; i--) {
      if (doc.nodes[selection[i]]) return selection[i]
    }
    return null
  },
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
    const { doc, commit } = get()
    const id = get().primary()
    const node = id && doc.nodes[id]
    if (!node) return

    commit(node.type === 'edge' ? promoteChain(doc, id, type) : convertNode(doc, id, type))
  },

  /**
   * Push/pull state. `dragging` holds what the drag started from, so the whole
   * gesture resolves against the original value rather than accumulating
   * rounding error frame by frame.
   */
  pushPull: null,

  beginPushPull: (screenY) => {
    const { doc } = get()
    const id = get().primary()
    const node = id && doc.nodes[id]
    const definition = node && NODE_TYPES[node.type]
    const key = definition?.pushPull
    if (!key) return

    set({ pushPull: { id, key, startY: screenY, startValue: node[key] ?? 0 } })
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
      selection: [id],
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
    const { doc, commit } = get()
    const id = get().primary()
    if (!id || !doc.nodes[id]) return
    // Numbers must be real — a NaN from a failed parse would silently corrupt
    // the geometry. Strings (a hatch pattern, a style) pass straight through.
    if (typeof value === 'number' && !Number.isFinite(value)) return
    commit(updateNode(doc, id, { [key]: value }))
  },

  deleteSelection: () => {
    const { selection, doc, commit } = get()
    if (!selection.length) return

    // Cascades to the dimensions that measured them, so no invisible orphans
    // are left behind. One undo restores the lot.
    let next = doc
    for (const id of selection) next = removeNodeCascade(next, id)

    commit(next)
    set({ selection: [] })
  },

  /** Throw the drawing away and start over. */
  newDocument: () => {
    clearDocument()
    const doc = createDocument()
    saveDocument(doc)
    set({ doc, past: [], future: [], selection: [], anchor: null, typed: '' })
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
        // Keep only what still exists in the restored document.
        selection: state.selection.filter((id) => doc.nodes[id]),
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
        // Keep only what still exists in the restored document.
        selection: state.selection.filter((id) => doc.nodes[id]),
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

    // Circle: centre, then a point on the rim.
    if (tool === 'circle') {
      const { shapeBase } = get()
      if (!shapeBase) {
        set({ shapeBase: point, typed: '' })
        return
      }

      const radius = Math.hypot(point.x - shapeBase.x, point.y - shapeBase.y)
      if (radius > 0) {
        commit(addNode(doc, 'circle', { centre: shapeBase, radius, layer: get().activeLayer }))
      }
      set({ shapeBase: null, typed: '' })
      return
    }

    // Arc through three points: two ends, then a point it passes through.
    if (tool === 'arc') {
      const { shapeBase, arcSecond } = get()

      if (!shapeBase) {
        set({ shapeBase: point, arcSecond: null, typed: '' })
        return
      }
      if (!arcSecond) {
        set({ arcSecond: point })
        return
      }

      // The third click is the point the arc bulges through, so `point` is the
      // middle of the sweep and arcSecond is the far end.
      const fitted = arcThroughPoints(shapeBase, point, arcSecond)
      if (fitted) {
        commit(
          addNode(doc, 'arc', {
            centre: fitted.centre,
            radius: fitted.radius,
            startAngle: fitted.startAngle,
            endAngle: fitted.endAngle,
            layer: get().activeLayer,
          }),
        )
      }
      set({ shapeBase: null, arcSecond: null, typed: '' })
      return
    }

    // Two-click shapes: the first click parks a base point, the second
    // resolves the shape and commits it as chained edges.
    if (SHAPE_TOOLS[tool]) {
      const { shapeBase, polygonSides, layer } = { ...get(), layer: get().activeLayer }

      if (!shapeBase) {
        set({ shapeBase: point, typed: '' })
        return
      }

      const points = SHAPE_TOOLS[tool](shapeBase, point, polygonSides)
      if (points.length >= 3) commit(addChainedEdges(doc, points, { layer }))
      set({ shapeBase: null, typed: '' })
      return
    }

    // Two-edge edits: click the edge to change, then the one to work against.
    if (EDGE_EDIT_TOOLS.has(tool)) {
      const { editFirst, editRadius } = get()
      const clickedId = snapRefs[0]
      if (!clickedId || doc.nodes[clickedId]?.type !== 'edge') return

      if (!editFirst) {
        // Remember WHERE it was clicked — trim keeps the piece you pointed at.
        set({ editFirst: { id: clickedId, at: point } })
        return
      }
      if (clickedId === editFirst.id) return // an edge cannot edit against itself

      commit(
        applyEdgeEdit(doc, tool, editFirst.id, clickedId, {
          keepNear: editFirst.at,
          radius: editRadius,
          setbackA: editRadius,
        }),
      )
      set({ editFirst: null })
      return
    }

    // Blocks: the armed symbol drops at the click.
    if (tool === 'block') {
      const { pendingBlock, blockAttributes } = get()
      if (!pendingBlock) return

      commit(
        addNode(doc, 'blockInstance', {
          blockId: pendingBlock,
          position: point,
          attributes: blockAttributes ?? defaultAttributes(pendingBlock),
          layer: get().activeLayer,
        }),
      )
      return
    }

    if (tool === 'component') {
      const { pendingDefinition } = get()
      if (pendingDefinition) commit(placeInstance(doc, pendingDefinition, point))
      return
    }

    if (tool === 'note') {
      commit(addNode(doc, 'note', { position: point, text: 'Note', layer: get().activeLayer }))
      return
    }

    if (tool === 'select') {
      // The inference engine already worked out which node is under the
      // cursor, so selection reuses that rather than hit-testing twice.
      const { additive } = get()
      const hit = snapRefs[0]

      set((state) => ({
        selection: hit
          ? applySelection(state.selection, [hit], { additive })
          : additive
            ? state.selection // an empty additive click should not wipe the set
            : [],
      }))
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
    const { anchor, snap, typed, doc, commit, pushPull, selection, tool, shapeBase } = get()
    if (!typed.trim()) return

    // A shape with a base point down takes a size pair: `120,96` or `10',8'`.
    if (shapeBase && SHAPE_TOOLS[tool]) {
      const size = parsePair(typed, parseLength)
      if (!size) {
        set({ typed: '' })
        return
      }

      const opposite = { x: shapeBase.x + size.x, y: shapeBase.y + size.y, z: shapeBase.z ?? 0 }
      const points = SHAPE_TOOLS[tool](shapeBase, opposite, get().polygonSides)
      if (points.length >= 3) commit(addChainedEdges(doc, points, { layer: get().activeLayer }))

      set({ shapeBase: null, typed: '' })
      return
    }

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

    // With a line under way, a PAIR is a relative displacement — `120,96`
    // means 120 across and 96 up from where you are, which is how a drafter
    // enters a point they know the offset to but not the angle of.
    if (anchor && typed.includes(',')) {
      const delta = parsePair(typed, parseLength)
      if (!delta) {
        set({ typed: '' })
        return
      }

      const end = {
        x: snapToFraction(anchor.x + delta.x),
        y: snapToFraction(anchor.y + delta.y),
        z: anchor.z ?? 0,
      }
      commit(addNode(doc, 'edge', { start: anchor, end, layer: get().activeLayer }))
      set({ anchor: end, typed: '', lockedAxis: null })
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
  cancel: () =>
    set({
      anchor: null,
      pendingAnchor: null,
      shapeBase: null,
      arcSecond: null,
      editFirst: null,
      typed: '',
      lockedAxis: null,
    }),

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

/**
 * Shared centre of a set of nodes — the pivot a transform turns about.
 *
 * One pivot for the whole selection, not one each: rotating every object about
 * its own centre would spin each in place and scatter the arrangement, when
 * what you asked for was to turn the group.
 */
function setCentroid(doc, ids) {
  const points = []

  for (const id of ids) {
    const node = doc.nodes[id]
    if (!node) continue
    if (node.centre) points.push(node.centre)
    else if (node.position) points.push(node.position)
    else points.push(...nodeVertices(node))
  }

  if (!points.length) return { x: 0, y: 0, z: 0 }

  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length, z: 0 }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z)
  return length === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / length, y: v.y / length, z: v.z / length }
}
