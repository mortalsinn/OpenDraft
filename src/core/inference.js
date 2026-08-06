/**
 * The inference engine.
 *
 * This is the thing that makes SketchUp feel like SketchUp: as the cursor
 * moves, the app continuously guesses what point you MEAN — the end of that
 * line, the middle of this one, dead-on the green axis — and shows you what it
 * guessed before you commit. Get this right and every tool built on top feels
 * precise. Get it wrong and no amount of features rescue the app.
 *
 * Two rules drive the whole design:
 *
 * 1. Tolerance is measured in SCREEN pixels, not world units. A snap must feel
 *    identical whether you are zoomed to a whole building or to one picket.
 *    Callers pass `worldPerPixel` and everything converts through it.
 *
 * 2. Candidates are ranked by PRIORITY first, distance second. A cursor near
 *    both an endpoint and an edge always takes the endpoint, even if the edge
 *    is a few pixels closer. Ties inside one priority go to the nearer point.
 */

/** Snap kinds, ordered — lower `priority` wins. Colours follow CAD convention. */
export const SNAP_KINDS = {
  endpoint: { priority: 0, color: '#22c55e', label: 'Endpoint' },
  midpoint: { priority: 1, color: '#06b6d4', label: 'Midpoint' },
  intersection: { priority: 2, color: '#f59e0b', label: 'Intersection' },
  onEdge: { priority: 3, color: '#ef4444', label: 'On edge' },
  axisX: { priority: 4, color: '#ef4444', label: 'On red axis' },
  axisY: { priority: 4, color: '#22c55e', label: 'On green axis' },
  axisZ: { priority: 4, color: '#3b82f6', label: 'On blue axis' },
  extension: { priority: 5, color: '#a855f7', label: 'On extension' },
  perpendicular: { priority: 5, color: '#a855f7', label: 'Perpendicular' },
  parallel: { priority: 5, color: '#a855f7', label: 'Parallel' },
  grid: { priority: 8, color: '#64748b', label: 'Grid' },
  free: { priority: 9, color: '#94a3b8', label: '' },
}

/**
 * How far past a segment's ends its extension keeps inferring, as a multiple
 * of the segment's own length. 1 means "one more segment-length beyond each
 * end" — enough to carry a wall line onward, short of turning every edge into
 * an infinite guide.
 */
const EXTENSION_REACH = 1

const AXES = [
  { kind: 'axisX', vector: { x: 1, y: 0, z: 0 } },
  { kind: 'axisY', vector: { x: 0, y: 1, z: 0 } },
  { kind: 'axisZ', vector: { x: 0, y: 0, z: 1 } },
]

const point = (x, y, z = 0) => ({ x, y, z })
const sub = (a, b) => point(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))
const add = (a, b) => point(a.x + b.x, a.y + b.y, (a.z ?? 0) + (b.z ?? 0))
const scale = (v, k) => point(v.x * k, v.y * k, (v.z ?? 0) * k)
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0)
const length = (v) => Math.hypot(v.x, v.y, v.z ?? 0)

function normalize(v) {
  const len = length(v)
  return len === 0 ? point(0, 0, 0) : scale(v, 1 / len)
}

function dist(a, b) {
  return length(sub(a, b))
}

/** Closest point to `p` on the infinite line through `a` in direction `dir`. */
function projectOnLine(p, a, dir) {
  const unit = normalize(dir)
  return add(a, scale(unit, dot(sub(p, a), unit)))
}

/** Closest point to `p` on the finite segment a→b, and how far along it is. */
function projectOnSegment(p, a, b) {
  const ab = sub(b, a)
  const lengthSquared = dot(ab, ab)
  if (lengthSquared === 0) return { point: a, t: 0 }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSquared))
  return { point: add(a, scale(ab, t)), t }
}

/**
 * Intersection of two segments, in the XY plane only.
 *
 * Restricted to 2D on purpose: in plan view — where drafting actually happens
 * — that is the intersection a person means. True 3D segment crossings are
 * vanishingly rare and nearly always a coincidence rather than an intent.
 * Returns null for parallel segments or crossings outside both spans.
 */
function segmentIntersection(a1, a2, b1, b2) {
  const d1 = sub(a2, a1)
  const d2 = sub(b2, b1)
  const denominator = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denominator) < 1e-9) return null // parallel

  const offset = sub(b1, a1)
  const t = (offset.x * d2.y - offset.y * d2.x) / denominator
  const u = (offset.x * d1.y - offset.y * d1.x) / denominator

  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return add(a1, scale(d1, t))
}

/**
 * Work out what the cursor means.
 *
 * @param {object}   options
 * @param {object}   options.cursor         Raw world point under the pointer.
 * @param {object[]} options.segments       Nodes with `start` and `end`.
 * @param {object}   [options.anchor]       Last committed point, when mid-draw.
 *                                          Enables axis, parallel and
 *                                          perpendicular inference.
 * @param {number}   options.worldPerPixel  World units covered by one pixel.
 * @param {number}   [options.pixelTolerance=10]
 * @param {number}   [options.gridStep=0]   0 disables grid snapping.
 * @param {string}   [options.lockedAxis]   'axisX'|'axisY'|'axisZ' to force one.
 *
 * @returns {{point: object, kind: string, color: string, label: string, refs: string[]}}
 *          Always returns something — worst case `free`, the raw cursor.
 */
export function infer({
  cursor,
  segments = [],
  anchor = null,
  worldPerPixel,
  pixelTolerance = 10,
  gridStep = 0,
  lockedAxis = null,
}) {
  const tolerance = pixelTolerance * worldPerPixel
  const candidates = []

  const consider = (kind, candidatePoint, refs = []) => {
    const d = dist(cursor, candidatePoint)
    if (d > tolerance) return
    candidates.push({ kind, point: candidatePoint, refs, distance: d })
  }

  // An explicit axis lock (arrow keys, or a held direction) outranks everything:
  // the user has stated the direction, so we only solve for distance along it.
  if (lockedAxis && anchor) {
    const axis = AXES.find((a) => a.kind === lockedAxis)
    if (axis) {
      return decorate({
        kind: lockedAxis,
        point: projectOnLine(cursor, anchor, axis.vector),
        refs: [],
        locked: true,
      })
    }
  }

  // --- Geometry-derived candidates -------------------------------------------
  // One projection per segment, reused for the on-edge test, the extension
  // test, and the nearby-set used for intersections below.
  const nearby = []

  for (const segment of segments) {
    consider('endpoint', segment.start, [segment.id])
    consider('endpoint', segment.end, [segment.id])
    consider('midpoint', midpoint(segment.start, segment.end), [segment.id])

    const projection = projectOnSegment(cursor, segment.start, segment.end)

    if (projection.t > 0.001 && projection.t < 0.999) {
      // Strictly between the ends — the ends themselves are already covered by
      // the higher-priority endpoint candidate.
      consider('onEdge', projection.point, [segment.id])
    } else {
      // Past an end, so the segment's line continued outward is what the
      // cursor is near. Offering this while inside the span would just
      // duplicate `onEdge` at a lower priority.
      //
      // Bounded to one segment-length beyond each end. An unbounded extension
      // would fire anywhere on an infinite line, so every segment in the
      // document would spray a guide across the whole model and the cursor
      // would snap to lines nowhere near what you are working on.
      const direction = sub(segment.end, segment.start)
      const online = projectOnLine(cursor, segment.start, direction)
      const t = dot(sub(online, segment.start), direction) / (dot(direction, direction) || 1)
      if (t > -EXTENSION_REACH && t < 1 + EXTENSION_REACH) {
        consider('extension', online, [segment.id])
      }
    }

    if (dist(cursor, projection.point) < tolerance * 8) nearby.push(segment)
  }

  // Intersections are O(n²) over the nearby set only. At Phase 1 scale that is
  // free; when documents get big this is the first thing to put behind a
  // spatial index.
  for (let i = 0; i < nearby.length; i++) {
    for (let j = i + 1; j < nearby.length; j++) {
      const crossing = segmentIntersection(nearby[i].start, nearby[i].end, nearby[j].start, nearby[j].end)
      if (crossing) consider('intersection', crossing, [nearby[i].id, nearby[j].id])
    }
  }

  // --- Anchor-derived candidates (only while drawing) ------------------------
  if (anchor) {
    for (const axis of AXES) {
      consider(axis.kind, projectOnLine(cursor, anchor, axis.vector))
    }

    for (const segment of segments) {
      const direction = sub(segment.end, segment.start)
      if (length(direction) === 0) continue

      consider('parallel', projectOnLine(cursor, anchor, direction), [segment.id])
      // Perpendicular in the drawing plane: rotate the direction 90° in XY.
      consider('perpendicular', projectOnLine(cursor, anchor, point(-direction.y, direction.x, 0)), [segment.id])
    }
  }

  // --- Fallbacks -------------------------------------------------------------
  if (gridStep > 0) {
    const snapped = point(
      Math.round(cursor.x / gridStep) * gridStep,
      Math.round(cursor.y / gridStep) * gridStep,
      cursor.z ?? 0,
    )
    consider('grid', snapped)
  }

  if (!candidates.length) {
    return decorate({ kind: 'free', point: cursor, refs: [] })
  }

  candidates.sort((a, b) => {
    const byPriority = SNAP_KINDS[a.kind].priority - SNAP_KINDS[b.kind].priority
    return byPriority !== 0 ? byPriority : a.distance - b.distance
  })

  return decorate(candidates[0])
}

function midpoint(a, b) {
  return point((a.x + b.x) / 2, (a.y + b.y) / 2, ((a.z ?? 0) + (b.z ?? 0)) / 2)
}

function decorate(candidate) {
  const kind = SNAP_KINDS[candidate.kind]
  return {
    point: candidate.point,
    kind: candidate.kind,
    color: kind.color,
    label: kind.label,
    refs: candidate.refs ?? [],
    locked: candidate.locked ?? false,
  }
}

export const __test = { projectOnSegment, projectOnLine, segmentIntersection }
