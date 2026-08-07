import { describe, it, expect } from 'vitest'
import {
  rectanglePoints,
  rectangleFromCentre,
  regularPolygonPoints,
  acrossFlats,
  parsePair,
} from './shapes.js'
import { parseLength } from './units.js'
import { polygonArea, isCounterClockwise } from './polygon.js'

const p = (x, y, z = 0) => ({ x, y, z })

describe('rectanglePoints', () => {
  it('builds a ring from two corners', () => {
    const ring = rectanglePoints(p(0, 0), p(120, 96))
    expect(ring).toHaveLength(4)
    expect(polygonArea(ring)).toBe(120 * 96)
  })

  it('does not care which corner came first', () => {
    // Dragging up-left is as valid as down-right.
    const a = rectanglePoints(p(0, 0), p(120, 96))
    const b = rectanglePoints(p(120, 96), p(0, 0))
    const c = rectanglePoints(p(120, 0), p(0, 96))
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it('winds counter-clockwise, which extrusion depends on', () => {
    expect(isCounterClockwise(rectanglePoints(p(0, 0), p(120, 96)))).toBe(true)
  })

  it('refuses a degenerate rectangle', () => {
    expect(rectanglePoints(p(0, 0), p(0, 96))).toEqual([])
    expect(rectanglePoints(p(0, 0), p(120, 0))).toEqual([])
  })
})

describe('rectangleFromCentre', () => {
  it('centres the ring on the given point', () => {
    const ring = rectangleFromCentre(p(100, 100), p(160, 150))
    expect(polygonArea(ring)).toBe(120 * 100)
    const xs = ring.map((r) => r.x)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(100)
  })
})

describe('regularPolygonPoints', () => {
  it('produces the requested number of corners', () => {
    expect(regularPolygonPoints(p(0, 0), 50, 6)).toHaveLength(6)
    expect(regularPolygonPoints(p(0, 0), 50, 3)).toHaveLength(3)
  })

  it('puts every vertex on the radius when inscribed', () => {
    for (const vertex of regularPolygonPoints(p(10, 20), 50, 8)) {
      expect(Math.hypot(vertex.x - 10, vertex.y - 20)).toBeCloseTo(50, 9)
    }
  })

  it('puts the FLATS on the radius when circumscribed', () => {
    // A hexagonal newel is specified across the flats, not the points, so
    // getting this backwards makes stock that does not fit.
    const ring = regularPolygonPoints(p(0, 0), 50, 6, { throughVertex: false })
    const midpoint = {
      x: (ring[0].x + ring[1].x) / 2,
      y: (ring[0].y + ring[1].y) / 2,
    }
    expect(Math.hypot(midpoint.x, midpoint.y)).toBeCloseTo(50, 9)
  })

  it('approaches the circle area as sides increase', () => {
    const area = (sides) => polygonArea(regularPolygonPoints(p(0, 0), 50, sides))
    const circle = Math.PI * 50 * 50

    // An inscribed polygon is always inside the circle, and converges upward.
    expect(area(6)).toBeLessThan(circle)
    expect(area(64)).toBeLessThan(circle)
    expect(area(64)).toBeGreaterThan(area(6))

    // Within 0.5% by 64 sides — measured relatively, since an absolute
    // tolerance means something different at every radius.
    expect((circle - area(64)) / circle).toBeLessThan(0.005)
  })

  it('clamps to a triangle and refuses a zero radius', () => {
    expect(regularPolygonPoints(p(0, 0), 50, 2)).toHaveLength(3)
    expect(regularPolygonPoints(p(0, 0), 0, 6)).toEqual([])
  })

  it('winds counter-clockwise', () => {
    expect(isCounterClockwise(regularPolygonPoints(p(0, 0), 50, 5))).toBe(true)
  })
})

describe('acrossFlats', () => {
  it('matches the circumscribed construction', () => {
    expect(acrossFlats(50, 6)).toBeCloseTo(2 * 50 * Math.cos(Math.PI / 6), 9)
  })
})

describe('parsePair', () => {
  it('reads a size pair the way a drafter types it', () => {
    expect(parsePair('120,96', parseLength)).toEqual({ x: 120, y: 96 })
    expect(parsePair("10',8'", parseLength)).toEqual({ x: 120, y: 96 })
    expect(parsePair(`10' 6", 8'`, parseLength)).toEqual({ x: 126, y: 96 })
  })

  it('refuses a half-parsed pair rather than defaulting one side', () => {
    // A shape with one dimension silently defaulted is worse than no shape.
    expect(parsePair('120,', parseLength)).toBeNull()
    expect(parsePair('120,abc', parseLength)).toBeNull()
    expect(parsePair('120', parseLength)).toBeNull()
  })
})
