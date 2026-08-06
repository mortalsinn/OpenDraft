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

import { snapToFraction } from './units.js'

/** Monotonic id source. Not persisted — ids are regenerated on load. */
let nextId = 1
export function makeId(prefix = 'n') {
  return `${prefix}${nextId++}`
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
   */
  railingRun: {
    label: 'Railing run',
    create: ({ start, end, height = 42, postSpacing = 72, picketSpacing = 4 }) => ({
      start,
      end,
      height,
      postSpacing,
      picketSpacing,
    }),
    quantities: (node) => {
      const runLength = distance(node.start, node.end)
      if (runLength <= 0) return []

      // Posts at both ends plus intermediate posts at no more than postSpacing.
      const bays = Math.max(1, Math.ceil(runLength / node.postSpacing))
      const posts = bays + 1

      // Pickets fill the clear space in each bay. Code-driven spacing: the gap
      // between pickets is what is regulated, not the pitch, so this is a
      // deliberate under-estimate until the CodeCompass rules land in Phase 3.
      const pickets = Math.max(0, Math.floor(runLength / node.picketSpacing) - 1)

      return [
        { sku: 'POST', description: 'Railing post', unit: 'ea', quantity: posts },
        { sku: 'PICKET', description: 'Picket', unit: 'ea', quantity: pickets },
        {
          sku: 'TOPRAIL',
          description: 'Top rail',
          unit: 'in',
          quantity: snapToFraction(runLength),
        },
      ]
    },
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
