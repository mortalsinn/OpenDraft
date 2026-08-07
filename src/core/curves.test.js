import { describe, it, expect } from 'vitest'
import {
  segmentsForArc,
  chordTolerance,
  pointOnCircle,
  angleOf,
  arcSweep,
  arcPoints,
  circlePoints,
  circleCircumference,
  arcLength,
  circleArea,
  quadrantPoints,
  nearestPointOnCircle,
  angleWithinArc,
  arcThroughPoints,
  TAU,
} from './curves.js'
import { polygonArea } from './polygon.js'

const p = (x, y, z = 0) => ({ x, y, z })

describe('tessellation density', () => {
  it('uses more chords for a bigger radius', () => {
    // A big arc tessellated as coarsely as a small one visibly becomes a
    // polygon.
    expect(segmentsForArc(200)).toBeGreaterThan(segmentsForArc(10))
  })

  it('keeps every chord within the tolerance it guarantees', () => {
    // Absolute below, relative above — demanding 1/50" on a forty-foot radius
    // would buy precision nobody can use at the cost of hundreds of chords.
    for (const radius of [1, 6, 24, 100, 480, 1200]) {
      const count = segmentsForArc(radius)
      const sagitta = radius * (1 - Math.cos(TAU / count / 2))
      expect(sagitta).toBeLessThanOrEqual(chordTolerance(radius) + 1e-9)
    }
  })

  it('stays proportionally accurate however large the radius', () => {
    for (const radius of [24, 480, 1200, 5000]) {
      const count = segmentsForArc(radius)
      const sagitta = radius * (1 - Math.cos(TAU / count / 2))
      expect(sagitta / radius).toBeLessThan(0.001)
    }
  })

  it('stays within sane bounds', () => {
    expect(segmentsForArc(0.001)).toBeGreaterThanOrEqual(12)
    expect(segmentsForArc(100000)).toBeLessThanOrEqual(256)
    expect(segmentsForArc(0)).toBeGreaterThanOrEqual(12)
  })

  it('uses fewer chords for a partial sweep than a full circle', () => {
    expect(segmentsForArc(100, Math.PI / 2)).toBeLessThan(segmentsForArc(100, TAU))
  })
})

describe('exact measurements', () => {
  it('reads circumference and area from the radius, not the chords', () => {
    // The tessellated polygon is always slightly smaller. Quoting from it
    // would put a short number on the shop drawing.
    const radius = 24
    expect(circleCircumference(radius)).toBeCloseTo(TAU * 24, 12)
    expect(circleArea(radius)).toBeCloseTo(Math.PI * 576, 12)

    const tessellatedArea = polygonArea(circlePoints(p(0, 0), radius))
    expect(tessellatedArea).toBeLessThan(circleArea(radius))
  })

  it('measures arc length from the sweep', () => {
    expect(arcLength(10, 0, Math.PI)).toBeCloseTo(10 * Math.PI, 12)
    expect(arcLength(10, 0, Math.PI / 2)).toBeCloseTo(10 * Math.PI / 2, 12)
  })

  it('treats a zero-difference sweep as the whole way round', () => {
    // A full circle is stored as an arc whose ends coincide.
    expect(arcSweep(0, 0)).toBeCloseTo(TAU, 12)
    expect(arcSweep(1, 1 + TAU)).toBeCloseTo(TAU, 12)
  })

  it('refuses a negative radius rather than returning nonsense', () => {
    expect(circleArea(-5)).toBe(0)
    expect(circleCircumference(-5)).toBe(0)
    expect(circlePoints(p(0, 0), -5)).toEqual([])
  })
})

describe('arcPoints', () => {
  it('starts and ends exactly on the given angles', () => {
    const points = arcPoints(p(10, 20), 50, 0, Math.PI / 2)
    expect(points[0]).toMatchObject({ x: 60, y: 20 })

    const last = points[points.length - 1]
    expect(last.x).toBeCloseTo(10, 9)
    expect(last.y).toBeCloseTo(70, 9)
  })

  it('puts every point on the radius', () => {
    for (const point of arcPoints(p(5, 5), 30, 0.4, 2.1)) {
      expect(Math.hypot(point.x - 5, point.y - 5)).toBeCloseTo(30, 9)
    }
  })
})

describe('quadrantPoints', () => {
  it('returns east, north, west and south', () => {
    const [east, north, west, south] = quadrantPoints(p(0, 0), 10)
    expect(east).toMatchObject({ x: 10 })
    expect(north.y).toBeCloseTo(10, 9)
    expect(west.x).toBeCloseTo(-10, 9)
    expect(south.y).toBeCloseTo(-10, 9)
  })
})

describe('nearestPointOnCircle', () => {
  it('projects outward and inward alike', () => {
    expect(nearestPointOnCircle(p(100, 0), p(0, 0), 10)).toMatchObject({ x: 10, y: 0 })
    expect(nearestPointOnCircle(p(2, 0), p(0, 0), 10)).toMatchObject({ x: 10, y: 0 })
  })

  it('is undefined at the exact centre, where every direction ties', () => {
    expect(nearestPointOnCircle(p(0, 0), p(0, 0), 10)).toBeNull()
  })
})

describe('angleWithinArc', () => {
  it('knows what is inside the sweep', () => {
    expect(angleWithinArc(Math.PI / 4, 0, Math.PI / 2)).toBe(true)
    expect(angleWithinArc(Math.PI, 0, Math.PI / 2)).toBe(false)
  })

  it('handles a sweep that crosses zero', () => {
    // From 315° round to 45°.
    const start = (7 * Math.PI) / 4
    const end = Math.PI / 4
    expect(angleWithinArc(0, start, end)).toBe(true)
    expect(angleWithinArc(Math.PI, start, end)).toBe(false)
  })
})

describe('arcThroughPoints', () => {
  it('fits an arc to three points on a known circle', () => {
    const centre = p(10, 20)
    const radius = 50
    const a = pointOnCircle(centre, radius, 0)
    const b = pointOnCircle(centre, radius, 1)
    const c = pointOnCircle(centre, radius, 2)

    const fitted = arcThroughPoints(a, b, c)
    expect(fitted.centre.x).toBeCloseTo(10, 8)
    expect(fitted.centre.y).toBeCloseTo(20, 8)
    expect(fitted.radius).toBeCloseTo(50, 8)
  })

  it('returns null for collinear points, because no such arc exists', () => {
    expect(arcThroughPoints(p(0, 0), p(10, 0), p(20, 0))).toBeNull()
  })
})

describe('angleOf', () => {
  it('normalises into [0, 2π)', () => {
    expect(angleOf(p(0, 0), p(1, 0))).toBeCloseTo(0, 12)
    expect(angleOf(p(0, 0), p(0, 1))).toBeCloseTo(Math.PI / 2, 12)
    expect(angleOf(p(0, 0), p(0, -1))).toBeCloseTo((3 * Math.PI) / 2, 12)
  })
})
