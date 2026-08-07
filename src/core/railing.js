/**
 * Railing layout.
 *
 * ONE function decides where every post and picket goes, and both the 3D
 * renderer and the takeoff read from it. That is deliberate and it is the most
 * important rule in this file: if the scene laid out pickets one way and
 * `quantities()` counted them another, the drawing would stop being the quote,
 * and the entire premise of the product would be a lie you only discover on a
 * job site.
 */

/** Defaults in inches. Overridable per node. */
export const RAILING_DEFAULTS = {
  height: 42, // top of rail above the walking surface
  postSpacing: 72, // maximum centre-to-centre; actual is evened out
  postWidth: 2, // 2" square post
  picketWidth: 0.75, // 3/4" square baluster
  maxGap: 3.9,
  /* The regulated dimension is the CLEAR GAP, not the picket pitch: no opening
   * may pass a 100mm sphere (3.937"). 3.9 keeps a sliver of margin.
   *
   * TODO: this is a hard-coded stand-in. The real value depends on jurisdiction
   * and occupancy and should come from CodeCompass rather than living here. */
}

const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
})

function runLengthOf(start, end) {
  return Math.hypot(end.x - start.x, end.y - start.y, (end.z ?? 0) - (start.z ?? 0))
}

/**
 * How many pickets fit in a bay of clear width `clear`.
 *
 * With k pickets there are k+1 gaps, so
 *     k*picketWidth + (k+1)*gap = clear
 * and requiring gap <= maxGap rearranges to
 *     k >= (clear - maxGap) / (picketWidth + maxGap)
 *
 * Taking the ceiling gives the fewest pickets that still close the openings.
 * Counting by pitch instead — `floor(clear / spacing)` — is the classic way to
 * come up one picket short and fail inspection.
 */
export function picketsInBay(clear, picketWidth, maxGap) {
  if (clear <= maxGap) return 0 // opening already legal with no pickets
  return Math.ceil((clear - maxGap) / (picketWidth + maxGap))
}

/**
 * Resolve a railing node into concrete geometry.
 *
 * @returns {{
 *   runLength: number,
 *   bays: number,
 *   posts: {x,y,z}[],       // base centres
 *   pickets: {x,y,z}[],     // base centres
 *   gap: number,            // actual clear gap achieved
 *   height: number,
 *   postWidth: number,
 *   picketWidth: number,
 * }}
 */
export function layoutRailing(node) {
  const settings = { ...RAILING_DEFAULTS, ...node }
  const { start, end, height, postSpacing, postWidth, picketWidth, maxGap } = settings

  const runLength = runLengthOf(start, end)
  if (runLength <= 0) {
    return { runLength: 0, bays: 0, posts: [], pickets: [], gap: 0, height, postWidth, picketWidth }
  }

  // Even out the bays rather than leaving a short remainder at one end — that
  // is what a fabricator would actually do, and it keeps the drawing honest.
  const bays = Math.max(1, Math.ceil(runLength / postSpacing))
  const posts = []
  for (let i = 0; i <= bays; i++) {
    posts.push(lerp(start, end, i / bays))
  }

  const baySpan = runLength / bays
  const clear = Math.max(0, baySpan - postWidth)
  const perBay = picketsInBay(clear, picketWidth, maxGap)

  // Actual gap achieved, for display — usually a little under maxGap.
  const gap = perBay > 0 ? (clear - perBay * picketWidth) / (perBay + 1) : clear

  const pickets = []
  for (let bay = 0; bay < bays; bay++) {
    const bayStartDistance = bay * baySpan + postWidth / 2
    for (let i = 0; i < perBay; i++) {
      // Each picket sits after (i+1) gaps and i preceding pickets.
      const offset = bayStartDistance + (i + 1) * gap + (i + 0.5) * picketWidth
      pickets.push(lerp(start, end, offset / runLength))
    }
  }

  return { runLength, bays, posts, pickets, gap, height, postWidth, picketWidth }
}

/**
 * Takeoff lines for a railing. Reads `layoutRailing`, so a quantity can never
 * disagree with what is drawn.
 */
export function railingQuantities(node) {
  const { runLength, posts, pickets, height } = layoutRailing(node)
  if (runLength <= 0) return []

  return [
    {
      sku: 'POST',
      description: `Post — ${height}" high`,
      unit: 'ea',
      quantity: posts.length,
    },
    { sku: 'PICKET', description: 'Picket', unit: 'ea', quantity: pickets.length },
    { sku: 'TOPRAIL', description: 'Top rail', unit: 'in', quantity: runLength },
  ]
}
