import { describe, it, expect } from 'vitest'
import {
  HATCH_PATTERNS,
  HATCH_LIST,
  hatchRegion,
  LINEWEIGHTS,
  LINETYPES,
  lineweightInches,
} from './hatch.js'
import { pointInPolygon, polygonArea } from './polygon.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A 100 x 100 square. */
const square = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)]
/** An L, to prove the clipping copes with a concave region. */
const lShape = [p(0, 0), p(100, 0), p(100, 40), p(40, 40), p(40, 100), p(0, 100)]

/** Midpoint of a segment. */
const mid = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

describe('the pattern library', () => {
  it('gives every pattern an id matching its key and a name', () => {
    for (const [key, pattern] of Object.entries(HATCH_PATTERNS)) {
      expect(pattern.id).toBe(key)
      expect(pattern.name).toBeTruthy()
      expect(Array.isArray(pattern.families)).toBe(true)
    }
  })

  it('defines patterns as families of parallel lines, as CAD formats do', () => {
    // Keeping this shape means importing real hatch patterns later is a small
    // job rather than a rewrite.
    for (const pattern of HATCH_LIST) {
      for (const family of pattern.families) {
        expect(typeof family.angle).toBe('number')
        expect(family.spacing).toBeGreaterThan(0)
      }
    }
  })
})

describe('hatchRegion', () => {
  it('fills a simple region', () => {
    const segments = hatchRegion(square, 'diagonal')
    expect(segments.length).toBeGreaterThan(5)
  })

  it('keeps every segment inside the region', () => {
    // The whole job of the clip. A segment escaping the outline is the defect
    // you notice only after it is printed.
    for (const segment of hatchRegion(square, 'cross')) {
      expect(pointInPolygon(mid(segment), square)).toBe(true)
    }
  })

  it('stays out of the notch in a concave region', () => {
    // An L-shaped deck must not be hatched across the bite taken out of it.
    const segments = hatchRegion(lShape, 'diagonal')
    expect(segments.length).toBeGreaterThan(3)

    for (const segment of segments) {
      expect(pointInPolygon(mid(segment), lShape)).toBe(true)
    }
  })

  it('draws two families for a crosshatch and one for a diagonal', () => {
    const single = hatchRegion(square, 'diagonal').length
    const double = hatchRegion(square, 'cross').length
    expect(double).toBeGreaterThan(single)
  })

  it('scales with the drawing', () => {
    // Closer spacing means more lines; a brick pattern must read as bricks at
    // whatever size it is drawn.
    const tight = hatchRegion(square, 'diagonal', { scale: 0.5 }).length
    const loose = hatchRegion(square, 'diagonal', { scale: 2 }).length
    expect(tight).toBeGreaterThan(loose)
  })

  it('rotates with an angle offset', () => {
    const straight = hatchRegion(square, 'boards')
    const turned = hatchRegion(square, 'boards', { angleOffset: Math.PI / 2 })

    // Boards run horizontally; rotated a quarter turn they run vertically.
    expect(Math.abs(straight[0][0].y - straight[0][1].y)).toBeLessThan(1e-6)
    expect(Math.abs(turned[0][0].x - turned[0][1].x)).toBeLessThan(1e-6)
  })

  it('produces nothing for the none pattern', () => {
    expect(hatchRegion(square, 'none')).toEqual([])
  })

  it('produces nothing for an unknown pattern, rather than throwing', () => {
    expect(hatchRegion(square, 'nonsense')).toEqual([])
  })

  it('produces nothing for a degenerate region', () => {
    expect(hatchRegion([p(0, 0), p(10, 0)], 'diagonal')).toEqual([])
    expect(hatchRegion([], 'diagonal')).toEqual([])
  })

  it('covers roughly in proportion to the area', () => {
    // A rough sanity check that the fill is not sparse at one end.
    const total = (ring) =>
      hatchRegion(ring, 'diagonal').reduce(
        (sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y),
        0,
      )

    const ratio = total(lShape) / total(square)
    const areaRatio = polygonArea(lShape) / polygonArea(square)
    expect(ratio).toBeGreaterThan(areaRatio * 0.7)
    expect(ratio).toBeLessThan(areaRatio * 1.3)
  })
})

describe('lineweights and linetypes', () => {
  it('orders lineweights from thin to thick', () => {
    for (let i = 1; i < LINEWEIGHTS.length; i++) {
      expect(LINEWEIGHTS[i].inches).toBeGreaterThan(LINEWEIGHTS[i - 1].inches)
    }
  })

  it('falls back to a medium weight for an unknown id', () => {
    expect(lineweightInches('nonsense')).toBe(LINEWEIGHTS[1].inches)
  })

  it('gives solid no dash pattern and every other type one', () => {
    expect(LINETYPES.solid.dashes).toBeNull()
    for (const [id, type] of Object.entries(LINETYPES)) {
      if (id === 'solid') continue
      expect(type.dashes.length).toBeGreaterThan(0)
      expect(type.dashes.every((d) => d > 0)).toBe(true)
    }
  })
})
