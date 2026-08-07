import { describe, it, expect } from 'vitest'
import { createDocument, addNode, moveVertex, translateNode, nodeVertices } from './doc.js'
import { makeAnchor, resolveDimension } from './dimension.js'

const p = (x, y, z = 0) => ({ x, y, z })

describe('nodeVertices', () => {
  it('reads every shape a node stores vertices in', () => {
    // Three different storage shapes exist for good reasons; moving has to
    // work across all of them without every caller knowing which is which.
    expect(nodeVertices({ points: [p(1, 1), p(2, 2)] })).toHaveLength(2)
    expect(nodeVertices({ start: p(0, 0), end: p(1, 1) })).toHaveLength(2)
    expect(nodeVertices({ position: p(5, 5) })).toHaveLength(1)
    expect(nodeVertices({})).toEqual([])
  })
})

describe('moveVertex', () => {
  it('moves one corner of a polyline and leaves the rest', () => {
    const doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0), p(240, 120)] })
    const id = doc.order[0]

    const moved = moveVertex(doc, id, 1, p(300, 50))
    expect(moved.nodes[id].points[0]).toEqual(p(0, 0))
    expect(moved.nodes[id].points[1]).toEqual(p(300, 50))
    expect(moved.nodes[id].points[2]).toEqual(p(240, 120))
  })

  it('moves an edge endpoint, writing back into start/end', () => {
    const doc = addNode(createDocument(), 'edge', { start: p(0, 0), end: p(100, 0) })
    const id = doc.order[0]

    const moved = moveVertex(doc, id, 1, p(150, 25))
    expect(moved.nodes[id].end).toEqual(p(150, 25))
    expect(moved.nodes[id].start).toEqual(p(0, 0))
  })

  it('ignores an index that is not there', () => {
    const doc = addNode(createDocument(), 'edge', { start: p(0, 0), end: p(100, 0) })
    expect(moveVertex(doc, doc.order[0], 9, p(1, 1))).toBe(doc)
  })
})

describe('translateNode', () => {
  it('shifts every vertex by the same displacement', () => {
    const doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)] })
    const id = doc.order[0]

    const moved = translateNode(doc, id, { x: 10, y: -5 })
    expect(moved.nodes[id].points).toEqual([p(10, -5), p(250, -5)])
  })

  it('keeps the shape identical', () => {
    const doc = addNode(createDocument(), 'slab', { points: [p(0, 0), p(100, 0), p(100, 50)] })
    const id = doc.order[0]

    const before = doc.nodes[id].points
    const after = translateNode(doc, id, { x: 37, y: 11 }).nodes[id].points

    for (let i = 1; i < before.length; i++) {
      const wasX = before[i].x - before[0].x
      const nowX = after[i].x - after[0].x
      expect(nowX).toBeCloseTo(wasX, 10)
    }
  })
})

describe('moving with dimensions attached', () => {
  it('drags a dimension along with the corner it measures', () => {
    // The payoff for storing a reference instead of a number.
    let doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)] })
    const runId = doc.order[0]

    doc = addNode(doc, 'dimension', {
      from: makeAnchor(doc, p(0, 0), [runId]),
      to: makeAnchor(doc, p(240, 0), [runId]),
    })
    const dimId = doc.order[1]

    expect(resolveDimension(doc, doc.nodes[dimId]).length).toBe(240)

    const stretched = moveVertex(doc, runId, 1, p(300, 0))
    expect(resolveDimension(stretched, stretched.nodes[dimId]).length).toBe(300)
  })

  it('keeps the measurement when the whole object is translated', () => {
    let doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)] })
    const runId = doc.order[0]
    doc = addNode(doc, 'dimension', {
      from: makeAnchor(doc, p(0, 0), [runId]),
      to: makeAnchor(doc, p(240, 0), [runId]),
    })
    const dimId = doc.order[1]

    // Sliding an object across the page must not change its length.
    const moved = translateNode(doc, runId, { x: 500, y: 200 })
    expect(resolveDimension(moved, moved.nodes[dimId]).length).toBe(240)
  })
})
