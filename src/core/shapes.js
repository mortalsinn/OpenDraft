/**
 * Shape construction.
 *
 * Every shape here resolves to a RING OF POINTS, which the tools then commit as
 * chained edges. That is deliberate: a rectangle drawn this way is immediately
 * a closed chain, so it can be promoted to a deck or a railing run, its corners
 * share posts, and the chain walker already understands it.
 *
 * A dedicated `rectangle` node type would have been less code today and a
 * second thing to teach every downstream feature about forever.
 */

const TAU = Math.PI * 2

/**
 * Rectangle from two opposite corners, counter-clockwise.
 *
 * Corners may be given in any order — dragging up-left is as valid as
 * down-right — so the extents are normalised rather than assumed.
 */
export function rectanglePoints(a, b) {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  const z = a.z ?? 0

  if (minX === maxX || minY === maxY) return [] // degenerate

  return [
    { x: minX, y: minY, z },
    { x: maxX, y: minY, z },
    { x: maxX, y: maxY, z },
    { x: minX, y: maxY, z },
  ]
}

/**
 * Rectangle from a centre and a corner — the "from centre" variant.
 */
export function rectangleFromCentre(centre, corner) {
  const halfWidth = Math.abs(corner.x - centre.x)
  const halfDepth = Math.abs(corner.y - centre.y)
  return rectanglePoints(
    { x: centre.x - halfWidth, y: centre.y - halfDepth, z: centre.z ?? 0 },
    { x: centre.x + halfWidth, y: centre.y + halfDepth, z: centre.z ?? 0 },
  )
}

/**
 * Regular polygon inscribed in a circle.
 *
 * `throughVertex` chooses which classic construction this is: inscribed puts a
 * vertex on the radius, circumscribed puts an edge midpoint there. Both matter
 * — a hexagonal newel is usually specified across the flats, not the points.
 */
export function regularPolygonPoints(centre, radius, sides, { rotation = 0, throughVertex = true } = {}) {
  const count = Math.max(3, Math.round(sides))
  if (!(radius > 0)) return []

  // Circumscribed: push the radius out so the FLATS sit on the given circle.
  const effectiveRadius = throughVertex ? radius : radius / Math.cos(Math.PI / count)
  const z = centre.z ?? 0
  const points = []

  for (let i = 0; i < count; i++) {
    const angle = rotation + (i * TAU) / count
    points.push({
      x: centre.x + effectiveRadius * Math.cos(angle),
      y: centre.y + effectiveRadius * Math.sin(angle),
      z,
    })
  }

  return points
}

/** Distance across the flats of a regular polygon — how stock is specified. */
export function acrossFlats(radius, sides) {
  return 2 * radius * Math.cos(Math.PI / Math.max(3, sides))
}

/**
 * The two-click shapes, keyed by tool name.
 *
 * Each resolves a base point and a second point into a ring. One table, read by
 * the commit path AND the live preview — a preview computed a second way is a
 * preview that eventually lies about what you are going to get.
 *
 * Adding a shape is one entry here plus one toolbar button.
 */
export const SHAPE_TOOLS = {
  rectangle: (base, point) => rectanglePoints(base, point),
  rectangleCentre: (base, point) => rectangleFromCentre(base, point),
  polygon: (base, point, sides) =>
    regularPolygonPoints(base, Math.hypot(point.x - base.x, point.y - base.y), sides, {
      // Aim at a vertex, so the cursor sits on a corner — which is what the
      // rubber band shows it doing.
      rotation: Math.atan2(point.y - base.y, point.x - base.x),
    }),
}

export const SHAPE_TOOL_LABELS = {
  rectangle: 'Rect',
  rectangleCentre: 'Rect (c)',
  polygon: 'Polygon',
}

/**
 * Parse a coordinate or size pair: `120,96` or `10',8'`.
 *
 * Returns null unless BOTH halves parse, so a stray comma cannot produce a
 * shape with one dimension silently defaulted.
 */
export function parsePair(input, parseLength) {
  if (typeof input !== 'string' || !input.includes(',')) return null

  const [first, second] = input.split(',')
  const a = parseLength(first.trim())
  const b = parseLength(second.trim())

  return a === null || b === null ? null : { x: a, y: b }
}
