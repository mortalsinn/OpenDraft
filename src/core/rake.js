/**
 * Raking guards — the railing that follows a stair.
 *
 * Three things separate a raking guard from a level one, and each is a way to
 * order the wrong material:
 *
 *   1. The rail runs along the HYPOTENUSE. Quoting the horizontal run
 *      under-orders every rake in the job, by about 15% on a typical stair.
 *
 *   2. Posts are PLUMB, not perpendicular to the slope. A post square to the
 *      rake leans, which is both wrong and obvious once it is standing.
 *
 *   3. Guard height is measured VERTICALLY from the nosing line — the line
 *      touching the front edge of every tread — not perpendicular to it.
 *      Measuring perpendicular gives a guard that reads as compliant on paper
 *      and fails on site, because the perpendicular distance is always shorter
 *      than the vertical one.
 */

import { layoutStair } from './stairs.js'
import { picketsInBay, RAILING_DEFAULTS } from './railing.js'
import { getRules, checkGuard } from './code.js'

/**
 * The nosing line of a stair: from the bottom nosing to the top, in the
 * stair's own 2D plane of (distance along run, height).
 *
 * Everything about a rake is easier in this plane, and the result is lifted
 * back into world space once at the end.
 */
export function nosingLine(stair) {
  const layout = layoutStair(stair)
  if (!layout.riserCount) return null

  return {
    run: layout.totalRun,
    rise: layout.totalRise,
    slope: Math.atan2(layout.totalRise, layout.totalRun),
    // The rail's true length. This is the number that gets cut.
    length: Math.hypot(layout.totalRun, layout.totalRise),
    layout,
  }
}

/**
 * Lay out a guard along a stair.
 *
 * @param {object} stair   A stairRun node.
 * @param {object} guard   Guard parameters — height, spacings, widths.
 * @returns {{
 *   posts: {along:number, base:number, top:number}[],
 *   pickets: {along:number, base:number, top:number}[],
 *   railLength: number, slope: number, bays: number, gap: number,
 * }}  Positions are in the stair's own plane: `along` is horizontal distance
 *     from the bottom, `base` is the nosing height there, `top` the rail.
 */
export function layoutRakingGuard(stair, guard = {}) {
  const settings = { ...RAILING_DEFAULTS, ...guard }
  const { height, postSpacing, postWidth, picketWidth, maxGap } = settings

  const nosing = nosingLine(stair)
  const empty = { posts: [], pickets: [], railLength: 0, slope: 0, bays: 0, gap: 0, height }
  if (!nosing || nosing.run <= 0) return empty

  const { run, rise, slope, length } = nosing
  // Height at a horizontal position, on the nosing line.
  const nosingAt = (along) => (along / run) * rise

  // Post spacing is set along the SLOPE, because that is how a stair rail is
  // built and measured; converting to horizontal keeps the rest of the maths
  // in one plane.
  const horizontalSpacing = postSpacing * Math.cos(slope)
  const bays = Math.max(1, Math.ceil(run / horizontalSpacing))
  const baySpan = run / bays

  const posts = []
  for (let i = 0; i <= bays; i++) {
    const along = i * baySpan
    const base = nosingAt(along)
    // Plumb: the top is directly above the base, a fixed VERTICAL height up.
    posts.push({ along, base, top: base + height })
  }

  // Pickets are plumb too, so the opening between them is bounded by the
  // horizontal clear distance — the same dimension the sphere test uses on a
  // level guard.
  const clear = Math.max(0, baySpan - postWidth)
  const perBay = picketsInBay(clear, picketWidth, maxGap)
  const gap = perBay > 0 ? (clear - perBay * picketWidth) / (perBay + 1) : clear

  const pickets = []
  for (let bay = 0; bay < bays; bay++) {
    const bayStart = bay * baySpan + postWidth / 2
    for (let i = 0; i < perBay; i++) {
      const along = bayStart + (i + 1) * gap + (i + 0.5) * picketWidth
      const base = nosingAt(along)
      pickets.push({ along, base, top: base + height })
    }
  }

  return {
    posts,
    pickets,
    // The hypotenuse — what actually gets cut.
    railLength: length,
    slope,
    bays,
    gap,
    height,
    run,
    rise,
  }
}

/**
 * Lift the layout into world space along the stair's direction.
 * Returns posts and pickets as 3D segments ready to draw.
 */
export function rakingGuardGeometry(stair, guard = {}) {
  const points = stair.points ?? []
  if (points.length < 2) return { posts: [], pickets: [], rail: null }

  const [from, to] = points
  const dx = to.x - from.x
  const dy = to.y - from.y
  const planLength = Math.hypot(dx, dy)
  if (planLength === 0) return { posts: [], pickets: [], rail: null }

  const ux = dx / planLength
  const uy = dy / planLength
  const offset = guard.offset ?? 0
  // Perpendicular, to stand the guard off to one side of the flight.
  const px = -uy * offset
  const py = ux * offset

  const layout = layoutRakingGuard(stair, guard)
  const lift = ({ along, base, top }) => [
    { x: from.x + ux * along + px, y: from.y + uy * along + py, z: (from.z ?? 0) + base },
    { x: from.x + ux * along + px, y: from.y + uy * along + py, z: (from.z ?? 0) + top },
  ]

  const rail =
    layout.posts.length >= 2
      ? [lift(layout.posts[0])[1], lift(layout.posts[layout.posts.length - 1])[1]]
      : null

  return {
    posts: layout.posts.map(lift),
    pickets: layout.pickets.map(lift),
    rail,
    layout,
  }
}

/**
 * Code findings for a raking guard.
 *
 * Height is checked VERTICALLY from the nosing line, which is how a stair
 * guard is measured. Checking perpendicular to the rake would pass a guard
 * that is genuinely too low — the perpendicular distance is always the shorter
 * of the two, so it flatters every result.
 */
export function rakingGuardIssues(stair, guard = {}, rules = getRules()) {
  const layout = layoutRakingGuard(stair, guard)
  if (!layout.posts.length) return []

  return checkGuard(
    { height: layout.height, maxGap: guard.maxGap, actualGap: layout.gap },
    rules,
  ).map((issue) => ({
    ...issue,
    message: `${issue.message} (raking guard)`,
  }))
}

/**
 * Takeoff for a raking guard.
 *
 * Posts are quoted at their real individual lengths rather than a nominal
 * height, because on a rake each one is a different cut.
 */
export function rakingGuardQuantities(stair, guard = {}) {
  const layout = layoutRakingGuard(stair, guard)
  if (!layout.posts.length) return []

  const picketLength = layout.pickets.reduce((sum, picket) => sum + (picket.top - picket.base), 0)

  return [
    { sku: 'POST-RAKE', description: 'Post — raking guard', unit: 'ea', quantity: layout.posts.length },
    { sku: 'PICKET', description: 'Picket', unit: 'ea', quantity: layout.pickets.length },
    { sku: 'PICKET-LF', description: 'Picket — linear', unit: 'in', quantity: picketLength },
    {
      sku: 'RAKE-RAIL',
      description: 'Raking rail',
      unit: 'in',
      // The hypotenuse. Quoting the run instead under-orders every rake.
      quantity: layout.railLength,
    },
  ]
}
