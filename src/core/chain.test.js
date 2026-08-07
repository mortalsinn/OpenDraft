import { describe, it, expect } from 'vitest'
import { buildChain, pointKey } from './chain.js'
import { layoutRailing, railingSegments } from './railing.js'

const p = (x, y, z = 0) => ({ x, y, z })
const edge = (id, a, b) => ({ id, type: 'edge', start: a, end: b })

/** A rectangle drawn as four chained edges, 240" x 120". */
const rectangle = [
  edge('e1', p(0, 0), p(240, 0)),
  edge('e2', p(240, 0), p(240, 120)),
  edge('e3', p(240, 120), p(0, 120)),
  edge('e4', p(0, 120), p(0, 0)),
]

describe('buildChain', () => {
  it('returns just the edge when nothing is connected', () => {
    const { points, edgeIds, closed } = buildChain([rectangle[0]], 'e1')
    expect(points).toEqual([p(0, 0), p(240, 0)])
    expect(edgeIds).toEqual(['e1'])
    expect(closed).toBe(false)
  })

  it('walks an open chain in order from either end', () => {
    const open = rectangle.slice(0, 3) // three sides, not closed
    const { points, closed } = buildChain(open, 'e2')

    expect(closed).toBe(false)
    expect(points).toEqual([p(0, 0), p(240, 0), p(240, 120), p(0, 120)])
  })

  it('detects a closed loop and does not repeat the start vertex', () => {
    const { points, edgeIds, closed } = buildChain(rectangle, 'e1')

    expect(closed).toBe(true)
    expect(edgeIds).toHaveLength(4)
    // Four corners, not five — a repeated vertex would stack two posts.
    expect(points).toHaveLength(4)
    expect(new Set(points.map(pointKey)).size).toBe(4)
  })

  it('gives the same loop whichever edge you start from', () => {
    const keys = (id) => new Set(buildChain(rectangle, id).points.map(pointKey))
    expect(keys('e3')).toEqual(keys('e1'))
  })

  it('stops at a junction rather than guessing which way to go', () => {
    // A T: three edges meet at (240, 0). Continuing through would silently
    // swallow a branch the user never meant to include.
    const tee = [
      edge('e1', p(0, 0), p(240, 0)),
      edge('e2', p(240, 0), p(240, 120)),
      edge('e3', p(240, 0), p(480, 0)),
    ]
    const { points, edgeIds } = buildChain(tee, 'e1')
    expect(edgeIds).toEqual(['e1'])
    expect(points).toEqual([p(0, 0), p(240, 0)])
  })

  it('ignores an unknown starting edge', () => {
    expect(buildChain(rectangle, 'nope')).toEqual({ points: [], edgeIds: [], closed: false })
  })
})

describe('polyline railings', () => {
  const loop = { points: rectangle.map((e) => e.start), closed: true }

  it('turns corners — one span per side, plus the closing span', () => {
    expect(railingSegments(loop)).toHaveLength(4)
  })

  it('measures the whole perimeter', () => {
    expect(layoutRailing(loop).runLength).toBeCloseTo(2 * 240 + 2 * 120, 6)
  })

  it('puts exactly one post on each corner', () => {
    const { posts } = layoutRailing(loop)
    const corners = rectangle.map((e) => pointKey(e.start))

    for (const corner of corners) {
      const hits = posts.filter((post) => pointKey(post) === corner)
      expect(hits).toHaveLength(1)
    }
  })

  it('quotes fewer posts than four separate runs would', () => {
    // The bug this phase exists to kill: four independent runs put a post at
    // each end of each side, double-counting all four corners.
    const asOneLoop = layoutRailing(loop).posts.length

    const asFourRuns = rectangle
      .map((e) => layoutRailing({ points: [e.start, e.end] }).posts.length)
      .reduce((a, b) => a + b, 0)

    expect(asFourRuns - asOneLoop).toBe(4)
  })

  it('leaves an open chain with one more post than a closed one', () => {
    const open = { points: loop.points, closed: false }
    const openPosts = layoutRailing(open).posts.length
    const closedPosts = layoutRailing(loop).posts.length
    // The closing span adds bays but no new vertex.
    expect(closedPosts).toBeGreaterThan(openPosts)
  })

  it('still handles the old single-segment shape', () => {
    const legacy = { start: p(0, 0), end: p(240, 0) }
    expect(layoutRailing(legacy).posts).toHaveLength(5)
  })
})
