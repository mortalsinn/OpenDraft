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

import { railingQuantities, RAILING_DEFAULTS } from './railing.js'

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
    create: ({ start, end, ...overrides }) => ({
      start,
      end,
      ...RAILING_DEFAULTS,
      ...overrides,
    }),
    quantities: railingQuantities,
    /** Parameters the inspector may edit, with sensible input bounds. */
    editable: [
      { key: 'height', label: 'Height', min: 24, max: 60 },
      { key: 'postSpacing', label: 'Max post spacing', min: 24, max: 144 },
      { key: 'maxGap', label: 'Max clear gap', min: 1, max: 6 },
      { key: 'picketWidth', label: 'Picket width', min: 0.25, max: 3 },
    ],
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
    schemaVersion: 1,
    units: 'imperial',
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
  const node = { id, type, ...definition.create(params) }

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

/** Remove a node by id. */
export function removeNode(doc, id) {
  if (!doc.nodes[id]) return doc
  const nodes = { ...doc.nodes }
  delete nodes[id]
  return { ...doc, nodes, order: doc.order.filter((n) => n !== id) }
}

/** All nodes in draw order. */
export function listNodes(doc) {
  return doc.order.map((id) => doc.nodes[id]).filter(Boolean)
}

/** Just the nodes that have a start/end, which is what inference snaps to. */
export function listSegments(doc) {
  return listNodes(doc).filter((node) => node.start && node.end)
}

/**
 * Roll the whole document up into takeoff lines, merging duplicate SKUs.
 * This is the seam that AscendOS consumes.
 */
export function computeTakeoff(doc) {
  const merged = new Map()

  for (const node of listNodes(doc)) {
    const definition = NODE_TYPES[node.type]
    if (!definition?.quantities) continue

    for (const line of definition.quantities(node)) {
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
