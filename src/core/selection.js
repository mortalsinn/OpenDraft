/**
 * Selection sets and box selection.
 *
 * Two box behaviours, and the distinction is not decoration — every CAD tool
 * has both because they answer different questions:
 *
 *   WINDOW (drag left to right): only objects entirely inside. "Take this
 *   thing", used when you can see the whole of what you want.
 *
 *   CROSSING (drag right to left): anything the box touches. "Take everything
 *   through here", used to grab a run of geometry without framing all of it.
 *
 * The drag direction chooses, exactly as it does in AutoCAD, so it costs no
 * extra UI and is muscle memory for anyone who has drafted before.
 */

import { nodeVertices } from './vertices.js'

/** A normalised box from two dragged corners, plus which mode the drag means. */
export function boxFromDrag(from, to) {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y),
    // Right-to-left is a crossing selection.
    crossing: to.x < from.x,
  }
}

function contains(box, point) {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY
}

/** Does the segment touch the box at all? */
function segmentTouchesBox(a, b, box) {
  if (contains(box, a) || contains(box, b)) return true

  // Cheap reject: entirely off one side.
  if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX) return false
  if (Math.max(a.y, b.y) < box.minY || Math.min(a.y, b.y) > box.maxY) return false

  // Otherwise test the four edges of the box for a crossing.
  const corners = [
    [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }],
    [{ x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }],
    [{ x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }],
    [{ x: box.minX, y: box.maxY }, { x: box.minX, y: box.minY }],
  ]

  return corners.some(([c, d]) => segmentsCross(a, b, c, d))
}

function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)

  const d1 = side(a, b, c)
  const d2 = side(a, b, d)
  const d3 = side(c, d, a)
  const d4 = side(c, d, b)

  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/**
 * Ids caught by a box.
 *
 * `segmentsOf` supplies each node's spans, so this stays ignorant of how any
 * particular node type stores its geometry.
 */
export function nodesInBox(nodes, box, segmentsOf) {
  const caught = []

  for (const node of nodes) {
    const vertices = nodeVertices(node)
    const spans = segmentsOf ? segmentsOf(node) : []

    if (!vertices.length && !spans.length) continue

    if (box.crossing) {
      const touched =
        vertices.some((vertex) => contains(box, vertex)) ||
        spans.some(([a, b]) => segmentTouchesBox(a, b, box))
      if (touched) caught.push(node.id)
    } else {
      // Window: every vertex must be inside. A node with no vertices but real
      // spans (a generated symbol) is judged on its span ends instead.
      const points = vertices.length ? vertices : spans.flat()
      if (points.length && points.every((point) => contains(box, point))) caught.push(node.id)
    }
  }

  return caught
}

/** Add, remove or replace, depending on whether the modifier is held. */
export function applySelection(current, ids, { additive = false } = {}) {
  if (!additive) return [...new Set(ids)]

  const next = new Set(current)
  for (const id of ids) {
    // Shift-clicking something already selected removes it, which is how you
    // correct an over-grab without starting again.
    if (next.has(id)) next.delete(id)
    else next.add(id)
  }
  return [...next]
}
