/**
 * Walls.
 *
 * A wall is a centreline with a thickness, drawn in plan as its two faces. The
 * faces come from the same `offsetPolyline` the offset tool uses, which is why
 * corners mitre properly instead of leaving a notch — a wall corner that does
 * not close is the first thing anyone notices on a plan.
 *
 * Openings CUT the faces rather than being drawn on top of them. A door symbol
 * sitting over an unbroken wall line looks approximately right and is wrong:
 * the wall is not there, and anything measuring the drawing should be able to
 * tell.
 */

import { offsetPolyline } from './transform.js'
import { polygonPerimeter } from './polygon.js'

export const WALL_DEFAULTS = {
  thickness: 6,
  height: 96,
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

/** Total length of a centreline. */
export function wallLength(points, closed = false) {
  if (!points || points.length < 2) return 0

  let total = 0
  const last = closed ? points.length : points.length - 1
  for (let i = 0; i < last; i++) {
    total += dist(points[i], points[(i + 1) % points.length])
  }
  return total
}

/** The two faces of a wall, offset either side of its centreline. */
export function wallFaces(node) {
  const points = node.points ?? []
  if (points.length < 2) return { left: [], right: [] }

  const half = (node.thickness ?? WALL_DEFAULTS.thickness) / 2
  return {
    left: offsetPolyline(points, half, !!node.closed),
    right: offsetPolyline(points, -half, !!node.closed),
  }
}

/**
 * Spans of a polyline with the openings removed.
 *
 * Openings are positioned by distance ALONG the centreline, which is how a
 * builder dimensions them — "3'-6" from the corner" — rather than by absolute
 * coordinates that stop meaning anything the moment the wall moves.
 */
export function spansWithOpenings(points, openings = [], closed = false) {
  if (!points || points.length < 2) return []

  // Normalise openings into sorted, non-overlapping cut ranges.
  const cuts = openings
    .filter((opening) => opening.width > 0)
    .map((opening) => ({ from: opening.along, to: opening.along + opening.width }))
    .sort((a, b) => a.from - b.from)

  const merged = []
  for (const cut of cuts) {
    const last = merged[merged.length - 1]
    // Overlapping openings become one hole; two doors sharing a jamb is one
    // gap in the wall, not two.
    if (last && cut.from <= last.to) last.to = Math.max(last.to, cut.to)
    else merged.push({ ...cut })
  }

  const spans = []
  let travelled = 0
  const lastIndex = closed ? points.length : points.length - 1

  for (let i = 0; i < lastIndex; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const length = dist(from, to)
    if (length === 0) continue

    const at = (distance) => {
      const t = (distance - travelled) / length
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z ?? 0 }
    }

    // Walk this segment, emitting the parts no opening covers.
    let cursor = travelled
    const segmentEnd = travelled + length

    for (const cut of merged) {
      if (cut.to <= cursor || cut.from >= segmentEnd) continue

      const gapStart = Math.max(cursor, cut.from)
      if (gapStart > cursor) spans.push([at(cursor), at(gapStart)])
      cursor = Math.max(cursor, Math.min(cut.to, segmentEnd))
    }

    if (cursor < segmentEnd) spans.push([at(cursor), at(segmentEnd)])
    travelled = segmentEnd
  }

  return spans
}

/**
 * Everything a wall draws in plan: both faces broken at the openings, plus a
 * jamb line closing the wall across its thickness at each side of every hole.
 *
 * Without the jambs the wall reads as two lines that simply stop, which is a
 * drawing error — an opening has sides.
 */
export function wallPlanSegments(node) {
  const points = node.points ?? []
  if (points.length < 2) return []

  const { left, right } = wallFaces(node)
  const openings = node.openings ?? []
  const closed = !!node.closed

  const segments = [
    ...spansWithOpenings(left, openings, closed),
    ...spansWithOpenings(right, openings, closed),
  ]

  // Jambs: close the wall across its thickness at each edge of each opening.
  //
  // Measured on the CENTRELINE and stepped perpendicular — not by walking the
  // same distance along each offset face. The faces are different lengths
  // (the outer one is longer round every corner), so equal distances along
  // them land at different points and the jamb comes out as a skewed diagonal.
  const half = (node.thickness ?? WALL_DEFAULTS.thickness) / 2
  const total = wallLength(points, closed)

  for (const opening of openings) {
    if (!(opening.width > 0)) continue

    for (const distanceAlong of [opening.along, opening.along + opening.width]) {
      if (distanceAlong < 0 || distanceAlong > total) continue

      const at = pointAlong(points, distanceAlong, closed)
      const heading = directionAlong(points, distanceAlong, closed)
      if (!at || !heading) continue

      const normal = { x: -heading.y, y: heading.x }
      segments.push([
        { x: at.x + normal.x * half, y: at.y + normal.y * half, z: at.z ?? 0 },
        { x: at.x - normal.x * half, y: at.y - normal.y * half, z: at.z ?? 0 },
      ])
    }
  }

  return segments
}

/** Unit direction of the polyline at a given distance along it. */
export function directionAlong(points, distance, closed = false) {
  if (!points || points.length < 2) return null

  let travelled = 0
  const lastIndex = closed ? points.length : points.length - 1

  for (let i = 0; i < lastIndex; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const length = dist(from, to)
    if (length === 0) continue

    if (distance <= travelled + length) {
      return { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
    }
    travelled += length
  }

  // Past the end: keep the last segment's direction.
  const from = points[points.length - 2]
  const to = points[points.length - 1]
  const length = dist(from, to) || 1
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

/** The point a given distance along a polyline. */
export function pointAlong(points, distance, closed = false) {
  if (!points || points.length < 2) return null

  let travelled = 0
  const lastIndex = closed ? points.length : points.length - 1

  for (let i = 0; i < lastIndex; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const length = dist(from, to)
    if (length === 0) continue

    if (distance <= travelled + length) {
      const t = (distance - travelled) / length
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z ?? 0 }
    }
    travelled += length
  }

  // Past the end: clamp to the last vertex rather than returning nothing.
  return { ...points[points.length - 1] }
}

/**
 * Takeoff for a wall.
 *
 * Area is NET of openings, because nobody frames or finishes the hole where a
 * door goes. Quoting gross area over-orders every wall with a door in it.
 */
export function wallQuantities(node) {
  const points = node.points ?? []
  if (points.length < 2) return []

  const height = node.height ?? WALL_DEFAULTS.height
  const gross = wallLength(points, !!node.closed)
  if (gross <= 0) return []

  const openings = node.openings ?? []
  const openingLength = openings.reduce((sum, opening) => sum + Math.max(0, opening.width), 0)
  const net = Math.max(0, gross - openingLength)

  return [
    { sku: 'WALL-LF', description: 'Wall — linear', unit: 'in', quantity: net },
    {
      sku: 'WALL-SF',
      description: 'Wall — area',
      unit: 'sq ft',
      quantity: (net * height) / 144,
    },
    { sku: 'PLATE', description: 'Top and bottom plate', unit: 'in', quantity: gross * 2 },
    ...(openings.length
      ? [{ sku: 'HEADER', description: 'Opening header', unit: 'ea', quantity: openings.length }]
      : []),
  ]
}

export { polygonPerimeter }
