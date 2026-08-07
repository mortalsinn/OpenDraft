/**
 * Circles and arcs.
 *
 * Curves are stored EXACTLY — a centre, a radius, and for an arc a pair of
 * angles — and tessellated only when something needs straight lines to work
 * with. A radius dimension reads the parameter, never the chords, because a
 * 24" radius that measures 23.97" because of how finely it happened to be
 * tessellated is the kind of error that survives all the way to the shop.
 *
 * Tessellation density adapts to the radius so a big arc does not visibly
 * become a polygon.
 */

const TAU = Math.PI * 2

/**
 * Largest deviation between a chord and its true arc.
 *
 * Absolute below, relative above: 1/50" is finer than anything gets built to,
 * but demanding it on a forty-foot radius would need hundreds of chords to buy
 * precision nobody can use. Past that the tolerance scales with the radius, so
 * the error stays proportionally negligible.
 */
const SAGITTA_TOLERANCE = 0.02
const RELATIVE_TOLERANCE = 1e-4

/** The deviation actually guaranteed at a given radius. */
export function chordTolerance(radius) {
  return Math.max(SAGITTA_TOLERANCE, Math.abs(radius) * RELATIVE_TOLERANCE)
}

const MIN_SEGMENTS = 12
const MAX_SEGMENTS = 256

/**
 * How many chords to split a sweep into so no chord strays further than the
 * tolerance from the true curve.
 *
 * From the sagitta relation s = r(1 − cos(θ/2)): solving for the half-angle
 * that keeps s within tolerance gives the largest chord we may use.
 */
export function segmentsForArc(radius, sweep = TAU) {
  if (!(radius > 0)) return MIN_SEGMENTS

  const ratio = 1 - chordTolerance(radius) / radius
  // A radius smaller than the tolerance cannot be approximated finely; the
  // minimum segment count is already far more than such a curve needs.
  if (ratio <= -1) return MIN_SEGMENTS

  const maxChordAngle = 2 * Math.acos(Math.max(-1, Math.min(1, ratio)))
  const needed = Math.ceil(Math.abs(sweep) / maxChordAngle)

  return Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, needed))
}

/** A point on a circle at the given angle. */
export function pointOnCircle(centre, radius, angle) {
  return {
    x: centre.x + radius * Math.cos(angle),
    y: centre.y + radius * Math.sin(angle),
    z: centre.z ?? 0,
  }
}

/** Angle from a centre to a point, in [0, 2π). */
export function angleOf(centre, point) {
  const angle = Math.atan2(point.y - centre.y, point.x - centre.x)
  return angle < 0 ? angle + TAU : angle
}

/**
 * The sweep from start to end, always taken counter-clockwise.
 *
 * A full circle is stored as an arc whose start and end coincide, so a zero
 * difference means the whole way round rather than nothing.
 */
export function arcSweep(startAngle, endAngle) {
  const sweep = endAngle - startAngle
  const wrapped = ((sweep % TAU) + TAU) % TAU
  return wrapped === 0 ? TAU : wrapped
}

/** Tessellate an arc into points, including both ends. */
export function arcPoints(centre, radius, startAngle, endAngle) {
  if (!(radius > 0)) return []

  const sweep = arcSweep(startAngle, endAngle)
  const count = segmentsForArc(radius, sweep)
  const points = []

  for (let i = 0; i <= count; i++) {
    points.push(pointOnCircle(centre, radius, startAngle + (sweep * i) / count))
  }

  return points
}

/**
 * Tessellate a whole circle. The closing point is NOT repeated — callers that
 * need a closed ring already treat the last point as joining the first.
 */
export function circlePoints(centre, radius) {
  if (!(radius > 0)) return []

  const count = segmentsForArc(radius, TAU)
  const points = []

  for (let i = 0; i < count; i++) {
    points.push(pointOnCircle(centre, radius, (TAU * i) / count))
  }

  return points
}

/** Exact circumference — from the radius, never from the chords. */
export function circleCircumference(radius) {
  return TAU * Math.max(0, radius)
}

/** Exact arc length. */
export function arcLength(radius, startAngle, endAngle) {
  return Math.max(0, radius) * arcSweep(startAngle, endAngle)
}

/** Exact area. */
export function circleArea(radius) {
  return Math.PI * Math.max(0, radius) ** 2
}

/**
 * The four quadrant points — east, north, west, south.
 * Drafters snap to these constantly; they are where a circle meets its
 * bounding box, and where a tangent runs true to an axis.
 */
export function quadrantPoints(centre, radius) {
  return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) =>
    pointOnCircle(centre, radius, angle),
  )
}

/**
 * Closest point on the circle to an arbitrary point.
 * Returns null at the exact centre, where every direction is equally close.
 */
export function nearestPointOnCircle(point, centre, radius) {
  const dx = point.x - centre.x
  const dy = point.y - centre.y
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return null

  return {
    x: centre.x + (dx / distance) * radius,
    y: centre.y + (dy / distance) * radius,
    z: centre.z ?? 0,
  }
}

/** Does this angle fall within the arc's sweep? */
export function angleWithinArc(angle, startAngle, endAngle) {
  const sweep = arcSweep(startAngle, endAngle)
  const offset = ((angle - startAngle) % TAU + TAU) % TAU
  return offset <= sweep + 1e-9
}

/**
 * An arc through three points — the classic construction, and how you fit a
 * curve to a landing or a bay window whose ends and midpoint are known.
 *
 * Returns null when the points are collinear, because there is no such arc.
 */
export function arcThroughPoints(a, b, c) {
  const offsetA = 2 * (b.x - a.x)
  const offsetB = 2 * (b.y - a.y)
  const offsetC = b.x ** 2 + b.y ** 2 - a.x ** 2 - a.y ** 2
  const offsetD = 2 * (c.x - b.x)
  const offsetE = 2 * (c.y - b.y)
  const offsetF = c.x ** 2 + c.y ** 2 - b.x ** 2 - b.y ** 2

  const determinant = offsetA * offsetE - offsetD * offsetB
  if (Math.abs(determinant) < 1e-9) return null // collinear

  const centre = {
    x: (offsetC * offsetE - offsetF * offsetB) / determinant,
    y: (offsetA * offsetF - offsetD * offsetC) / determinant,
    z: a.z ?? 0,
  }
  const radius = Math.hypot(a.x - centre.x, a.y - centre.y)

  return { centre, radius, startAngle: angleOf(centre, a), endAngle: angleOf(centre, c) }
}

export { TAU }
