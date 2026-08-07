import { describe, it, expect } from 'vitest'
import {
  rotatePoint,
  scalePoint,
  mirrorPoint,
  offsetPolyline,
  rectangularArray,
  polarArray,
} from './transform.js'
import { polygonArea } from './polygon.js'

const p = (x, y, z = 0) => ({ x, y, z })
const near = (a, b, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}

describe('rotatePoint', () => {
  it('turns about the given centre', () => {
    near(rotatePoint(p(10, 0), p(0, 0), Math.PI / 2), p(0, 10))
    near(rotatePoint(p(10, 0), p(10, 0), Math.PI / 2), p(10, 0)) // the centre stays put
  })

  it('preserves distance from the centre', () => {
    const centre = p(3, 7)
    const turned = rotatePoint(p(20, 15), centre, 1.234)
    expect(Math.hypot(turned.x - 3, turned.y - 7)).toBeCloseTo(Math.hypot(17, 8), 9)
  })
})

describe('scalePoint', () => {
  it('scales about the centre', () => {
    near(scalePoint(p(10, 10), p(0, 0), 2), p(20, 20))
    near(scalePoint(p(10, 10), p(10, 10), 5), p(10, 10))
  })

  it('mirrors through the centre for a negative factor', () => {
    near(scalePoint(p(10, 0), p(0, 0), -1), p(-10, 0))
  })
})

describe('mirrorPoint', () => {
  it('reflects across a horizontal axis', () => {
    near(mirrorPoint(p(5, 10), p(0, 0), p(1, 0)), p(5, -10))
  })

  it('reflects across a diagonal', () => {
    near(mirrorPoint(p(10, 0), p(0, 0), p(1, 1)), p(0, 10))
  })

  it('leaves points on the axis alone', () => {
    near(mirrorPoint(p(5, 0), p(0, 0), p(1, 0)), p(5, 0))
  })

  it('is its own inverse', () => {
    const once = mirrorPoint(p(13, 27), p(2, 3), p(9, 1))
    near(mirrorPoint(once, p(2, 3), p(9, 1)), p(13, 27))
  })

  it('returns the point unchanged for a degenerate axis', () => {
    // Two identical points define no line; reflecting through a guess would be
    // worse than doing nothing.
    near(mirrorPoint(p(5, 10), p(3, 3), p(3, 3)), p(5, 10))
  })
})

describe('offsetPolyline', () => {
  const square = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)]

  it('makes a parallel line at the right distance', () => {
    const line = [p(0, 0), p(100, 0)]
    const offset = offsetPolyline(line, 10)
    expect(offset).toHaveLength(2)
    expect(offset[0].y).toBeCloseTo(10, 9)
    expect(offset[1].y).toBeCloseTo(10, 9)
  })

  it('offsets the other way for a negative distance', () => {
    expect(offsetPolyline([p(0, 0), p(100, 0)], -10)[0].y).toBeCloseTo(-10, 9)
  })

  it('mitres corners rather than leaving a gap', () => {
    // A square offset outward by 10 should be a square 20 larger each way,
    // with sharp corners — not a rounded or broken outline.
    const offset = offsetPolyline(square, -10, true)
    expect(offset).toHaveLength(4)
    expect(polygonArea(offset)).toBeCloseTo(120 * 120, 6)
  })

  it('shrinks a ring when offset inward', () => {
    const offset = offsetPolyline(square, 10, true)
    expect(polygonArea(offset)).toBeCloseTo(80 * 80, 6)
  })

  it('keeps collinear runs straight', () => {
    // Three points on one line: the middle join has no intersection to find.
    const offset = offsetPolyline([p(0, 0), p(50, 0), p(100, 0)], 10)
    for (const point of offset) expect(point.y).toBeCloseTo(10, 9)
  })

  it('cuts a very sharp corner square instead of shooting to infinity', () => {
    // A near-doubled-back path has a true mitre point enormously far away.
    const spike = [p(0, 0), p(100, 0), p(0, 1)]
    const offset = offsetPolyline(spike, 5)

    for (const point of offset) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Math.abs(point.x)).toBeLessThan(1000)
    }
  })

  it('returns a copy when the distance is zero', () => {
    const offset = offsetPolyline(square, 0, true)
    expect(offset).toEqual(square)
    expect(offset[0]).not.toBe(square[0]) // a copy, not the same objects
  })

  it('leaves a degenerate input alone', () => {
    expect(offsetPolyline([p(0, 0)], 10)).toHaveLength(1)
  })
})

describe('rectangularArray', () => {
  it('includes the original and fills the grid', () => {
    const placements = rectangularArray(3, 2, 50, 40)
    expect(placements).toHaveLength(6)
    expect(placements[0]).toMatchObject({ x: 0, y: 0 })
    expect(placements).toContainEqual({ x: 100, y: 40, z: 0 })
  })

  it('clamps to at least one of each', () => {
    expect(rectangularArray(0, 0, 10, 10)).toHaveLength(1)
  })
})

describe('polarArray', () => {
  it('spaces a full circle evenly without repeating the original', () => {
    // The first and last would land on top of each other, and you would quote
    // one too many.
    const angles = polarArray(4, Math.PI * 2)
    expect(angles).toHaveLength(4)
    expect(angles[1]).toBeCloseTo(Math.PI / 2, 9)
    expect(angles).not.toContain(Math.PI * 2)
  })

  it('spans a partial sweep end to end', () => {
    const angles = polarArray(3, Math.PI)
    expect(angles[0]).toBe(0)
    expect(angles[2]).toBeCloseTo(Math.PI, 9)
  })

  it('handles a count of one', () => {
    expect(polarArray(1, Math.PI)).toEqual([0])
  })
})
