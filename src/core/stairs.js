/**
 * Stair layout.
 *
 * A stair is not drawn, it is SOLVED. The floor-to-floor rise is a fixed fact
 * of the building; everything else follows from it. You cannot draw a stair
 * with fourteen and a half risers, and you cannot draw one whose risers differ
 * from each other — so the geometry here is derived from the rise rather than
 * from whatever line the user happened to sketch.
 *
 * The drawn line supplies the START and the DIRECTION. The total run is
 * computed, because a stair whose run disagrees with its tread count is not a
 * stair.
 */

/**
 * Dimensional limits. Values are the Ontario/National Building Code figures for
 * PRIVATE stairs, converted from the metric the code is actually written in.
 *
 * TODO: occupancy and jurisdiction change every one of these. They live here as
 * parameters precisely so the compliance engine can replace them wholesale
 * rather than hunting for hard-coded numbers.
 */
export const STAIR_DEFAULTS = {
  totalRise: 108, // 9'-0" floor to floor
  width: 36,
  treadDepth: 10.5, // going, nosing excluded
  nosing: 1,
  idealRiser: 7, // what a comfortable stair wants to be
  minRiser: 4.92, // 125mm
  maxRiser: 7.87, // 200mm
  minTread: 10.04, // 255mm
  headroom: 80.7, // 2050mm
}

/** Blondel's rule: a comfortable stair keeps 2 x riser + tread in this band. */
export const COMFORT_BAND = { min: 24, max: 25 }

/**
 * Solve the stair.
 *
 * Riser count is chosen to bring the actual riser height as close to ideal as
 * possible, then clamped so it cannot land outside the legal band. Every riser
 * is identical by construction — deriving them by division rather than
 * accumulating a nominal height is what guarantees that, and unequal risers are
 * both a trip hazard and an automatic inspection failure.
 */
export function layoutStair(node) {
  const settings = { ...STAIR_DEFAULTS, ...node }
  const { totalRise, treadDepth, width, idealRiser, minRiser, maxRiser, nosing } = settings

  if (!(totalRise > 0)) {
    return { riserCount: 0, riserHeight: 0, treadCount: 0, totalRun: 0, steps: [], width, treadDepth, nosing }
  }

  // The fewest and most risers that keep the height legal. Ceil/floor rather
  // than round: a count outside this range cannot be made legal by rounding.
  const fewest = Math.ceil(totalRise / maxRiser)
  const most = Math.floor(totalRise / minRiser)

  let riserCount = Math.max(1, Math.round(totalRise / idealRiser))
  riserCount = Math.max(fewest, Math.min(Math.max(most, fewest), riserCount))

  const riserHeight = totalRise / riserCount

  // The top "tread" is the floor you arrive on, so a flight has one fewer
  // tread than it has risers. Getting this wrong is the classic off-by-one
  // that leaves a stair one tread short of the landing.
  const treadCount = Math.max(0, riserCount - 1)
  const totalRun = treadCount * treadDepth

  const steps = []
  for (let i = 1; i <= riserCount; i++) {
    steps.push({
      index: i,
      top: i * riserHeight, // height of this step's walking surface
      offset: (i - 1) * treadDepth, // distance along the run to its leading edge
      isLanding: i === riserCount,
    })
  }

  return { riserCount, riserHeight, treadCount, totalRun, steps, width, treadDepth, nosing, totalRise }
}

/**
 * Everything wrong with this stair, as plain findings.
 *
 * Returned rather than thrown: a stair mid-edit is allowed to be illegal, the
 * drawing just has to say so. This is the shape the compliance engine will
 * produce for every object type.
 */
export function stairIssues(node) {
  const settings = { ...STAIR_DEFAULTS, ...node }
  const { riserHeight, treadDepth, riserCount } = layoutStair(node)
  const issues = []

  if (!riserCount) {
    issues.push({ severity: 'error', code: 'RISE', message: 'Stair has no rise' })
    return issues
  }

  if (riserHeight > settings.maxRiser) {
    issues.push({
      severity: 'error',
      code: 'RISER-MAX',
      message: `Riser ${riserHeight.toFixed(2)}" exceeds the ${settings.maxRiser}" maximum`,
    })
  }
  if (riserHeight < settings.minRiser) {
    issues.push({
      severity: 'error',
      code: 'RISER-MIN',
      message: `Riser ${riserHeight.toFixed(2)}" is below the ${settings.minRiser}" minimum`,
    })
  }
  if (treadDepth < settings.minTread) {
    issues.push({
      severity: 'error',
      code: 'TREAD-MIN',
      message: `Tread ${treadDepth}" is below the ${settings.minTread}" minimum`,
    })
  }

  const comfort = 2 * riserHeight + treadDepth
  if (comfort < COMFORT_BAND.min || comfort > COMFORT_BAND.max) {
    issues.push({
      severity: 'warning',
      code: 'COMFORT',
      message: `2R+T is ${comfort.toFixed(1)}", outside the comfortable ${COMFORT_BAND.min}–${COMFORT_BAND.max}" range`,
    })
  }

  return issues
}

/**
 * The lines a stair contributes to a PLAN drawing.
 *
 * A stair in plan is its tread nosings and the two sides of the flight — not
 * the single line that describes where it runs. Drawing only that line is how
 * you hand a fabricator a sheet with a stair on it that cannot be counted.
 *
 * @returns {[{x,y,z},{x,y,z}][]} pairs of endpoints, in world space
 */
export function stairPlanLines(node) {
  const points = node.points ?? []
  if (points.length < 2) return []

  const [from, to] = points
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return []

  const ux = dx / length
  const uy = dy / length
  // Perpendicular, for the width of the flight.
  const px = -uy
  const py = ux

  const { steps, width, totalRun } = layoutStair(node)
  if (!steps.length) return []

  const half = width / 2
  const at = (along, across) => ({
    x: from.x + ux * along + px * across,
    y: from.y + uy * along + py * across,
    z: from.z ?? 0,
  })

  const lines = []

  // Both sides of the flight.
  lines.push([at(0, half), at(totalRun, half)])
  lines.push([at(0, -half), at(totalRun, -half)])

  // A nosing line at every step, which is what makes treads countable.
  for (const step of steps) {
    if (step.offset > totalRun + 1e-9) continue
    lines.push([at(step.offset, half), at(step.offset, -half)])
  }

  return lines
}

/**
 * Takeoff for a stair. Reads `layoutStair`, so the count of treads quoted is
 * exactly the count of treads drawn.
 */
export function stairQuantities(node) {
  const { riserCount, treadCount, totalRun, width, riserHeight } = layoutStair(node)
  if (!riserCount) return []

  // A stringer follows the hypotenuse of the whole flight.
  const stringerLength = Math.hypot(totalRun, riserCount * riserHeight)
  // Wide stairs need an intermediate stringer to stop the treads flexing.
  const stringers = width > 36 ? 3 : 2

  return [
    { sku: 'TREAD', description: 'Tread', unit: 'ea', quantity: treadCount },
    { sku: 'RISER', description: 'Riser', unit: 'ea', quantity: riserCount },
    { sku: 'STRINGER', description: 'Stringer', unit: 'in', quantity: stringerLength * stringers },
    { sku: 'STAIR-RAIL', description: 'Stair handrail', unit: 'in', quantity: stringerLength },
  ]
}
