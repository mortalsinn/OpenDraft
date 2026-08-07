import { describe, it, expect } from 'vitest'
import {
  infiniteIntersection,
  extendToMeet,
  trimAt,
  filletCorner,
  chamferCorner,
  retargetNearestEnd,
} from './edit.js'

const p = (x, y, z = 0) => ({ x, y, z })
const near = (a, b, digits = 7) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}

describe('infiniteIntersection', () => {
  it('finds a crossing beyond both segments', () => {
    // The whole point of trim and extend: the meeting place usually lies past
    // where the lines were actually drawn.
    near(infiniteIntersection(p(0, 0), p(10, 0), p(50, -10), p(50, 10)), p(50, 0))
  })

  it('returns null for parallel lines', () => {
    expect(infiniteIntersection(p(0, 0), p(10, 0), p(0, 5), p(10, 5))).toBeNull()
  })
})

describe('extendToMeet', () => {
  it('stretches the near end out to the target', () => {
    const result = extendToMeet(p(0, 0), p(10, 0), p(50, -10), p(50, 10))
    near(result.start, p(0, 0))
    near(result.end, p(50, 0))
  })

  it('moves the end that was already reaching toward the meeting point', () => {
    // Extending the far end would flip the line around.
    const result = extendToMeet(p(10, 0), p(0, 0), p(50, -10), p(50, 10))
    near(result.start, p(50, 0))
    near(result.end, p(0, 0))
  })

  it('refuses when it would shorten rather than extend', () => {
    // The crossing lies between the ends, so this is a trim, not an extend.
    expect(extendToMeet(p(0, 0), p(100, 0), p(50, -10), p(50, 10))).toBeNull()
  })

  it('returns null for parallel lines', () => {
    expect(extendToMeet(p(0, 0), p(10, 0), p(0, 5), p(10, 5))).toBeNull()
  })
})

describe('trimAt', () => {
  const cutter = [p(50, -10), p(50, 10)]

  it('keeps the piece you pointed at', () => {
    // Which side to keep is ambiguous from geometry alone, so the click
    // decides — as it does in every CAD tool.
    const keepLeft = trimAt(p(0, 0), p(100, 0), ...cutter, p(10, 0))
    near(keepLeft.start, p(0, 0))
    near(keepLeft.end, p(50, 0))

    const keepRight = trimAt(p(0, 0), p(100, 0), ...cutter, p(90, 0))
    near(keepRight.start, p(50, 0))
    near(keepRight.end, p(100, 0))
  })

  it('refuses when the cut falls outside the segment', () => {
    expect(trimAt(p(0, 0), p(20, 0), ...cutter, p(10, 0))).toBeNull()
  })

  it('refuses a cut exactly on an endpoint, where there is nothing to remove', () => {
    expect(trimAt(p(50, 0), p(100, 0), ...cutter, p(60, 0))).toBeNull()
  })
})

describe('filletCorner', () => {
  /** A clean right angle at the origin. */
  const legA = [p(100, 0), p(0, 0)]
  const legB = [p(0, 0), p(0, 100)]

  it('places tangent points at r/tan(θ/2) along each leg', () => {
    // For a 90° corner that is exactly the radius.
    const fillet = filletCorner(...legA, ...legB, 20)
    near(fillet.corner, p(0, 0))
    near(fillet.tangentA, p(20, 0))
    near(fillet.tangentB, p(0, 20))
  })

  it('puts the centre equidistant from both legs', () => {
    const fillet = filletCorner(...legA, ...legB, 20)
    near(fillet.centre, p(20, 20))
    // Distance from centre to each tangent point IS the radius.
    expect(Math.hypot(fillet.centre.x - fillet.tangentA.x, fillet.centre.y - fillet.tangentA.y))
      .toBeCloseTo(20, 7)
    expect(Math.hypot(fillet.centre.x - fillet.tangentB.x, fillet.centre.y - fillet.tangentB.y))
      .toBeCloseTo(20, 7)
  })

  it('handles an acute corner, where the tangent runs further out', () => {
    const acuteB = [p(0, 0), p(100, 100)] // 45° from leg A
    const fillet = filletCorner(...legA, ...acuteB, 20)
    // tan(22.5°) ≈ 0.4142, so the tangent distance is well over the radius.
    expect(fillet.tangentA.x).toBeCloseTo(20 / Math.tan(Math.PI / 8), 6)
  })

  it('refuses a radius too large to fit on the legs', () => {
    // A fillet that eats past the far end is not a fillet.
    expect(filletCorner(...legA, ...legB, 500)).toBeNull()
  })

  it('refuses parallel or collinear legs, which have no corner', () => {
    expect(filletCorner(p(0, 0), p(10, 0), p(0, 5), p(10, 5), 2)).toBeNull()
  })

  it('refuses a non-positive radius', () => {
    expect(filletCorner(...legA, ...legB, 0)).toBeNull()
    expect(filletCorner(...legA, ...legB, -5)).toBeNull()
  })
})

describe('chamferCorner', () => {
  const legA = [p(100, 0), p(0, 0)]
  const legB = [p(0, 0), p(0, 100)]

  it('sets back along each leg', () => {
    const chamfer = chamferCorner(...legA, ...legB, 15)
    near(chamfer.tangentA, p(15, 0))
    near(chamfer.tangentB, p(0, 15))
  })

  it('allows different setbacks, which is a real detail not a mistake', () => {
    const chamfer = chamferCorner(...legA, ...legB, 10, 30)
    near(chamfer.tangentA, p(10, 0))
    near(chamfer.tangentB, p(0, 30))
  })

  it('refuses a setback longer than the leg', () => {
    expect(chamferCorner(...legA, ...legB, 500)).toBeNull()
  })
})

describe('retargetNearestEnd', () => {
  it('moves the end closest to the reference point', () => {
    const moved = retargetNearestEnd(p(0, 0), p(100, 0), p(5, 0), p(20, 0))
    near(moved.start, p(20, 0))
    near(moved.end, p(100, 0))
  })
})
