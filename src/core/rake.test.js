import { describe, it, expect } from 'vitest'
import { nosingLine, layoutRakingGuard, rakingGuardGeometry, rakingGuardQuantities } from './rake.js'
import { layoutStair } from './stairs.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A 9'-0" flight running east. */
const stair = { points: [p(0, 0), p(200, 0)], totalRise: 108, treadDepth: 10.5, width: 42 }

describe('nosingLine', () => {
  it('measures the rail along the hypotenuse, not the run', () => {
    // Quoting the horizontal run under-orders every rake in the job.
    const nosing = nosingLine(stair)
    const { totalRun } = layoutStair(stair)

    expect(nosing.run).toBeCloseTo(totalRun, 9)
    expect(nosing.rise).toBe(108)
    expect(nosing.length).toBeCloseTo(Math.hypot(totalRun, 108), 9)
    expect(nosing.length).toBeGreaterThan(nosing.run)
  })

  it('is about 15% longer than the run on a normal stair', () => {
    const nosing = nosingLine(stair)
    expect(nosing.length / nosing.run).toBeGreaterThan(1.1)
  })

  it('returns null for a stair with no rise', () => {
    expect(nosingLine({ ...stair, totalRise: 0 })).toBeNull()
  })
})

describe('layoutRakingGuard', () => {
  const guard = layoutRakingGuard(stair, { height: 36 })

  it('stands every post plumb, a fixed VERTICAL height above the nosing', () => {
    // A post square to the rake leans, which is wrong and obvious once it is
    // standing.
    for (const post of guard.posts) {
      expect(post.top - post.base).toBeCloseTo(36, 9)
    }
  })

  it('climbs each post with the nosing line', () => {
    const bases = guard.posts.map((post) => post.base)
    for (let i = 1; i < bases.length; i++) {
      expect(bases[i]).toBeGreaterThan(bases[i - 1])
    }
    expect(bases[0]).toBeCloseTo(0, 9)
    expect(bases[bases.length - 1]).toBeCloseTo(108, 6)
  })

  it('keeps the rail parallel to the nosing line', () => {
    // Equal vertical heights on every post means the line through their tops
    // has the same slope as the line through their bases.
    const first = guard.posts[0]
    const last = guard.posts[guard.posts.length - 1]

    const railSlope = (last.top - first.top) / (last.along - first.along)
    const nosingSlope = (last.base - first.base) / (last.along - first.along)
    expect(railSlope).toBeCloseTo(nosingSlope, 9)
    expect(railSlope).toBeCloseTo(Math.tan(guard.slope), 6)
  })

  it('stands pickets plumb and spaces them by horizontal clear distance', () => {
    // Pickets being plumb is what makes the horizontal gap the dimension the
    // sphere test bites on, exactly as on a level guard.
    expect(guard.pickets.length).toBeGreaterThan(0)
    for (const picket of guard.pickets) {
      expect(picket.top - picket.base).toBeCloseTo(36, 9)
    }
    expect(guard.gap).toBeLessThanOrEqual(3.9)
  })

  it('spaces posts along the SLOPE, so more fit than on the flat run', () => {
    // Horizontal spacing is the slope spacing foreshortened, so a raking guard
    // takes more bays over the same horizontal distance.
    const raking = layoutRakingGuard(stair, { postSpacing: 72 })
    const horizontalSpacing = raking.run / raking.bays
    expect(horizontalSpacing).toBeLessThanOrEqual(72)
  })

  it('returns nothing for a stair with no rise', () => {
    expect(layoutRakingGuard({ ...stair, totalRise: 0 }).posts).toEqual([])
  })
})

describe('rakingGuardGeometry', () => {
  it('places posts along the stair direction in world space', () => {
    const { posts, rail } = rakingGuardGeometry(stair, { height: 36 })

    expect(posts.length).toBeGreaterThan(1)
    // The flight runs east, so posts advance in x and stay on y = 0.
    for (const [base] of posts) expect(base.y).toBeCloseTo(0, 9)
    expect(posts[posts.length - 1][0].x).toBeGreaterThan(posts[0][0].x)

    // Each post is vertical: same x and y at both ends.
    for (const [base, top] of posts) {
      expect(top.x).toBeCloseTo(base.x, 9)
      expect(top.y).toBeCloseTo(base.y, 9)
      expect(top.z).toBeGreaterThan(base.z)
    }

    // The rail climbs from the first post top to the last.
    expect(rail[1].z).toBeGreaterThan(rail[0].z)
  })

  it('offsets the guard to one side of the flight', () => {
    const { posts } = rakingGuardGeometry(stair, { height: 36, offset: 21 })
    for (const [base] of posts) expect(Math.abs(base.y)).toBeCloseTo(21, 6)
  })

  it('follows a diagonal flight', () => {
    const diagonal = { ...stair, points: [p(0, 0), p(100, 100)] }
    const { posts } = rakingGuardGeometry(diagonal, { height: 36 })
    const last = posts[posts.length - 1][0]
    expect(last.x).toBeCloseTo(last.y, 6)
  })

  it('yields nothing for a degenerate flight', () => {
    expect(rakingGuardGeometry({ ...stair, points: [p(0, 0), p(0, 0)] }).posts).toEqual([])
  })
})

describe('rakingGuardQuantities', () => {
  it('quotes the rail along the hypotenuse', () => {
    const lines = rakingGuardQuantities(stair, { height: 36 })
    const rail = lines.find((line) => line.sku === 'RAKE-RAIL')
    const nosing = nosingLine(stair)

    expect(rail.quantity).toBeCloseTo(nosing.length, 6)
    expect(rail.quantity).toBeGreaterThan(nosing.run)
  })

  it('quotes exactly the posts and pickets laid out', () => {
    const guard = { height: 36 }
    const layout = layoutRakingGuard(stair, guard)
    const lines = rakingGuardQuantities(stair, guard)

    expect(lines.find((l) => l.sku === 'POST-RAKE').quantity).toBe(layout.posts.length)
    expect(lines.find((l) => l.sku === 'PICKET').quantity).toBe(layout.pickets.length)
  })

  it('totals picket length, because each is a different cut on a rake', () => {
    const lines = rakingGuardQuantities(stair, { height: 36 })
    const linear = lines.find((l) => l.sku === 'PICKET-LF').quantity
    const count = lines.find((l) => l.sku === 'PICKET').quantity
    expect(linear).toBeCloseTo(count * 36, 6)
  })

  it('quotes nothing for a stair with no rise', () => {
    expect(rakingGuardQuantities({ ...stair, totalRise: 0 })).toEqual([])
  })
})
