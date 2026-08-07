/**
 * Railing layout.
 *
 * ONE function decides where every post and picket goes, and both the 3D
 * renderer and the takeoff read from it. That is deliberate and it is the most
 * important rule in this file: if the scene laid out pickets one way and
 * `quantities()` counted them another, the drawing would stop being the quote,
 * and the entire premise of the product would be a lie you only discover on a
 * job site.
 *
 * A run is a POLYLINE, not a single segment. A deck perimeter drawn as four
 * chained lines is one run whose corners are single shared posts — treating it
 * as four independent runs puts two posts at every corner and quotes four
 * posts that will never be bought.
 */

import { getRules, checkGuard } from './code.js'

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
   * This is the DRAWING's setting, not the law. The legal limit belongs to a
   * jurisdiction (see code.js) and is applied as a check, so a railing drawn
   * to a looser spacing is drawn as asked and reported as non-compliant rather
   * than silently corrected. */
}

const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
})

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0))

/**
 * The points of a run, tolerating the older single-segment shape.
 * Documents are migrated on load, but node helpers are called from enough
 * places that being forgiving here is cheaper than auditing all of them.
 */
export function railingPoints(node) {
  if (Array.isArray(node.points) && node.points.length >= 2) return node.points
  if (node.start && node.end) return [node.start, node.end]
  return []
}

/** The straight spans of a run, including the closing span when it is a loop. */
export function railingSegments(node) {
  const points = railingPoints(node)
  const segments = []

  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i], points[i + 1]])
  }
  if (node.closed && points.length > 2) {
    segments.push([points[points.length - 1], points[0]])
  }

  return segments
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
 * Corner posts sit at every vertex and are emitted ONCE, however many spans
 * meet there.
 *
 * @returns {{
 *   runLength: number, bays: number,
 *   posts: {x,y,z}[], pickets: {x,y,z}[],
 *   rails: [{x,y,z},{x,y,z}][],
 *   gap: number, height: number, postWidth: number, picketWidth: number,
 * }}
 */
export function layoutRailing(node) {
  const settings = { ...RAILING_DEFAULTS, ...node }
  const { height, postSpacing, postWidth, picketWidth, maxGap } = settings

  const points = railingPoints(node)
  const segments = railingSegments(node)

  const empty = {
    runLength: 0,
    bays: 0,
    posts: [],
    pickets: [],
    rails: [],
    gap: 0,
    height,
    postWidth,
    picketWidth,
  }
  if (!segments.length) return empty

  const posts = []
  const pickets = []
  const rails = []
  let runLength = 0
  let bays = 0
  let tightestGap = Infinity

  // Degenerate input (a run of zero length) has no geometry at all, and would
  // otherwise emit stacked posts at a single point.
  const spans = segments.filter(([from, to]) => dist(from, to) > 0)
  if (!spans.length) return empty

  // Each span contributes its OPENING vertex plus its intermediates, and the
  // closing vertex is left to the next span. That counts every corner exactly
  // once while keeping the posts ordered along the run.
  for (const [from, to] of spans) {
    const spanLength = dist(from, to)

    runLength += spanLength
    rails.push([from, to])
    posts.push({ ...from })

    const spanBays = Math.max(1, Math.ceil(spanLength / postSpacing))
    bays += spanBays

    // Intermediate posts only — the two ends are already covered by vertices.
    for (let i = 1; i < spanBays; i++) {
      posts.push(lerp(from, to, i / spanBays))
    }

    const baySpan = spanLength / spanBays
    const clear = Math.max(0, baySpan - postWidth)
    const perBay = picketsInBay(clear, picketWidth, maxGap)
    const gap = perBay > 0 ? (clear - perBay * picketWidth) / (perBay + 1) : clear
    if (perBay > 0) tightestGap = Math.min(tightestGap, gap)

    for (let bay = 0; bay < spanBays; bay++) {
      const bayStart = bay * baySpan + postWidth / 2
      for (let i = 0; i < perBay; i++) {
        const offset = bayStart + (i + 1) * gap + (i + 0.5) * picketWidth
        pickets.push(lerp(from, to, offset / spanLength))
      }
    }
  }

  // An open run finishes on a post; a closed one has already placed it as the
  // opening vertex of the first span.
  if (!node.closed) posts.push({ ...spans[spans.length - 1][1] })

  return {
    runLength,
    bays,
    posts,
    pickets,
    rails,
    gap: Number.isFinite(tightestGap) ? tightestGap : 0,
    height,
    postWidth,
    picketWidth,
  }
}

/**
 * Code findings for a railing.
 *
 * Checks the gap the railing will ACTUALLY be built to, not just the setting
 * on the node — a generous `maxGap` that happens to resolve to a legal spacing
 * is fine, and a tight one that does not is not.
 */
export function railingIssues(node, rules = getRules()) {
  const { gap, runLength } = layoutRailing(node)
  if (runLength <= 0) return []

  return checkGuard(
    { height: node.height ?? RAILING_DEFAULTS.height, maxGap: node.maxGap, actualGap: gap },
    rules,
  )
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
