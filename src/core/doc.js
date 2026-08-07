/**
 * The document model.
 *
 * A document is a flat map of typed nodes plus an ordering. Nodes are
 * PARAMETRIC: a node stores its defining inputs (a footprint, a height, a
 * picket spacing) and its 3D geometry is generated from those inputs on
 * demand. Nothing in the document is a mesh.
 *
 * This is the whole bet of the project. It is what lets the same document be
 * a 2D plan and a 3D model at once, and it is what makes quantities exact —
 * you cannot reliably count pickets off a triangle soup, but you can compute
 * them from a run length and a spacing.
 *
 * Free-form shapes get an escape hatch later via an `extrusion` node whose
 * footprint is an arbitrary polygon. That keeps the door open to raw modelling
 * without making every other node pay for it.
 */

import { railingQuantities, railingIssues, railingSegments, RAILING_DEFAULTS } from './railing.js'
import { buildChain } from './chain.js'
import { polygonArea, polygonAreaSquareFeet, polygonPerimeter } from './polygon.js'
import { stairQuantities, stairIssues, STAIR_DEFAULTS } from './stairs.js'
import { getRules, DEFAULT_JURISDICTION } from './code.js'
import { defaultLayers, DEFAULT_LAYER_ID, countsInTakeoff, isSelectable } from './layers.js'
import { instantiate, extractDefinition } from './components.js'
import { nodeVertices, withVertices } from './vertices.js'

/** Monotonic id source. */
let nextId = 1
export function makeId(prefix = 'n') {
  return `${prefix}${nextId++}`
}

/**
 * Push the id counter past everything in a loaded document.
 *
 * Without this, reopening a saved drawing resets the counter to 1 and the next
 * edge drawn is handed an id that already exists — silently overwriting an
 * existing node. Must be called on every load.
 */
export function seedIds(doc) {
  let highest = 0
  for (const id of Object.keys(doc.nodes ?? {})) {
    const digits = Number(String(id).replace(/^\D+/, ''))
    if (Number.isFinite(digits)) highest = Math.max(highest, digits)
  }
  nextId = highest + 1
}

/**
 * Node type registry. Each entry describes how to build a node and what it is
 * worth, so adding a product means adding one entry — not touching the scene,
 * the takeoff, or the UI.
 *
 * `quantities(node)` returns the takeoff line items this node contributes.
 * Phase 4 feeds these straight into the AscendOS estimator contract.
 */
export const NODE_TYPES = {
  /**
   * The raw sketch primitive: a line segment on the drawing plane.
   * Every higher-level object is built by promoting one or more edges.
   */
  edge: {
    label: 'Edge',
    create: ({ start, end }) => ({ start, end }),
    quantities: () => [],
  },

  /**
   * A railing run built along an edge. The reason this project exists.
   *
   * Both the quantities here and the geometry drawn in the scene come from
   * `layoutRailing`, so the quote cannot drift away from the drawing.
   */
  railingRun: {
    label: 'Railing run',
    create: ({ start, end, points, closed = false, ...overrides }) => ({
      // A run is a polyline. A promoted single edge is just the two-point case.
      points: points ?? (start && end ? [start, end] : []),
      closed,
      ...RAILING_DEFAULTS,
      ...overrides,
    }),
    quantities: railingQuantities,
    issues: railingIssues,
    /** Parameters the inspector may edit, with sensible input bounds. */
    editable: [
      { key: 'height', label: 'Height', min: 24, max: 60 },
      { key: 'postSpacing', label: 'Max post spacing', min: 24, max: 144 },
      { key: 'maxGap', label: 'Max clear gap', min: 1, max: 6 },
      { key: 'picketWidth', label: 'Picket width', min: 0.25, max: 3 },
    ],
    /** Pulling on a railing raises it — the same gesture, a different parameter. */
    pushPull: 'height',
  },

  /**
   * A horizontal surface: a deck platform, a landing, a slab.
   *
   * Faces in this app are horizontal, so a plan-view ring plus an elevation and
   * a thickness describes one completely. Push/pull edits the thickness — a
   * parameter — rather than moving raw topology around.
   */
  slab: {
    label: 'Slab',
    create: ({ points, start, end, thickness = 5.5, elevation = 0, boardWidth = 5.5, ...overrides }) => ({
      points: points ?? (start && end ? [start, end] : []),
      closed: true, // a face is a ring by definition
      thickness,
      elevation,
      boardWidth,
      ...overrides,
    }),
    quantities: (node) => {
      const area = polygonAreaSquareFeet(node.points)
      if (area <= 0) return []

      const perimeter = polygonPerimeter(node.points)

      // Decking is bought by area, but the linear footage of board is what
      // actually gets cut, so quote both.
      const linearInches = node.boardWidth > 0 ? (polygonArea(node.points) / node.boardWidth) : 0

      return [
        { sku: 'DECK-SF', description: 'Decking', unit: 'sq ft', quantity: area },
        { sku: 'DECK-LF', description: 'Decking — linear', unit: 'in', quantity: linearInches },
        { sku: 'RIM', description: 'Rim board', unit: 'in', quantity: perimeter },
      ]
    },
    editable: [
      { key: 'thickness', label: 'Thickness', min: 0.5, max: 48 },
      { key: 'elevation', label: 'Elevation', min: -600, max: 600 },
      { key: 'boardWidth', label: 'Board width', min: 1, max: 24 },
    ],
    /** Which parameter the push/pull tool drags. */
    pushPull: 'thickness',
  },

  /**
   * A flight of stairs. The drawn line gives the start and the direction; the
   * run is computed, because a stair whose run disagrees with its tread count
   * is not a stair.
   */
  stairRun: {
    label: 'Stair run',
    create: ({ points, start, end, ...overrides }) => ({
      points: points ?? (start && end ? [start, end] : []),
      closed: false,
      ...STAIR_DEFAULTS,
      ...overrides,
    }),
    quantities: stairQuantities,
    issues: stairIssues,
    editable: [
      { key: 'totalRise', label: 'Floor to floor', min: 1, max: 480 },
      { key: 'treadDepth', label: 'Tread depth', min: 6, max: 24 },
      { key: 'width', label: 'Width', min: 24, max: 120 },
      { key: 'nosing', label: 'Nosing', min: 0, max: 3 },
    ],
    pushPull: 'totalRise',
  },

  /**
   * An associative dimension. Holds references to what it measures, not a
   * copy of the numbers — see dimension.js for why that distinction matters.
   */
  dimension: {
    label: 'Dimension',
    create: ({ from, to, offset = 12 }) => ({ from, to, offset }),
    quantities: () => [],
    editable: [{ key: 'offset', label: 'Offset', min: -240, max: 240 }],
  },

  /**
   * A placed instance of a component definition. Carries no geometry of its
   * own — it points at a definition and says where and which way round.
   */
  componentInstance: {
    label: 'Component',
    create: ({ definitionId, position, rotation = 0 }) => ({ definitionId, position, rotation }),
    // Quantities come from expanding the definition; see computeTakeoff.
    quantities: () => [],
    editable: [{ key: 'rotation', label: 'Rotation', min: -Math.PI * 2, max: Math.PI * 2 }],
  },

  /** A text note, optionally with a leader pointing at something. */
  note: {
    label: 'Note',
    create: ({ position, text = 'Note', leader = null }) => ({ position, text, leader }),
    quantities: () => [],
    editable: [],
  },
}

/** Euclidean distance between two {x, y, z} points. */
export function distance(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = (b.z ?? 0) - (a.z ?? 0)
  return Math.hypot(dx, dy, dz)
}

/** An empty document. */
export function createDocument() {
  return {
    schemaVersion: SCHEMA_VERSION,
    units: 'imperial',
    jurisdiction: DEFAULT_JURISDICTION,
    ...defaultLayers(),
    definitions: {},
    nodes: {},
    order: [],
  }
}

/**
 * Add a node. Returns a NEW document — the store keeps history by holding
 * onto previous documents, so nothing here may mutate in place.
 */
export function addNode(doc, type, params) {
  const definition = NODE_TYPES[type]
  if (!definition) throw new Error(`Unknown node type: ${type}`)

  const id = makeId(type === 'edge' ? 'e' : 'n')
  const node = {
    id,
    type,
    layer: params.layer ?? doc.activeLayer ?? DEFAULT_LAYER_ID,
    ...definition.create(params),
  }

  return {
    ...doc,
    nodes: { ...doc.nodes, [id]: node },
    order: [...doc.order, id],
  }
}

/** Replace a node's parameters, keeping its id and position in the order. */
export function updateNode(doc, id, changes) {
  const existing = doc.nodes[id]
  if (!existing) return doc
  return { ...doc, nodes: { ...doc.nodes, [id]: { ...existing, ...changes } } }
}

/**
 * Change a node's type in place — an edge becoming a railing run, say.
 * Defining parameters for the new type are filled in from its `create`, but the
 * id survives so selection and history stay pointed at the same object.
 */
export function convertNode(doc, id, type) {
  const existing = doc.nodes[id]
  const definition = NODE_TYPES[type]
  if (!existing || !definition) return doc

  // Strip identity before handing the node to `create`, and reapply it after.
  // Node types spread their overrides, so leaving `type` in would have the old
  // type overwrite the new one and the conversion would silently no-op.
  const { id: _id, type: _type, ...params } = existing
  const converted = { ...definition.create(params), id, type }

  return { ...doc, nodes: { ...doc.nodes, [id]: converted } }
}

/**
 * Promote an edge — and the whole chain of edges connected to it — into a
 * single railing run.
 *
 * Drawing a deck perimeter produces four chained edges. Promoting them one at a
 * time would give four runs with doubled-up corner posts, so promoting any one
 * of them absorbs the rest. The consumed edges are removed; the clicked edge's
 * id is reused for the run so selection survives the operation.
 */
export function promoteChain(doc, edgeId, type = 'railingRun') {
  const edge = doc.nodes[edgeId]
  const definition = NODE_TYPES[type]
  if (!edge || edge.type !== 'edge' || !definition) return doc

  const edges = listNodes(doc).filter((node) => node.type === 'edge')
  const { points, edgeIds, closed } = buildChain(edges, edgeId)
  if (points.length < 2) return doc

  // A face needs a genuine ring. Silently closing an open chain would invent
  // an edge the user never drew and quote decking for a shape that is not there.
  if (type === 'slab' && (!closed || points.length < 3)) return doc

  const nodes = { ...doc.nodes }
  for (const id of edgeIds) delete nodes[id]

  nodes[edgeId] = { ...definition.create({ points, closed }), id: edgeId, type }

  // Keep the run where the first of its edges sat, and drop the others.
  const consumed = new Set(edgeIds.filter((id) => id !== edgeId))
  const order = doc.order.filter((id) => !consumed.has(id))

  return { ...doc, nodes, order }
}

/** Remove a node by id. */
export function removeNode(doc, id) {
  if (!doc.nodes[id]) return doc
  const nodes = { ...doc.nodes }
  delete nodes[id]
  return { ...doc, nodes, order: doc.order.filter((n) => n !== id) }
}

export { nodeVertices }

/** Move one vertex of a node to an absolute position. */
export function moveVertex(doc, id, index, point) {
  const node = doc.nodes[id]
  const vertices = nodeVertices(node)
  if (!vertices[index]) return doc

  const moved = vertices.map((vertex, i) => (i === index ? { ...point } : vertex))
  return { ...doc, nodes: { ...doc.nodes, [id]: withVertices(node, moved) } }
}

/** Shift every vertex of a node by a displacement. */
export function translateNode(doc, id, delta) {
  const node = doc.nodes[id]
  const vertices = nodeVertices(node)
  if (!vertices.length) return doc

  const moved = vertices.map((vertex) => ({
    x: vertex.x + delta.x,
    y: vertex.y + delta.y,
    z: (vertex.z ?? 0) + (delta.z ?? 0),
  }))
  return { ...doc, nodes: { ...doc.nodes, [id]: withVertices(node, moved) } }
}

/** Ids of the dimensions that measure `id`. */
export function dependentsOf(doc, id) {
  return listNodes(doc)
    .filter(
      (node) =>
        node.type === 'dimension' &&
        (node.from?.nodeId === id || node.to?.nodeId === id),
    )
    .map((node) => node.id)
}

/**
 * Remove a node and anything that only existed to describe it.
 *
 * A dimension whose target is gone renders nothing at all, which would leave an
 * invisible node in the document that cannot be found or selected to clean up.
 * Taking them together — in one commit, so one undo brings both back — avoids
 * ever creating that orphan.
 */
export function removeNodeCascade(doc, id) {
  let next = removeNode(doc, id)
  for (const dependent of dependentsOf(doc, id)) next = removeNode(next, dependent)
  return next
}

/** All nodes in draw order. */
export function listNodes(doc) {
  return doc.order.map((id) => doc.nodes[id]).filter(Boolean)
}

/**
 * Every straight span in the document, as things the inference engine can snap
 * to. A polyline run contributes one entry per span, each carrying the run's id
 * so that snapping to a corner still selects the run it belongs to.
 */
export function listSegments(doc) {
  const segments = []

  for (const node of listNodes(doc)) {
    // You cannot snap to what you cannot see, and you cannot grab what is
    // locked — so hidden and locked layers are simply absent from inference.
    if (!isSelectable(doc, node)) continue

    // Instances expose their definition's spans so you can snap to a placed
    // component, with the INSTANCE's id so a click selects what you clicked.
    if (node.type === 'componentInstance') {
      for (const inner of instantiate(doc, node)) {
        for (const [start, end] of railingSegments(inner)) {
          segments.push({ id: node.id, start, end })
        }
        if (inner.start && inner.end) {
          segments.push({ id: node.id, start: inner.start, end: inner.end })
        }
      }
      continue
    }

    if (node.points?.length >= 2) {
      for (const [start, end] of railingSegments(node)) {
        segments.push({ id: node.id, start, end })
      }
    } else if (node.start && node.end) {
      segments.push(node)
    }
  }

  return segments
}

/** The current document schema. Bump when a load-time migration is needed. */
export const SCHEMA_VERSION = 4

/**
 * Bring an older document up to the current schema.
 *
 * v1 → v2: railing runs were a single `start`/`end` pair before runs could turn
 * corners. Rewrite them as two-point polylines.
 */
export function migrateDocument(doc) {
  if (!doc) return null
  if (doc.schemaVersion === SCHEMA_VERSION) return doc
  if (doc.schemaVersion > SCHEMA_VERSION) return null // from a future version

  let migrated = doc

  // v1 -> v2: railing runs were a single start/end pair before runs could turn
  // corners. Rewrite them as two-point polylines.
  if (migrated.schemaVersion === 1) {
    const nodes = {}
    for (const [id, node] of Object.entries(migrated.nodes ?? {})) {
      if (node.type === 'railingRun' && !node.points && node.start && node.end) {
        const { start, end, ...rest } = node
        nodes[id] = { ...rest, points: [start, end], closed: false }
      } else {
        nodes[id] = node
      }
    }
    migrated = { ...migrated, schemaVersion: 2, nodes }
  }

  // v2 -> v3: layers. Everything that already existed lands on the default.
  if (migrated.schemaVersion === 2) {
    const nodes = {}
    for (const [id, node] of Object.entries(migrated.nodes ?? {})) {
      nodes[id] = node.layer ? node : { ...node, layer: DEFAULT_LAYER_ID }
    }
    migrated = { ...migrated, schemaVersion: 3, ...defaultLayers(), nodes }
  }

  // v3 -> v4: component definitions. Nothing to convert; older documents
  // simply had none.
  if (migrated.schemaVersion === 3) {
    migrated = { ...migrated, schemaVersion: 4, definitions: migrated.definitions ?? {} }
  }

  return migrated.schemaVersion === SCHEMA_VERSION ? migrated : null
}

/**
 * Quantities for one placed instance — its definition's, once.
 *
 * Lives here rather than in components.js because it needs the node-type
 * registry, and having the two modules import each other would be a cycle.
 */
export function instanceQuantities(doc, instance) {
  const lines = []

  for (const node of instantiate(doc, instance)) {
    const quantities = NODE_TYPES[node.type]?.quantities
    if (quantities) lines.push(...quantities(node))
  }

  return lines
}

/**
 * Turn the selected node into a reusable component, leaving an instance where
 * it was. The definition holds geometry relative to its own origin, so placing
 * a second instance is a reference rather than a copy.
 */
export function makeComponent(doc, nodeId, name) {
  const node = doc.nodes[nodeId]
  if (!node || node.type === 'componentInstance') return doc

  const extracted = extractDefinition(node, name)
  if (!extracted) return doc

  const { definition, origin } = extracted
  const instance = {
    id: nodeId,
    type: 'componentInstance',
    layer: node.layer,
    ...NODE_TYPES.componentInstance.create({ definitionId: definition.id, position: origin }),
  }

  return {
    ...doc,
    definitions: { ...(doc.definitions ?? {}), [definition.id]: definition },
    nodes: { ...doc.nodes, [nodeId]: instance },
  }
}

/** Place another instance of an existing definition. */
export function placeInstance(doc, definitionId, position, rotation = 0) {
  if (!doc.definitions?.[definitionId]) return doc
  return addNode(doc, 'componentInstance', { definitionId, position, rotation })
}

/**
 * Every code and comfort finding in the drawing, tagged with the node it came
 * from. Objects are allowed to be non-compliant mid-edit; the drawing just has
 * to say so.
 */
export function documentIssues(doc) {
  const rules = getRules(doc.jurisdiction)
  const found = []

  for (const node of listNodes(doc)) {
    const check = NODE_TYPES[node.type]?.issues
    if (!check) continue
    for (const issue of check(node, rules)) found.push({ ...issue, nodeId: node.id })
  }

  return found
}

/**
 * Roll the whole document up into takeoff lines, merging duplicate SKUs.
 * This is the seam that AscendOS consumes.
 */
export function computeTakeoff(doc) {
  const merged = new Map()

  for (const node of listNodes(doc)) {
    // Hidden is NOT the same as excluded. Something hidden to see behind it
    // still gets built and still gets bought; only an explicit exclusion keeps
    // a layer out of the quote.
    if (!countsInTakeoff(doc, node)) continue

    // An instance stands for its definition's geometry, so its quantities come
    // from expanding it — twelve instances of a post assembly are twelve
    // assemblies' worth of material, not one.
    const lines =
      node.type === 'componentInstance'
        ? instanceQuantities(doc, node)
        : NODE_TYPES[node.type]?.quantities?.(node)

    if (!lines) continue

    for (const line of lines) {
      const existing = merged.get(line.sku)
      if (existing) {
        existing.quantity += line.quantity
      } else {
        merged.set(line.sku, { ...line })
      }
    }
  }

  return [...merged.values()]
}
