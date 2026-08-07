/**
 * Building code rules.
 *
 * Every dimensional limit in this app used to be a number sitting next to the
 * geometry that consumed it. That is fine until someone asks "says who?" — and
 * on a stair or a guard, someone eventually does. So limits live here, grouped
 * by jurisdiction and occupancy, and every finding carries the clause it came
 * from.
 *
 * Codes are written in metric. The millimetre figures are the authoritative
 * ones and the inch values are derived, not the other way round, so nobody
 * introduces a rounding error by retyping a converted number.
 *
 * IMPORTANT: changing the jurisdiction does NOT silently re-shape existing
 * objects. It re-evaluates them and reports what now fails. Quietly moving a
 * picket spacing under someone would change a drawing they had already checked.
 */

const MM = 25.4
const mm = (value) => value / MM

export const JURISDICTIONS = {
  'obc-dwelling': {
    id: 'obc-dwelling',
    label: 'Ontario (OBC) — within a dwelling',
    authority: 'Ontario Building Code',
    stair: {
      minRiser: mm(125),
      maxRiser: mm(200),
      minRun: mm(255),
      minTreadDepth: mm(235),
      citation: 'OBC 9.8.4',
    },
    guard: {
      minHeight: mm(900),
      maxOpening: mm(100),
      citation: 'OBC 9.8.8',
    },
  },

  'obc-public': {
    id: 'obc-public',
    label: 'Ontario (OBC) — public / common',
    authority: 'Ontario Building Code',
    stair: {
      minRiser: mm(125),
      maxRiser: mm(180),
      minRun: mm(280),
      minTreadDepth: mm(280),
      citation: 'OBC 3.4.6 / 9.8.4',
    },
    guard: {
      minHeight: mm(1070),
      maxOpening: mm(100),
      citation: 'OBC 3.3.1.18 / 9.8.8',
    },
  },

  'irc-dwelling': {
    id: 'irc-dwelling',
    label: 'US (IRC) — dwelling',
    authority: 'International Residential Code',
    stair: {
      minRiser: 0,
      maxRiser: 7.75,
      minRun: 10,
      minTreadDepth: 10,
      citation: 'IRC R311.7.5',
    },
    guard: {
      minHeight: 36,
      maxOpening: 4,
      citation: 'IRC R312.1',
    },
  },
}

export const DEFAULT_JURISDICTION = 'obc-dwelling'

/** Rule set for a document, falling back to the default. */
export function getRules(jurisdictionId) {
  return JURISDICTIONS[jurisdictionId] ?? JURISDICTIONS[DEFAULT_JURISDICTION]
}

/** A comfortable stair keeps 2 x riser + tread in this band (Blondel). */
export const COMFORT_BAND = { min: 24, max: 25 }

const finding = (severity, code, message, citation, extra = {}) => ({
  severity,
  code,
  message,
  citation,
  ...extra,
})

/**
 * Check a guard (railing) against the rules.
 *
 * The regulated dimension for infill is the CLEAR GAP, not the picket pitch:
 * no opening may pass a sphere of the stated size.
 */
export function checkGuard({ height, maxGap, actualGap }, rules) {
  const issues = []
  const { guard } = rules

  if (height < guard.minHeight) {
    issues.push(
      finding(
        'error',
        'GUARD-HEIGHT',
        `Guard ${fmt(height)}" is below the ${fmt(guard.minHeight)}" minimum`,
        guard.citation,
        { actual: height, limit: guard.minHeight },
      ),
    )
  }

  // Check what the railing will actually be built to, not just its setting.
  const gap = actualGap ?? maxGap
  if (gap > guard.maxOpening + 1e-9) {
    issues.push(
      finding(
        'error',
        'GUARD-OPENING',
        `Openings of ${fmt(gap)}" pass the ${fmt(guard.maxOpening)}" sphere`,
        guard.citation,
        { actual: gap, limit: guard.maxOpening },
      ),
    )
  }

  return issues
}

/** Check a stair against the rules. */
export function checkStair({ riserHeight, treadDepth, riserCount }, rules) {
  const issues = []
  const { stair } = rules

  if (!riserCount) {
    return [finding('error', 'RISE', 'Stair has no rise', stair.citation)]
  }

  if (riserHeight > stair.maxRiser + 1e-9) {
    issues.push(
      finding(
        'error',
        'RISER-MAX',
        `Riser ${fmt(riserHeight)}" exceeds the ${fmt(stair.maxRiser)}" maximum`,
        stair.citation,
        { actual: riserHeight, limit: stair.maxRiser },
      ),
    )
  }

  if (riserHeight < stair.minRiser - 1e-9) {
    issues.push(
      finding(
        'error',
        'RISER-MIN',
        `Riser ${fmt(riserHeight)}" is below the ${fmt(stair.minRiser)}" minimum`,
        stair.citation,
        { actual: riserHeight, limit: stair.minRiser },
      ),
    )
  }

  if (treadDepth < stair.minRun - 1e-9) {
    issues.push(
      finding(
        'error',
        'TREAD-MIN',
        `Run ${fmt(treadDepth)}" is below the ${fmt(stair.minRun)}" minimum`,
        stair.citation,
        { actual: treadDepth, limit: stair.minRun },
      ),
    )
  }

  const comfort = 2 * riserHeight + treadDepth
  if (comfort < COMFORT_BAND.min || comfort > COMFORT_BAND.max) {
    // Not a code rule — a stair can be perfectly legal and still unpleasant.
    issues.push(
      finding(
        'warning',
        'COMFORT',
        `2R+T is ${fmt(comfort)}", outside the comfortable ${COMFORT_BAND.min}–${COMFORT_BAND.max}" range`,
        'Blondel — rule of thumb, not code',
        { actual: comfort },
      ),
    )
  }

  return issues
}

/** Two decimals, without a trailing ".00" on whole numbers. */
function fmt(value) {
  return String(Math.round(value * 100) / 100)
}
