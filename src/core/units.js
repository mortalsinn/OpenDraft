/**
 * Units. The document stores every length as a plain number of INCHES.
 *
 * Inches (not mm, not 1/64 ticks) because this is a stair and railing shop:
 * every catalogue, every drawing, and every conversation on site is in feet,
 * inches and fractions. Storing anything else means converting at both ends
 * and eating rounding drift in between.
 *
 * Display rounding happens once, at format time, in integer ticks of
 * 1/denominator — never by chained float math — so `12' 6 1/2"` survives a
 * parse/format round trip exactly.
 */

const MM_PER_INCH = 25.4

/** Greatest common divisor, for reducing display fractions. */
function gcd(a, b) {
  while (b) [a, b] = [b, a % b]
  return a
}

/**
 * Parse a length the way a person would type it into a dimension box.
 *
 * Accepts, among others:
 *   12          → 12"      (bare numbers are inches)
 *   12'         → 144"
 *   12' 6"      → 150"
 *   12'6        → 150"
 *   6 1/2       → 6.5"
 *   12' 6 1/2"  → 150.5"
 *   1/2         → 0.5"
 *   -3'         → -36"
 *   300mm       → 11.811"  (metric escape hatch)
 *
 * @returns {number|null} inches, or null if the string isn't a length.
 */
export function parseLength(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null

  let s = input.trim().toLowerCase()
  if (!s) return null

  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim()
  }

  // Metric escape hatch — explicit unit suffix required, so a bare number is
  // never silently read as millimetres.
  const metric = s.match(/^([\d.]+)\s*(mm|cm|m)$/)
  if (metric) {
    const value = Number(metric[1])
    if (!Number.isFinite(value)) return null
    const factor = { mm: 1, cm: 10, m: 1000 }[metric[2]]
    return (sign * value * factor) / MM_PER_INCH
  }

  // Split off a feet part if one is marked. Everything after it is inches.
  let feet = 0
  const feetMatch = s.match(/^([\d.]+)\s*(?:'|ft|feet|foot)\s*(.*)$/)
  if (feetMatch) {
    feet = Number(feetMatch[1])
    if (!Number.isFinite(feet)) return null
    s = feetMatch[2].trim()
  }

  // Strip an inch marker off the tail; it carries no information by this point.
  s = s.replace(/\s*(?:"|''|in|inch|inches)$/, '').trim()

  let inches = 0
  if (s) {
    inches = parseInchPart(s)
    if (inches === null) return null
  } else if (!feetMatch) {
    return null // empty string with no feet part — not a length
  }

  return sign * (feet * 12 + inches)
}

/** Parse the inches portion: `6`, `6.5`, `1/2`, or `6 1/2`. */
function parseInchPart(s) {
  // Mixed number: whole part then a fraction, e.g. `6 1/2` or `6-1/2`.
  const mixed = s.match(/^(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const denominator = Number(mixed[3])
    if (!denominator) return null
    return Number(mixed[1]) + Number(mixed[2]) / denominator
  }

  // Bare fraction, e.g. `1/2`.
  const fraction = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (!denominator) return null
    return Number(fraction[1]) / denominator
  }

  // Plain decimal or integer.
  if (/^\d*\.?\d+$/.test(s)) return Number(s)

  return null
}

/**
 * Format inches for display, e.g. 150.5 → `12' 6 1/2"`.
 *
 * Rounds once, in integer ticks of 1/denominator, so a value landing exactly
 * on a boundary can't cascade wrong (15.99999 → `16"`, never `15' 12"`).
 *
 * @param {number} inches
 * @param {{denominator?: number, showZeroInches?: boolean}} [options]
 */
export function formatLength(inches, options = {}) {
  const { denominator = 16, showZeroInches = false } = options
  if (!Number.isFinite(inches)) return '—'

  const sign = inches < 0 ? '-' : ''
  const totalTicks = Math.round(Math.abs(inches) * denominator)
  const ticksPerFoot = 12 * denominator

  const feet = Math.floor(totalTicks / ticksPerFoot)
  const remainder = totalTicks - feet * ticksPerFoot
  const wholeInches = Math.floor(remainder / denominator)
  let numerator = remainder - wholeInches * denominator

  let fraction = ''
  if (numerator > 0) {
    const divisor = gcd(numerator, denominator)
    fraction = `${numerator / divisor}/${denominator / divisor}`
  }

  const parts = []
  if (feet > 0) parts.push(`${feet}'`)

  const hasInches = wholeInches > 0 || fraction
  if (hasInches) {
    parts.push(`${wholeInches > 0 || !fraction ? wholeInches : ''}${fraction ? (wholeInches > 0 ? ' ' : '') + fraction : ''}"`)
  } else if (feet === 0 || showZeroInches) {
    parts.push('0"')
  }

  return sign + parts.join(' ')
}

/** Snap a raw length to the nearest 1/denominator — used when committing geometry. */
export function snapToFraction(inches, denominator = 16) {
  if (!Number.isFinite(inches)) return inches
  return Math.round(inches * denominator) / denominator
}

export const INCHES_PER_FOOT = 12
export { MM_PER_INCH }
