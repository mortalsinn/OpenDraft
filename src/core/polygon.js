/**
 * Polygon maths for faces and slabs.
 *
 * Everything here works in the XY plane. Faces in this app are horizontal
 * surfaces — deck platforms, landings, slabs — so a plan-view polygon plus an
 * elevation and a thickness fully describes them. Sloped and vertical faces
 * would need a plane normal; that is a later problem and deliberately not
 * anticipated here.
 */

const SQUARE_INCHES_PER_SQUARE_FOOT = 144

/**
 * Twice the signed area, by the shoelace formula.
 *
 * The SIGN carries the winding direction, which callers need: counter-clockwise
 * is positive. Taking the absolute value too early throws that away, and
 * extrusion needs to know which way a ring turns.
 */
export function signedDoubleArea(points) {
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += a.x * b.y - b.x * a.y
  }
  return total
}

/** Area in square inches. Always positive. */
export function polygonArea(points) {
  if (!points || points.length < 3) return 0
  return Math.abs(signedDoubleArea(points)) / 2
}

/** Area in square feet — the unit decking is actually sold and quoted in. */
export function polygonAreaSquareFeet(points) {
  return polygonArea(points) / SQUARE_INCHES_PER_SQUARE_FOOT
}

/** True when the ring runs counter-clockwise. */
export function isCounterClockwise(points) {
  return signedDoubleArea(points) > 0
}

/** Perimeter length, treating the ring as closed. */
export function polygonPerimeter(points) {
  if (!points || points.length < 2) return 0

  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/** Average of the vertices. Cheap, and good enough for placing a label. */
export function polygonCentroid(points) {
  if (!points?.length) return { x: 0, y: 0, z: 0 }

  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length, z: 0 }
}

/**
 * Is the point inside the ring? Ray casting, counting crossings to the right.
 *
 * Used to decide which slab a click landed on, so behaviour exactly on an edge
 * is not worth agonising over — but it is deterministic, which matters more
 * than which side it picks.
 */
export function pointInPolygon(point, points) {
  if (!points || points.length < 3) return false

  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]

    const straddles = a.y > point.y !== b.y > point.y
    if (!straddles) continue

    const crossingX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (point.x < crossingX) inside = !inside
  }
  return inside
}

/** Bounding box, for framing and for cheap hit-test rejection. */
export function polygonBounds(points) {
  if (!points?.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, depth: maxY - minY }
}

export { SQUARE_INCHES_PER_SQUARE_FOOT }
