/**
 * Hatching.
 *
 * Hatch is generated as line segments CLIPPED to the region, not painted as a
 * texture. That matters for a drafting tool: the hatch has to survive being
 * exported to a vector PDF at any scale, and a raster fill would go soft the
 * moment anyone zoomed or printed at a different size.
 *
 * Patterns are defined as one or more families of parallel lines, each with an
 * angle and a spacing — which is exactly how hatch patterns are defined in
 * every CAD format, so importing real ones later is a small job rather than a
 * rewrite.
 */

const EPSILON = 1e-9

/**
 * The library. `spacing` is in inches AT FULL SIZE — hatch scales with the
 * drawing, so a brick pattern reads as bricks whatever the sheet scale.
 */
export const HATCH_PATTERNS = {
  none: { id: 'none', name: 'None', families: [] },

  diagonal: {
    id: 'diagonal',
    name: 'Diagonal',
    families: [{ angle: Math.PI / 4, spacing: 6 }],
  },

  cross: {
    id: 'cross',
    name: 'Crosshatch',
    families: [
      { angle: Math.PI / 4, spacing: 6 },
      { angle: -Math.PI / 4, spacing: 6 },
    ],
  },

  /** Close-spaced diagonals, the usual convention for cut timber. */
  timber: {
    id: 'timber',
    name: 'Timber',
    families: [{ angle: Math.PI / 3, spacing: 2 }],
  },

  /** Widely spaced crosshatch with an offset, reading as aggregate. */
  concrete: {
    id: 'concrete',
    name: 'Concrete',
    families: [
      { angle: Math.PI / 4, spacing: 12 },
      { angle: -Math.PI / 4, spacing: 12, offset: 6 },
    ],
  },

  /** Running bond: horizontal courses plus staggered perpends. */
  brick: {
    id: 'brick',
    name: 'Brick',
    families: [
      { angle: 0, spacing: 2.67 }, // course height
      { angle: Math.PI / 2, spacing: 8 }, // perpends
    ],
  },

  /** Horizontal only — decking, siding, boarding. */
  boards: {
    id: 'boards',
    name: 'Boards',
    families: [{ angle: 0, spacing: 5.5 }],
  },
}

export const HATCH_LIST = Object.values(HATCH_PATTERNS)

function bounds(points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Where an infinite line crosses a closed ring, as distances along the line.
 *
 * Sorted, so consecutive pairs bracket the spans that lie INSIDE. That is the
 * even-odd rule, and it handles a concave region — an L-shaped deck, a notch —
 * without any special casing.
 */
function crossings(ring, origin, direction) {
  const hits = []

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]

    const edge = { x: b.x - a.x, y: b.y - a.y }
    const denominator = direction.x * edge.y - direction.y * edge.x
    if (Math.abs(denominator) < EPSILON) continue // parallel to this edge

    const offset = { x: a.x - origin.x, y: a.y - origin.y }
    const alongLine = (offset.x * edge.y - offset.y * edge.x) / denominator
    const alongEdge = (offset.x * direction.y - offset.y * direction.x) / denominator

    // Half-open along the edge, so a vertex is not counted twice by the two
    // edges that share it — which would flip inside/outside and stripe wrongly.
    if (alongEdge >= 0 && alongEdge < 1) hits.push(alongLine)
  }

  return hits.sort((a, b) => a - b)
}

/**
 * Hatch segments filling a region.
 *
 * @param {object[]} ring     Closed polygon, in world space.
 * @param {string}   patternId
 * @param {{scale?: number, angleOffset?: number}} [options]
 * @returns {[{x,y},{x,y}][]} segment endpoint pairs
 */
export function hatchRegion(ring, patternId, options = {}) {
  const pattern = HATCH_PATTERNS[patternId]
  if (!pattern || !pattern.families.length || !ring || ring.length < 3) return []

  const { scale = 1, angleOffset = 0 } = options
  const box = bounds(ring)
  const width = box.maxX - box.minX
  const height = box.maxY - box.minY
  if (width <= 0 || height <= 0) return []

  // Long enough to cross the region from any angle.
  const reach = Math.hypot(width, height)
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }

  const segments = []

  for (const family of pattern.families) {
    const angle = family.angle + angleOffset
    const spacing = Math.max(0.05, family.spacing * scale)

    const direction = { x: Math.cos(angle), y: Math.sin(angle) }
    // Step perpendicular to the family's direction.
    const step = { x: -direction.y, y: direction.x }

    const lines = Math.ceil(reach / spacing) + 1
    const start = -Math.floor(lines / 2)

    for (let i = start; i <= start + lines; i++) {
      const distance = i * spacing + (family.offset ?? 0) * scale
      const origin = { x: centre.x + step.x * distance, y: centre.y + step.y * distance }

      const hits = crossings(ring, origin, direction)

      // Consecutive pairs are the inside spans.
      for (let h = 0; h + 1 < hits.length; h += 2) {
        const from = hits[h]
        const to = hits[h + 1]
        if (to - from < EPSILON) continue

        segments.push([
          { x: origin.x + direction.x * from, y: origin.y + direction.y * from, z: 0 },
          { x: origin.x + direction.x * to, y: origin.y + direction.y * to, z: 0 },
        ])
      }
    }
  }

  return segments
}

/**
 * Line weights, in inches of ink on the paper.
 *
 * The ISO set. Lineweight is what separates a drawing that reads at a glance
 * from a flat wireframe: cut edges heavy, visible edges medium, hidden and
 * annotation light.
 */
export const LINEWEIGHTS = [
  { id: 'thin', label: 'Thin', inches: 0.007 },
  { id: 'medium', label: 'Medium', inches: 0.014 },
  { id: 'thick', label: 'Thick', inches: 0.028 },
  { id: 'extra', label: 'Extra thick', inches: 0.055 },
]

export const LINETYPES = {
  solid: { id: 'solid', label: 'Solid', dashes: null },
  dashed: { id: 'dashed', label: 'Dashed', dashes: [12, 6] },
  hidden: { id: 'hidden', label: 'Hidden', dashes: [6, 3] },
  centre: { id: 'centre', label: 'Centre', dashes: [24, 4, 4, 4] },
  phantom: { id: 'phantom', label: 'Phantom', dashes: [36, 4, 8, 4, 8, 4] },
}

export const LINETYPE_LIST = Object.values(LINETYPES)

/** Ink width in inches for a lineweight id. */
export function lineweightInches(id) {
  return (LINEWEIGHTS.find((weight) => weight.id === id) ?? LINEWEIGHTS[1]).inches
}
