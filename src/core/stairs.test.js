import { describe, it, expect } from 'vitest'
import { layoutStair, stairIssues, stairQuantities, STAIR_DEFAULTS } from './stairs.js'

describe('layoutStair', () => {
  it('solves a standard 9-foot floor-to-floor', () => {
    const { riserCount, riserHeight, treadCount } = layoutStair({ totalRise: 108 })
    // 108 / 7 ideal = 15.4 -> 15 risers at 7.2"
    expect(riserCount).toBe(15)
    expect(riserHeight).toBeCloseTo(7.2, 6)
    expect(treadCount).toBe(14)
  })

  it('gives every riser the same height', () => {
    // Uniformity is the whole game — unequal risers are a trip hazard and an
    // automatic inspection failure. Deriving by division rather than
    // accumulating a nominal height is what guarantees it.
    const { steps, riserHeight } = layoutStair({ totalRise: 100 })
    const deltas = steps.slice(1).map((s, i) => s.top - steps[i].top)
    for (const delta of deltas) expect(delta).toBeCloseTo(riserHeight, 10)
  })

  it('lands exactly on the upper floor', () => {
    const { steps, totalRise } = layoutStair({ totalRise: 108 })
    expect(steps[steps.length - 1].top).toBeCloseTo(totalRise, 10)
  })

  it('has one fewer tread than risers', () => {
    // The top tread is the floor you arrive on. Getting this wrong leaves the
    // stair one tread short of the landing.
    const { riserCount, treadCount } = layoutStair({ totalRise: 108 })
    expect(treadCount).toBe(riserCount - 1)
  })

  it('computes the run from the tread count, not from a drawn length', () => {
    const { totalRun, treadCount, treadDepth } = layoutStair({ totalRise: 108, treadDepth: 10.5 })
    expect(totalRun).toBeCloseTo(treadCount * treadDepth, 10)
  })

  it('keeps risers legal even when the ideal would not', () => {
    // A very tall rise: rounding to the ideal 7" would give risers over the
    // 7.87" maximum, so the count has to climb instead.
    for (const totalRise of [40, 96, 108, 130, 150, 200, 240]) {
      const { riserHeight } = layoutStair({ totalRise })
      expect(riserHeight).toBeLessThanOrEqual(STAIR_DEFAULTS.maxRiser + 1e-9)
      expect(riserHeight).toBeGreaterThanOrEqual(STAIR_DEFAULTS.minRiser - 1e-9)
    }
  })

  it('handles a rise so small it is a single step', () => {
    const { riserCount, treadCount, totalRun } = layoutStair({ totalRise: 7 })
    expect(riserCount).toBe(1)
    expect(treadCount).toBe(0)
    expect(totalRun).toBe(0)
  })

  it('returns nothing for a stair with no rise', () => {
    expect(layoutStair({ totalRise: 0 }).riserCount).toBe(0)
  })
})

describe('stairIssues', () => {
  it('passes a well-formed stair', () => {
    const issues = stairIssues({ totalRise: 108, treadDepth: 10.5 })
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('flags a tread below the code minimum', () => {
    const issues = stairIssues({ totalRise: 108, treadDepth: 8 })
    expect(issues.some((i) => i.code === 'TREAD-MIN')).toBe(true)
  })

  it('flags an uncomfortable stair even when it is legal', () => {
    // Legal dimensions can still make a stair nobody wants to climb.
    const issues = stairIssues({ totalRise: 108, treadDepth: 16 })
    expect(issues.some((i) => i.code === 'COMFORT' && i.severity === 'warning')).toBe(true)
  })

  it('reports a stair with no rise rather than dividing by zero', () => {
    expect(stairIssues({ totalRise: 0 })[0].code).toBe('RISE')
  })
})

describe('stairQuantities', () => {
  it('quotes exactly what was laid out', () => {
    const node = { totalRise: 108, treadDepth: 10.5, width: 36 }
    const layout = layoutStair(node)
    const lines = stairQuantities(node)

    expect(lines.find((l) => l.sku === 'TREAD').quantity).toBe(layout.treadCount)
    expect(lines.find((l) => l.sku === 'RISER').quantity).toBe(layout.riserCount)
  })

  it('adds a third stringer once the stair is wide', () => {
    const narrow = stairQuantities({ totalRise: 108, width: 36 })
    const wide = stairQuantities({ totalRise: 108, width: 48 })

    const lengthOf = (lines) => lines.find((l) => l.sku === 'STRINGER').quantity
    expect(lengthOf(wide) / lengthOf(narrow)).toBeCloseTo(3 / 2, 6)
  })

  it('measures the stringer along the hypotenuse, not the run', () => {
    const { totalRun } = layoutStair({ totalRise: 108 })
    const rail = stairQuantities({ totalRise: 108 }).find((l) => l.sku === 'STAIR-RAIL').quantity
    expect(rail).toBeGreaterThan(totalRun)
    expect(rail).toBeCloseTo(Math.hypot(totalRun, 108), 6)
  })

  it('quotes nothing for a stair with no rise', () => {
    expect(stairQuantities({ totalRise: 0 })).toEqual([])
  })
})
