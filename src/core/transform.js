/**
 * Geometric transforms.
 *
 * Everything here works on plain point arrays and is pure, so the same code
 * serves the live preview, the committed edit and the tests. Node-level
 * plumbing lives in doc.js; this file only knows about points.
 */

import { nodeVertices, withVertices } from './vertices.js'

const EPSILON = 1e-9

/**
 * How far a mitered corner may run past the true corner, as a multiple of the
 * offset distance. Sharp corners send a true miter off toward infinity; past
 * this the join is cut square instead.
 */
const MITER_LIMIT = 4

export function rotatePoint(point, centre, angle) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - centre.x
  const dy = point.y - centre.y

  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
    z: point.z ?? 0,
  }
}

export function scalePoint(point, centre, factor) {
  return {
    x: centre.x + (point.x - centre.x) * factor,
    y: centre.y + (point.y - centre.y) * factor,
    z: point.z ?? 0,
  }
}

/**
 * Reflect a point across the line through `a` and `b`.
 *
 * A degenerate axis (two identical points) defines no line, so the point comes
 * back unchanged rather than being reflected through a guess.
 */
export function mirrorPoint(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < EPSILON) return { ...point }

  // Projection of (point - a) onto the axis, doubled, gives the reflection.
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  const projX = a.x + t * dx
  const projY = a.y + t * dy

  return {
    x: 2 * projX - point.x,
    y: 2 * projY - point.y,
    z: point.z ?? 0,
  }
}

/** Unit perpendicular, rotated 90° counter-clockwise from a→b. */
function normalOf(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length < EPSILON) return null
  return { x: -dy / length, y: dx / length }
}

/** Intersection of two infinite lines given as point + direction. */
function lineIntersection(p1, d1, p2, d2) {
  const denominator = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denominator) < EPSILON) return null // parallel

  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denominator
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t, z: p1.z ?? 0 }
}

/**
 * Offset a polyline by a perpendicular distance — a parallel line.
 *
 * Positive is to the left of the direction of travel. Each segment is shifted,
 * then adjacent shifted lines are intersected to find the corner. That is what
 * keeps a mitred corner sharp instead of leaving a gap or a rounded stub.
 *
 * Collinear neighbours have no intersection, so the shifted point is used
 * directly; very sharp corners are cut square at the miter limit rather than
 * being allowed to shoot off to infinity.
 *
 * Self-intersection on tight inside corners is NOT resolved. A proper offset
 * would need to detect and trim those loops; until it does, offsetting a
 * polyline by more than its smallest feature will produce a tangle, and that
 * is a known limit rather than a surprise.
 */
export function offsetPolyline(points, distance, closed = false) {
  if (points.length < 2 || Math.abs(distance) < EPSILON) return points.map((p) => ({ ...p }))

  const count = points.length
  const lines = []

  const lastSegment = closed ? count : count - 1
  for (let i = 0; i < lastSegment; i++) {
    const a = points[i]
    const b = points[(i + 1) % count]
    const normal = normalOf(a, b)
    if (!normal) continue

    lines.push({
      point: { x: a.x + normal.x * distance, y: a.y + normal.y * distance, z: a.z ?? 0 },
      direction: { x: b.x - a.x, y: b.y - a.y },
    })
  }

  if (!lines.length) return points.map((p) => ({ ...p }))

  const result = []

  if (!closed) {
    // An open path starts on the first shifted line, square to it.
    result.push({ ...lines[0].point })
  }

  const joinCount = closed ? lines.length : lines.length - 1
  for (let i = 0; i < joinCount; i++) {
    const current = lines[i]
    const next = lines[(i + 1) % lines.length]
    const corner = points[closed ? (i + 1) % count : i + 1]

    const crossing = lineIntersection(current.point, current.direction, next.point, next.direction)

    if (!crossing) {
      // Collinear: the shifted line simply continues.
      result.push({ ...next.point })
      continue
    }

    const reach = Math.hypot(crossing.x - corner.x, crossing.y - corner.y)
    if (reach > Math.abs(distance) * MITER_LIMIT) {
      // Too sharp to mitre — cut the corner square.
      result.push({ ...current.point })
      result.push({ ...next.point })
    } else {
      result.push(crossing)
    }
  }

  if (!closed) {
    // ...and ends on the last shifted line.
    const last = lines[lines.length - 1]
    const end = points[count - 1]
    const normal = normalOf(points[count - 2], end)
    result.push(
      normal
        ? { x: end.x + normal.x * distance, y: end.y + normal.y * distance, z: end.z ?? 0 }
        : { ...last.point },
    )
  }

  return result
}

/**
 * Placements for a rectangular array, INCLUDING the original at (0, 0).
 * Returned as offsets so the caller can apply them to whatever it likes.
 */
export function rectangularArray(columns, rows, spacingX, spacingY) {
  const placements = []
  const cols = Math.max(1, Math.round(columns))
  const rowCount = Math.max(1, Math.round(rows))

  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < cols; column++) {
      placements.push({ x: column * spacingX, y: row * spacingY, z: 0 })
    }
  }

  return placements
}

/**
 * Angles for a polar array.
 *
 * A full 360° sweep does not repeat the original at the end — the first and
 * last would land on top of each other, and you would quote one too many.
 */
export function polarArray(count, totalAngle = Math.PI * 2) {
  const total = Math.max(1, Math.round(count))
  const isFullCircle = Math.abs(Math.abs(totalAngle) - Math.PI * 2) < 1e-6
  const divisor = isFullCircle ? total : Math.max(1, total - 1)

  const angles = []
  for (let i = 0; i < total; i++) angles.push((totalAngle * i) / divisor)
  return angles
}

/** Apply a point-wise transform to every vertex of a node. */
export function transformNodeVertices(node, transform) {
  return withVertices(node, nodeVertices(node).map(transform))
}
