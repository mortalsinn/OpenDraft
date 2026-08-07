/**
 * Trim, extend, fillet and chamfer.
 *
 * The operations that make a drawing correctable. Without them, fixing a line
 * that overshoots means deleting it and drawing it again, and every correction
 * risks losing the snapping that made it right in the first place.
 *
 * Everything is pure and works on endpoint pairs, so the same functions serve
 * the preview, the commit and the tests.
 */

const EPSILON = 1e-9

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v) => Math.hypot(v.x, v.y)

function normalize(v) {
  const length = len(v)
  return length < EPSILON ? null : { x: v.x / length, y: v.y / length }
}

/**
 * Where two INFINITE lines cross, even if the segments themselves do not.
 * That is the point of trim and extend: the meeting place usually lies beyond
 * one or both of the drawn ends.
 */
export function infiniteIntersection(a1, a2, b1, b2) {
  const d1 = sub(a2, a1)
  const d2 = sub(b2, b1)

  const denominator = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denominator) < EPSILON) return null // parallel or collinear

  const t = ((b1.x - a1.x) * d2.y - (b1.y - a1.y) * d2.x) / denominator
  return { x: a1.x + d1.x * t, y: a1.y + d1.y * t, z: a1.z ?? 0 }
}

/**
 * Extend a segment so it meets another.
 *
 * The end that moves is whichever is already NEARER the meeting point — that
 * is the end reaching toward it, and moving the far end would flip the line
 * around. Returns null when the lines are parallel, or when the meeting point
 * lies behind the segment (which would shorten it, not extend it).
 */
export function extendToMeet(start, end, targetStart, targetEnd) {
  const meeting = infiniteIntersection(start, end, targetStart, targetEnd)
  if (!meeting) return null

  const distanceToStart = len(sub(meeting, start))
  const distanceToEnd = len(sub(meeting, end))
  const movingEnd = distanceToEnd <= distanceToStart

  const anchor = movingEnd ? start : end
  const moving = movingEnd ? end : start

  // The meeting point must lie beyond the moving end, not between the two.
  const direction = normalize(sub(moving, anchor))
  if (!direction) return null

  const reach = (meeting.x - anchor.x) * direction.x + (meeting.y - anchor.y) * direction.y
  if (reach < len(sub(moving, anchor)) - EPSILON) return null // would shorten

  return movingEnd ? { start, end: meeting } : { start: meeting, end }
}

/**
 * Trim a segment at its crossing with another, keeping the side nearest
 * `keepNear`.
 *
 * Which side to keep is genuinely ambiguous from geometry alone, so the caller
 * supplies the point they clicked — the piece you pointed at is the piece you
 * keep, which is how every CAD tool behaves.
 */
export function trimAt(start, end, cutterStart, cutterEnd, keepNear) {
  const crossing = infiniteIntersection(start, end, cutterStart, cutterEnd)
  if (!crossing) return null

  // The cut must actually fall within the segment, or there is nothing to trim.
  const direction = sub(end, start)
  const lengthSquared = direction.x ** 2 + direction.y ** 2
  if (lengthSquared < EPSILON) return null

  const t = ((crossing.x - start.x) * direction.x + (crossing.y - start.y) * direction.y) / lengthSquared
  if (t <= EPSILON || t >= 1 - EPSILON) return null

  const keepStartSide = len(sub(keepNear, start)) <= len(sub(keepNear, end))
  return keepStartSide ? { start, end: crossing } : { start: crossing, end }
}

/**
 * Geometry for rounding the corner where two segments meet.
 *
 * The fillet centre sits on the angle bisector at r / sin(θ/2) from the corner,
 * and the tangent points at r / tan(θ/2) along each leg. Returns null when the
 * legs are parallel — no corner — or when the radius is too large to fit
 * within the segments, which would eat past their far ends.
 */
export function filletCorner(a1, a2, b1, b2, radius) {
  if (!(radius > 0)) return null

  const corner = infiniteIntersection(a1, a2, b1, b2)
  if (!corner) return null

  // Aim from the corner toward the far end of each leg.
  const farA = len(sub(a1, corner)) > len(sub(a2, corner)) ? a1 : a2
  const farB = len(sub(b1, corner)) > len(sub(b2, corner)) ? b1 : b2

  const dirA = normalize(sub(farA, corner))
  const dirB = normalize(sub(farB, corner))
  if (!dirA || !dirB) return null

  const cosAngle = Math.max(-1, Math.min(1, dirA.x * dirB.x + dirA.y * dirB.y))
  const angle = Math.acos(cosAngle)
  if (angle < EPSILON || Math.abs(angle - Math.PI) < EPSILON) return null // no corner

  const tangentDistance = radius / Math.tan(angle / 2)

  // The fillet has to fit on both legs, or it would consume the whole segment.
  if (tangentDistance > len(sub(farA, corner)) || tangentDistance > len(sub(farB, corner))) {
    return null
  }

  const tangentA = {
    x: corner.x + dirA.x * tangentDistance,
    y: corner.y + dirA.y * tangentDistance,
    z: corner.z ?? 0,
  }
  const tangentB = {
    x: corner.x + dirB.x * tangentDistance,
    y: corner.y + dirB.y * tangentDistance,
    z: corner.z ?? 0,
  }

  const bisector = normalize({ x: dirA.x + dirB.x, y: dirA.y + dirB.y })
  if (!bisector) return null

  const centreDistance = radius / Math.sin(angle / 2)
  const centre = {
    x: corner.x + bisector.x * centreDistance,
    y: corner.y + bisector.y * centreDistance,
    z: corner.z ?? 0,
  }

  return { corner, centre, radius, tangentA, tangentB, sweep: Math.PI - angle }
}

/**
 * Geometry for bevelling a corner. Like a fillet but with a straight cut, and
 * the two setbacks may differ — an asymmetric chamfer is a real detail, not a
 * mistake.
 */
export function chamferCorner(a1, a2, b1, b2, setbackA, setbackB = setbackA) {
  if (!(setbackA > 0) || !(setbackB > 0)) return null

  const corner = infiniteIntersection(a1, a2, b1, b2)
  if (!corner) return null

  const farA = len(sub(a1, corner)) > len(sub(a2, corner)) ? a1 : a2
  const farB = len(sub(b1, corner)) > len(sub(b2, corner)) ? b1 : b2

  const dirA = normalize(sub(farA, corner))
  const dirB = normalize(sub(farB, corner))
  if (!dirA || !dirB) return null

  if (setbackA > len(sub(farA, corner)) || setbackB > len(sub(farB, corner))) return null

  return {
    corner,
    tangentA: {
      x: corner.x + dirA.x * setbackA,
      y: corner.y + dirA.y * setbackA,
      z: corner.z ?? 0,
    },
    tangentB: {
      x: corner.x + dirB.x * setbackB,
      y: corner.y + dirB.y * setbackB,
      z: corner.z ?? 0,
    },
  }
}

/**
 * Rewrite a segment so the end nearest `nearPoint` lands on `target`.
 * Used to pull both legs back to their tangent points after a fillet.
 */
export function retargetNearestEnd(start, end, nearPoint, target) {
  return len(sub(nearPoint, start)) <= len(sub(nearPoint, end))
    ? { start: target, end }
    : { start, end: target }
}
