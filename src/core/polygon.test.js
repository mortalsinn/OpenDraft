import { describe, it, expect } from 'vitest'
import {
  polygonArea,
  polygonAreaSquareFeet,
  polygonPerimeter,
  polygonCentroid,
  pointInPolygon,
  isCounterClockwise,
  polygonBounds,
} from './polygon.js'

const p = (x, y) => ({ x, y, z: 0 })

/** A 10' x 12' rectangle, counter-clockwise. */
const deck = [p(0, 0), p(144, 0), p(144, 120), p(0, 120)]
/** An L-shape, to catch anything that only works on convex rings. */
const lShape = [p(0, 0), p(120, 0), p(120, 60), p(60, 60), p(60, 120), p(0, 120)]

describe('polygonArea', () => {
  it('measures a rectangle', () => {
    expect(polygonArea(deck)).toBe(144 * 120)
  })

  it('converts to square feet, which is how decking is bought', () => {
    expect(polygonAreaSquareFeet(deck)).toBe(120) // 12' x 10'
  })

  it('measures a concave ring correctly', () => {
    // Full 120x120 square minus the 60x60 bite out of the corner.
    expect(polygonArea(lShape)).toBe(120 * 120 - 60 * 60)
  })

  it('is unaffected by winding direction', () => {
    expect(polygonArea([...deck].reverse())).toBe(polygonArea(deck))
  })

  it('is zero for a degenerate ring', () => {
    expect(polygonArea([p(0, 0), p(10, 0)])).toBe(0)
    expect(polygonArea([])).toBe(0)
  })
})

describe('isCounterClockwise', () => {
  it('reports winding, which extrusion needs', () => {
    expect(isCounterClockwise(deck)).toBe(true)
    expect(isCounterClockwise([...deck].reverse())).toBe(false)
  })
})

describe('polygonPerimeter', () => {
  it('closes the ring', () => {
    expect(polygonPerimeter(deck)).toBe(2 * 144 + 2 * 120)
  })
})

describe('polygonCentroid', () => {
  it('lands in the middle of a rectangle', () => {
    expect(polygonCentroid(deck)).toMatchObject({ x: 72, y: 60 })
  })
})

describe('pointInPolygon', () => {
  it('finds points inside and outside', () => {
    expect(pointInPolygon(p(72, 60), deck)).toBe(true)
    expect(pointInPolygon(p(-5, 60), deck)).toBe(false)
    expect(pointInPolygon(p(200, 60), deck)).toBe(false)
  })

  it('handles the concave notch', () => {
    // Inside the bounding box but outside the L itself.
    expect(pointInPolygon(p(90, 90), lShape)).toBe(false)
    expect(pointInPolygon(p(30, 90), lShape)).toBe(true)
    expect(pointInPolygon(p(90, 30), lShape)).toBe(true)
  })

  it('is false for a degenerate ring', () => {
    expect(pointInPolygon(p(0, 0), [p(0, 0), p(1, 1)])).toBe(false)
  })
})

describe('polygonBounds', () => {
  it('brackets the ring', () => {
    expect(polygonBounds(deck)).toMatchObject({ minX: 0, minY: 0, maxX: 144, maxY: 120, width: 144, depth: 120 })
  })
})
