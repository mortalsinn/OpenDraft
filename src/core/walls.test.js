import { describe, it, expect } from 'vitest'
import {
  wallLength,
  wallFaces,
  spansWithOpenings,
  wallPlanSegments,
  pointAlong,
  wallQuantities,
  WALL_DEFAULTS,
} from './walls.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A straight 20' wall running east. */
const straight = { points: [p(0, 0), p(240, 0)], thickness: 6, height: 96 }
/** An L, to prove the corners mitre. */
const corner = { points: [p(0, 0), p(240, 0), p(240, 120)], thickness: 6, height: 96 }

const lengthOf = ([a, b]) => Math.hypot(b.x - a.x, b.y - a.y)

describe('wallLength', () => {
  it('measures a straight run and a chain', () => {
    expect(wallLength(straight.points)).toBe(240)
    expect(wallLength(corner.points)).toBe(360)
  })

  it('closes the loop when asked', () => {
    const ring = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)]
    expect(wallLength(ring, true)).toBe(400)
    expect(wallLength(ring, false)).toBe(300)
  })
})

describe('wallFaces', () => {
  it('puts the two faces half a thickness either side', () => {
    const { left, right } = wallFaces(straight)
    expect(left[0].y).toBeCloseTo(3, 9)
    expect(right[0].y).toBeCloseTo(-3, 9)
  })

  it('mitres a corner rather than leaving a notch', () => {
    // A wall corner that does not close is the first thing anyone notices.
    const { left, right } = wallFaces(corner)

    // The inner face turns at a single mitred point, not two stubs.
    expect(left).toHaveLength(3)
    expect(right).toHaveLength(3)
    expect(right[1]).toMatchObject({ x: 243, y: -3 })
  })

  it('yields nothing for a degenerate wall', () => {
    expect(wallFaces({ points: [p(0, 0)] }).left).toEqual([])
  })
})

describe('spansWithOpenings', () => {
  const line = [p(0, 0), p(240, 0)]

  it('leaves the run whole with no openings', () => {
    const spans = spansWithOpenings(line, [])
    expect(spans).toHaveLength(1)
    expect(lengthOf(spans[0])).toBeCloseTo(240, 9)
  })

  it('cuts a hole where a door goes', () => {
    const spans = spansWithOpenings(line, [{ along: 100, width: 36 }])
    expect(spans).toHaveLength(2)
    expect(lengthOf(spans[0])).toBeCloseTo(100, 9)
    expect(lengthOf(spans[1])).toBeCloseTo(104, 9)
  })

  it('positions openings ALONG the wall, so they survive it moving', () => {
    // "3'-6" from the corner" is how a builder dimensions an opening; absolute
    // coordinates stop meaning anything the moment the wall moves.
    const moved = [p(1000, 500), p(1240, 500)]
    const spans = spansWithOpenings(moved, [{ along: 100, width: 36 }])
    expect(spans[0][1].x).toBeCloseTo(1100, 9)
  })

  it('merges overlapping openings into one hole', () => {
    // Two doors sharing a jamb is one gap in the wall, not two.
    const spans = spansWithOpenings(line, [
      { along: 100, width: 36 },
      { along: 120, width: 36 },
    ])
    expect(spans).toHaveLength(2)
    expect(lengthOf(spans[1])).toBeCloseTo(240 - 156, 9)
  })

  it('cuts across a corner', () => {
    const spans = spansWithOpenings(corner.points, [{ along: 230, width: 30 }])
    const total = spans.reduce((sum, span) => sum + lengthOf(span), 0)
    expect(total).toBeCloseTo(360 - 30, 6)
  })

  it('ignores a zero-width opening', () => {
    expect(spansWithOpenings(line, [{ along: 100, width: 0 }])).toHaveLength(1)
  })
})

describe('wallPlanSegments', () => {
  it('draws both faces', () => {
    expect(wallPlanSegments(straight)).toHaveLength(2)
  })

  it('adds a jamb at each side of an opening, so the hole has sides', () => {
    // Without jambs the wall reads as two lines that simply stop.
    const withDoor = { ...straight, openings: [{ along: 100, width: 36 }] }
    const segments = wallPlanSegments(withDoor)

    // Two faces cut in two, plus two jambs.
    expect(segments).toHaveLength(6)

    // Each jamb spans the full thickness.
    const jambs = segments.filter((segment) => Math.abs(lengthOf(segment) - 6) < 1e-6)
    expect(jambs).toHaveLength(2)
  })

  it('sets jambs square across the wall, not skewed', () => {
    // Walking the same distance along each offset face lands at different
    // points — the outer face is longer round every corner — and the jamb
    // comes out as a diagonal. It has to come off the centreline.
    const withDoor = { ...straight, openings: [{ along: 100, width: 36 }] }
    const jambs = wallPlanSegments(withDoor).filter(
      (segment) => Math.abs(lengthOf(segment) - 6) < 1e-6,
    )

    expect(jambs).toHaveLength(2)
    // The wall runs east, so a square jamb runs due north-south.
    for (const [a, b] of jambs) {
      expect(a.x).toBeCloseTo(b.x, 9)
      expect(Math.abs(a.y - b.y)).toBeCloseTo(6, 9)
    }
  })

  it('keeps jambs square on a wall that has turned a corner', () => {
    const withDoor = { ...corner, openings: [{ along: 300, width: 36 }] }
    const jambs = wallPlanSegments(withDoor).filter(
      (segment) => Math.abs(lengthOf(segment) - 6) < 1e-6,
    )

    expect(jambs).toHaveLength(2)
    // Past the corner the wall runs north, so the jambs run east-west.
    for (const [a, b] of jambs) {
      expect(a.y).toBeCloseTo(b.y, 9)
      expect(Math.abs(a.x - b.x)).toBeCloseTo(6, 9)
    }
  })

  it('ignores an opening positioned off the end of the wall', () => {
    const segments = wallPlanSegments({ ...straight, openings: [{ along: 900, width: 36 }] })
    expect(segments).toHaveLength(2)
  })
})

describe('pointAlong', () => {
  it('walks the polyline by distance', () => {
    expect(pointAlong(straight.points, 60)).toMatchObject({ x: 60, y: 0 })
    expect(pointAlong(corner.points, 300)).toMatchObject({ x: 240, y: 60 })
  })

  it('clamps past the end rather than returning nothing', () => {
    expect(pointAlong(straight.points, 9999)).toMatchObject({ x: 240 })
  })
})

describe('wallQuantities', () => {
  it('quotes area NET of openings', () => {
    // Nobody frames or finishes the hole where a door goes; gross area
    // over-orders every wall with a door in it.
    const solid = wallQuantities(straight)
    const withDoor = wallQuantities({ ...straight, openings: [{ along: 100, width: 36 }] })

    const area = (lines) => lines.find((l) => l.sku === 'WALL-SF').quantity
    expect(area(solid)).toBeCloseTo((240 * 96) / 144, 6)
    expect(area(withDoor)).toBeCloseTo(((240 - 36) * 96) / 144, 6)
  })

  it('quotes plates on the GROSS length, because they run past the opening', () => {
    const withDoor = wallQuantities({ ...straight, openings: [{ along: 100, width: 36 }] })
    expect(withDoor.find((l) => l.sku === 'PLATE').quantity).toBeCloseTo(480, 6)
  })

  it('counts a header per opening', () => {
    const two = wallQuantities({
      ...straight,
      openings: [{ along: 40, width: 36 }, { along: 140, width: 48 }],
    })
    expect(two.find((l) => l.sku === 'HEADER').quantity).toBe(2)
  })

  it('quotes nothing for a degenerate wall', () => {
    expect(wallQuantities({ points: [p(0, 0)] })).toEqual([])
  })

  it('falls back to sensible defaults', () => {
    const bare = wallQuantities({ points: [p(0, 0), p(120, 0)] })
    expect(bare.find((l) => l.sku === 'WALL-SF').quantity).toBeCloseTo(
      (120 * WALL_DEFAULTS.height) / 144,
      6,
    )
  })
})
