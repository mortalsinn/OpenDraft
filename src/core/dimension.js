/**
 * Dimensions.
 *
 * A dimension is ASSOCIATIVE: it stores a reference to a vertex of another
 * object, not a copy of that vertex's coordinates. Move the deck corner and the
 * dimension follows and re-reads. A dimension that holds a stale number is
 * worse than no dimension at all, because someone will build to it.
 *
 * When a click does not land on a vertex there is nothing to bind to, so the
 * anchor falls back to a literal point. That is honest — it just will not track
 * anything — and the inspector says which kind it is.
 */

const EPSILON = 1e-6

/**
 * Build an anchor from a click.
 *
 * `refs` comes from the inference engine and names the nodes under the cursor.
 * If the snapped point coincides with one of that node's vertices, the anchor
 * binds to it by index; otherwise it keeps the raw point.
 */
export function makeAnchor(doc, point, refs = []) {
  for (const nodeId of refs) {
    const node = doc.nodes[nodeId]
    const vertices = verticesOf(node)

    for (let index = 0; index < vertices.length; index++) {
      if (samePoint(vertices[index], point)) {
        return { kind: 'vertex', nodeId, index }
      }
    }
  }

  return { kind: 'point', point: { ...point } }
}

/** The vertices a node exposes for binding. */
function verticesOf(node) {
  if (!node) return []
  if (Array.isArray(node.points)) return node.points
  if (node.start && node.end) return [node.start, node.end]
  return []
}

function samePoint(a, b) {
  if (!a || !b) return false
  return (
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs((a.z ?? 0) - (b.z ?? 0)) < EPSILON
  )
}

/**
 * Current position of an anchor, or null if what it pointed at is gone.
 *
 * Null rather than a fallback coordinate: a dimension whose target was deleted
 * must visibly break, not quietly keep displaying the last number it knew.
 */
export function resolveAnchor(doc, anchor) {
  if (!anchor) return null
  if (anchor.kind === 'point') return anchor.point

  const node = doc.nodes[anchor.nodeId]
  const vertex = verticesOf(node)[anchor.index]
  return vertex ? { ...vertex } : null
}

/** Both ends of a dimension, or null if either has gone missing. */
export function resolveDimension(doc, node) {
  const from = resolveAnchor(doc, node.from)
  const to = resolveAnchor(doc, node.to)
  if (!from || !to) return null

  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy, (to.z ?? 0) - (from.z ?? 0))
  if (length === 0) return null

  // Offset the dimension line perpendicular to the measured span, so it sits
  // clear of the geometry it describes.
  const offset = node.offset ?? 12
  const nx = -dy / length
  const ny = dx / length

  const shift = (p) => ({ x: p.x + nx * offset, y: p.y + ny * offset, z: p.z ?? 0 })

  return {
    from,
    to,
    length,
    lineFrom: shift(from),
    lineTo: shift(to),
    mid: shift({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: from.z ?? 0 }),
    normal: { x: nx, y: ny },
  }
}

/** True when a dimension still points at something real. */
export function isDimensionLive(doc, node) {
  return resolveDimension(doc, node) !== null
}

/** True when either end tracks geometry rather than a frozen coordinate. */
export function isAssociative(node) {
  return node.from?.kind === 'vertex' || node.to?.kind === 'vertex'
}
