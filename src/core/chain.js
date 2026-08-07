/**
 * Walking connected edges into a single ordered path.
 *
 * You draw a deck perimeter as four chained lines. Treating those as four
 * independent railing runs puts a post at each end of each line, which
 * double-counts every corner — four extra posts on a rectangle, and a quote
 * that is wrong in the customer's favour or yours depending on the shape.
 *
 * So promoting one edge absorbs the whole chain it belongs to, and the result
 * is one run whose corners are single shared posts.
 */

/**
 * Quantise a point into a map key.
 *
 * Committed geometry is already snapped to 1/16", so a tolerance of 1/1000"
 * is far below anything the app can produce and far above float noise from
 * the projection maths.
 */
export function pointKey(p) {
  const q = (v) => Math.round((v ?? 0) * 1000)
  return `${q(p.x)},${q(p.y)},${q(p.z)}`
}

function samePoint(a, b) {
  return pointKey(a) === pointKey(b)
}

/**
 * Follow the run of edges connected to `startId`.
 *
 * Walks outward from both ends. Stops at a vertex where three or more edges
 * meet: a junction is genuinely ambiguous — a T where a railing meets a wall
 * should not silently swallow the wall — so the user gets the unambiguous part
 * and can promote the rest deliberately.
 *
 * @param {object[]} edges  Nodes with `start` and `end` and an `id`.
 * @param {string}   startId
 * @returns {{points: object[], edgeIds: string[], closed: boolean}}
 */
export function buildChain(edges, startId) {
  const byId = new Map(edges.map((edge) => [edge.id, edge]))
  const seed = byId.get(startId)
  if (!seed) return { points: [], edgeIds: [], closed: false }

  // vertex key -> edges touching it
  const incident = new Map()
  for (const edge of edges) {
    for (const point of [edge.start, edge.end]) {
      const key = pointKey(point)
      if (!incident.has(key)) incident.set(key, [])
      incident.get(key).push(edge)
    }
  }

  const usedEdges = new Set([seed.id])

  /**
   * Step outward from `vertex`, having arrived along `cameFrom`, collecting
   * vertices until the path ends, forks, or closes.
   */
  const walk = (vertex, cameFrom) => {
    const path = []
    let current = vertex
    let previousEdge = cameFrom

    for (;;) {
      const touching = incident.get(pointKey(current)) ?? []
      // Exactly two edges means an unambiguous continuation.
      if (touching.length !== 2) break

      const next = touching.find((edge) => edge.id !== previousEdge.id)
      if (!next || usedEdges.has(next.id)) break

      usedEdges.add(next.id)
      const far = samePoint(next.start, current) ? next.end : next.start
      path.push({ point: far, edge: next })
      current = far
      previousEdge = next
    }

    return path
  }

  const forward = walk(seed.end, seed)
  const backward = walk(seed.start, seed)

  const points = [
    ...backward.map((step) => step.point).reverse(),
    seed.start,
    seed.end,
    ...forward.map((step) => step.point),
  ]

  const edgeIds = [
    ...backward.map((step) => step.edge.id).reverse(),
    seed.id,
    ...forward.map((step) => step.edge.id),
  ]

  // A closed loop comes back to where it started; drop the duplicate vertex so
  // the corner is one post rather than two stacked in the same place.
  const closed = points.length > 2 && samePoint(points[0], points[points.length - 1])
  if (closed) points.pop()

  return { points, edgeIds, closed }
}
