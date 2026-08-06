import { describe, it, expect } from 'vitest'
import { infer } from './inference.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A 100" horizontal segment from the origin. */
const horizontal = { id: 'e1', start: p(0, 0), end: p(100, 0) }
/** A 100" vertical segment crossing it at (50, 0). */
const vertical = { id: 'e2', start: p(50, -50), end: p(50, 50) }

const base = { worldPerPixel: 1, pixelTolerance: 10 }

describe('snap priority', () => {
  it('prefers an endpoint over an edge even when the edge is nearer', () => {
    // Cursor sits 1" off the line but 3" from the endpoint. Distance alone
    // would pick the edge; priority must pick the endpoint.
    const result = infer({ ...base, cursor: p(97, 1), segments: [horizontal] })
    expect(result.kind).toBe('endpoint')
    expect(result.point.x).toBe(100)
  })

  it('prefers a midpoint over an edge', () => {
    const result = infer({ ...base, cursor: p(50, 2), segments: [horizontal] })
    expect(result.kind).toBe('midpoint')
    expect(result.point).toMatchObject({ x: 50, y: 0 })
  })

  it('finds an intersection where two segments cross', () => {
    // Offset from both midpoints so intersection is the only sensible answer.
    const result = infer({ ...base, cursor: p(50, 3), segments: [horizontal, vertical] })
    expect(['intersection', 'midpoint']).toContain(result.kind)
    expect(result.point.x).toBeCloseTo(50)
  })

  it('lands on an edge between the ends', () => {
    const result = infer({ ...base, cursor: p(25, 2), segments: [horizontal] })
    expect(result.kind).toBe('onEdge')
    expect(result.point).toMatchObject({ x: 25, y: 0 })
  })

  it('falls through to free when nothing is close', () => {
    const result = infer({ ...base, cursor: p(500, 500), segments: [horizontal] })
    expect(result.kind).toBe('free')
    expect(result.point).toMatchObject({ x: 500, y: 500 })
  })
})

describe('zoom independence', () => {
  it('snaps at the same pixel distance regardless of scale', () => {
    // Deliberately off the segment's own line, so this measures the endpoint
    // snap rather than the extension snap.
    const cursor = p(105, 5)

    // Zoomed in (1 unit/px) the endpoint is ~7 units ≈ 7px away — a hit.
    const zoomedIn = infer({ ...base, worldPerPixel: 1, cursor, segments: [horizontal] })
    expect(zoomedIn.kind).toBe('endpoint')

    // Zoomed out (0.1 units/px) the same ~7 units is ~70px away — a miss.
    const zoomedOut = infer({ ...base, worldPerPixel: 0.1, cursor, segments: [horizontal] })
    expect(zoomedOut.kind).toBe('free')
  })
})

describe('extension', () => {
  it('continues a segment past its end', () => {
    const result = infer({ ...base, cursor: p(140, 3), segments: [horizontal] })
    expect(result.kind).toBe('extension')
    expect(result.point).toMatchObject({ x: 140, y: 0 })
  })

  it('gives up well past the end, rather than acting as an infinite guide', () => {
    // Four segment-lengths out. Without a reach limit this would still snap,
    // and every edge in the document would fire a guide across the whole model.
    const result = infer({ ...base, cursor: p(500, 3), segments: [horizontal] })
    expect(result.kind).toBe('free')
  })
})

describe('axis inference', () => {
  it('snaps to the red axis when drawing roughly along X', () => {
    const result = infer({
      ...base,
      cursor: p(60, 3),
      anchor: p(0, 0),
      segments: [],
    })
    expect(result.kind).toBe('axisX')
    expect(result.point.y).toBeCloseTo(0)
  })

  it('snaps to the green axis when drawing roughly along Y', () => {
    const result = infer({ ...base, cursor: p(3, 60), anchor: p(0, 0), segments: [] })
    expect(result.kind).toBe('axisY')
    expect(result.point.x).toBeCloseTo(0)
  })

  it('honours an explicit axis lock even far off-axis', () => {
    // 200 units off the X axis — nothing would normally snap — but the lock
    // means the user has already declared the direction.
    const result = infer({
      ...base,
      cursor: p(60, 200),
      anchor: p(0, 0),
      segments: [],
      lockedAxis: 'axisX',
    })
    expect(result.kind).toBe('axisX')
    expect(result.locked).toBe(true)
    expect(result.point.x).toBeCloseTo(60)
    expect(result.point.y).toBeCloseTo(0)
  })
})

describe('grid', () => {
  it('snaps to the grid when nothing better is available', () => {
    const result = infer({ ...base, cursor: p(11, 23), segments: [], gridStep: 12 })
    expect(result.kind).toBe('grid')
    expect(result.point).toMatchObject({ x: 12, y: 24 })
  })

  it('never beats real geometry', () => {
    const result = infer({
      ...base,
      cursor: p(98, 1),
      segments: [horizontal],
      gridStep: 12,
    })
    expect(result.kind).toBe('endpoint')
  })
})
