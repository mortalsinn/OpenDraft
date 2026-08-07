/**
 * Blocks — the standard symbol library.
 *
 * A block differs from a component, and the distinction is worth being clear
 * about because they look similar:
 *
 *   A COMPONENT is geometry you drew and want copies of. The definition holds
 *   frozen geometry; editing it updates every instance.
 *
 *   A BLOCK is a catalogue item with PARAMETERS. Its geometry is generated from
 *   its attributes, so a 36" door and a 32" door are the same block at
 *   different widths rather than two definitions.
 *
 * Attributes are the point. A door that knows its width and handing can be
 * scheduled and counted; a door that is just lines on a page cannot.
 */

import { arcPoints, TAU } from './curves.js'

const p = (x, y) => ({ x, y, z: 0 })

/** Straight run of segments through a list of points. */
function path(points, closed = false) {
  const segments = []
  const last = closed ? points.length : points.length - 1
  for (let i = 0; i < last; i++) {
    segments.push([points[i], points[(i + 1) % points.length]])
  }
  return segments
}

/** Segments approximating an arc — blocks draw in plain lines. */
function arcSegments(centre, radius, startAngle, endAngle) {
  return path(arcPoints(centre, radius, startAngle, endAngle))
}

/**
 * The library.
 *
 * `build` returns segments in LOCAL space, with the insertion point at the
 * origin — so a door hangs off the point you clicked, not off its own corner.
 */
export const BLOCKS = {
  door: {
    id: 'door',
    name: 'Door',
    attributes: [
      { tag: 'WIDTH', label: 'Width', value: 36, type: 'length' },
      { tag: 'HANDING', label: 'Handing', value: 'LH', type: 'choice', options: ['LH', 'RH'] },
    ],
    build: ({ WIDTH = 36, HANDING = 'LH' }) => {
      const width = Math.max(1, WIDTH)
      const sign = HANDING === 'RH' ? -1 : 1

      return [
        // The leaf, standing open at 90°.
        ...path([p(0, 0), p(0, sign * width)]),
        // The swing.
        ...arcSegments(p(0, 0), width, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0),
        // The opening itself.
        ...path([p(0, 0), p(width, 0)]),
      ]
    },
    quantities: ({ WIDTH = 36 }) => [
      { sku: `DOOR-${Math.round(WIDTH)}`, description: `Door ${Math.round(WIDTH)}"`, unit: 'ea', quantity: 1 },
    ],
  },

  window: {
    id: 'window',
    name: 'Window',
    attributes: [
      { tag: 'WIDTH', label: 'Width', value: 48, type: 'length' },
      { tag: 'WALL', label: 'Wall thickness', value: 6, type: 'length' },
    ],
    build: ({ WIDTH = 48, WALL = 6 }) => {
      const width = Math.max(1, WIDTH)
      const wall = Math.max(1, WALL)
      return [
        ...path([p(0, 0), p(width, 0), p(width, wall), p(0, wall)], true),
        // Glazing line down the middle of the jamb.
        ...path([p(0, wall / 2), p(width, wall / 2)]),
      ]
    },
    quantities: ({ WIDTH = 48 }) => [
      { sku: `WIN-${Math.round(WIDTH)}`, description: `Window ${Math.round(WIDTH)}"`, unit: 'ea', quantity: 1 },
    ],
  },

  newel: {
    id: 'newel',
    name: 'Newel post',
    attributes: [
      { tag: 'SIZE', label: 'Size', value: 3.5, type: 'length' },
      { tag: 'STYLE', label: 'Style', value: 'square', type: 'choice', options: ['square', 'turned'] },
    ],
    build: ({ SIZE = 3.5, STYLE = 'square' }) => {
      const half = Math.max(0.5, SIZE) / 2

      if (STYLE === 'turned') {
        return arcSegments(p(0, 0), half, 0, TAU)
      }
      return path([p(-half, -half), p(half, -half), p(half, half), p(-half, half)], true)
    },
    quantities: ({ SIZE = 3.5, STYLE = 'square' }) => [
      {
        sku: `NEWEL-${STYLE.toUpperCase()}-${SIZE}`,
        description: `Newel post — ${STYLE} ${SIZE}"`,
        unit: 'ea',
        quantity: 1,
      },
    ],
  },

  column: {
    id: 'column',
    name: 'Column',
    attributes: [{ tag: 'DIAMETER', label: 'Diameter', value: 12, type: 'length' }],
    build: ({ DIAMETER = 12 }) => arcSegments(p(0, 0), Math.max(1, DIAMETER) / 2, 0, TAU),
    quantities: ({ DIAMETER = 12 }) => [
      { sku: `COL-${Math.round(DIAMETER)}`, description: `Column ${Math.round(DIAMETER)}" dia`, unit: 'ea', quantity: 1 },
    ],
  },

  northArrow: {
    id: 'northArrow',
    name: 'North arrow',
    attributes: [{ tag: 'SIZE', label: 'Size', value: 24, type: 'length' }],
    build: ({ SIZE = 24 }) => {
      const size = Math.max(4, SIZE)
      const half = size / 6
      return [
        ...path([p(0, 0), p(-half, -size / 3), p(0, size / 2), p(half, -size / 3)], true),
        ...arcSegments(p(0, 0), size / 2, 0, TAU),
      ]
    },
    // A drawing symbol, not a thing anyone buys.
    quantities: () => [],
  },
}

export const BLOCK_LIST = Object.values(BLOCKS)

/** Attribute values for a fresh insertion. */
export function defaultAttributes(blockId) {
  const block = BLOCKS[blockId]
  if (!block) return {}

  const values = {}
  for (const attribute of block.attributes) values[attribute.tag] = attribute.value
  return values
}

/**
 * A block instance's geometry in WORLD space.
 *
 * Generated from the attributes every time rather than stored, which is what
 * makes changing a door's width actually change the door.
 */
export function blockSegments(node) {
  const block = BLOCKS[node.blockId]
  if (!block) return []

  const scale = node.scale ?? 1
  const rotation = node.rotation ?? 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const origin = node.position ?? p(0, 0)

  const place = (point) => ({
    x: origin.x + (point.x * cos - point.y * sin) * scale,
    y: origin.y + (point.x * sin + point.y * cos) * scale,
    z: origin.z ?? 0,
  })

  return block.build(node.attributes ?? defaultAttributes(node.blockId)).map(([a, b]) => [
    place(a),
    place(b),
  ])
}

/** Takeoff lines for a placed block. */
export function blockQuantities(node) {
  const block = BLOCKS[node.blockId]
  if (!block) return []
  return block.quantities(node.attributes ?? defaultAttributes(node.blockId))
}
