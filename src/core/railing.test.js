import { describe, it, expect } from 'vitest'
import { layoutRailing, picketsInBay, railingQuantities, RAILING_DEFAULTS } from './railing.js'

const p = (x, y, z = 0) => ({ x, y, z })
/** A 20-foot straight run. */
const run20ft = { start: p(0, 0), end: p(240, 0) }

describe('picketsInBay', () => {
  it('needs no pickets when the opening is already legal', () => {
    expect(picketsInBay(3, 0.75, 3.9)).toBe(0)
  })

  it('closes every opening to at most the maximum gap', () => {
    // Exhaustive sweep: whatever count we return, verify the resulting clear
    // gap actually satisfies the rule. This is the property that matters —
    // an off-by-one here is a failed inspection, not a cosmetic bug.
    const picketWidth = 0.75
    const maxGap = 3.9

    for (let clear = 4; clear <= 120; clear += 0.25) {
      const k = picketsInBay(clear, picketWidth, maxGap)
      const gap = (clear - k * picketWidth) / (k + 1)
      expect(gap).toBeLessThanOrEqual(maxGap + 1e-9)
    }
  })

  it('does not overshoot — one fewer picket would violate the rule', () => {
    const picketWidth = 0.75
    const maxGap = 3.9

    for (let clear = 5; clear <= 120; clear += 0.25) {
      const k = picketsInBay(clear, picketWidth, maxGap)
      if (k === 0) continue
      const gapWithOneFewer = (clear - (k - 1) * picketWidth) / k
      expect(gapWithOneFewer).toBeGreaterThan(maxGap - 1e-9)
    }
  })

  it('beats naive pitch counting, which comes up a picket short', () => {
    // Pitch counting — floor(clear / (picketWidth + maxGap)) — is right most of
    // the time, which is exactly what makes it dangerous. A 17.9" clear bay is
    // one of the widths where it is not: it returns 3 pickets, leaving 3.9125"
    // openings that a 100mm sphere passes through.
    const clear = 17.9
    const picketWidth = 0.75
    const maxGap = 3.9

    const naive = Math.floor(clear / (picketWidth + maxGap))
    const correct = picketsInBay(clear, picketWidth, maxGap)
    expect(correct).toBe(naive + 1)

    const naiveGap = (clear - naive * picketWidth) / (naive + 1)
    const correctGap = (clear - correct * picketWidth) / (correct + 1)

    expect(naiveGap).toBeGreaterThan(maxGap) // would fail inspection
    expect(correctGap).toBeLessThanOrEqual(maxGap)
  })
})

describe('layoutRailing', () => {
  it('puts a post at each end plus intermediates within the maximum spacing', () => {
    const { posts, bays } = layoutRailing(run20ft)
    // 240" at 72" max → 4 bays → 5 posts.
    expect(bays).toBe(4)
    expect(posts).toHaveLength(5)
    expect(posts[0]).toMatchObject({ x: 0, y: 0 })
    expect(posts[4]).toMatchObject({ x: 240, y: 0 })
  })

  it('evens out the bays instead of leaving a short remainder', () => {
    const { posts } = layoutRailing(run20ft)
    const spans = posts.slice(1).map((post, i) => post.x - posts[i].x)
    for (const span of spans) expect(span).toBeCloseTo(60, 6)
  })

  it('keeps every picket inside the run', () => {
    const { pickets } = layoutRailing(run20ft)
    expect(pickets.length).toBeGreaterThan(0)
    for (const picket of pickets) {
      expect(picket.x).toBeGreaterThanOrEqual(0)
      expect(picket.x).toBeLessThanOrEqual(240)
    }
  })

  it('achieves a legal gap', () => {
    const { gap } = layoutRailing(run20ft)
    expect(gap).toBeLessThanOrEqual(RAILING_DEFAULTS.maxGap)
    expect(gap).toBeGreaterThan(0)
  })

  it('lays out along a diagonal, not just an axis', () => {
    const diagonal = { start: p(0, 0), end: p(120, 160) } // 200" run
    const { runLength, posts } = layoutRailing(diagonal)
    expect(runLength).toBeCloseTo(200, 6)
    expect(posts[posts.length - 1]).toMatchObject({ x: 120, y: 160 })
  })

  it('handles a degenerate zero-length run without dividing by zero', () => {
    const result = layoutRailing({ start: p(5, 5), end: p(5, 5) })
    expect(result.runLength).toBe(0)
    expect(result.posts).toEqual([])
    expect(result.pickets).toEqual([])
  })

  it('responds to a tighter gap rule with more pickets', () => {
    const standard = layoutRailing(run20ft)
    const strict = layoutRailing({ ...run20ft, maxGap: 2.5 })
    expect(strict.pickets.length).toBeGreaterThan(standard.pickets.length)
  })
})

describe('railingQuantities', () => {
  it('reports exactly what the layout drew', () => {
    const node = { ...run20ft }
    const layout = layoutRailing(node)
    const lines = railingQuantities(node)

    const posts = lines.find((l) => l.sku === 'POST')
    const pickets = lines.find((l) => l.sku === 'PICKET')
    const rail = lines.find((l) => l.sku === 'TOPRAIL')

    // The whole point: the quote cannot disagree with the drawing.
    expect(posts.quantity).toBe(layout.posts.length)
    expect(pickets.quantity).toBe(layout.pickets.length)
    expect(rail.quantity).toBeCloseTo(layout.runLength, 6)
  })

  it('returns nothing for a zero-length run', () => {
    expect(railingQuantities({ start: p(0, 0), end: p(0, 0) })).toEqual([])
  })
})
