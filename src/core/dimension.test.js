import { describe, it, expect } from 'vitest'
import { makeAnchor, resolveAnchor, resolveDimension, isDimensionLive, isAssociative } from './dimension.js'
import { createDocument, addNode, updateNode, removeNode, removeNodeCascade, dependentsOf } from './doc.js'

const p = (x, y, z = 0) => ({ x, y, z })

function docWithRun() {
  const doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)] })
  return { doc, id: doc.order[0] }
}

describe('makeAnchor', () => {
  it('binds to a vertex when the click lands on one', () => {
    const { doc, id } = docWithRun()
    expect(makeAnchor(doc, p(240, 0), [id])).toEqual({ kind: 'vertex', nodeId: id, index: 1 })
  })

  it('falls back to a literal point mid-span', () => {
    const { doc, id } = docWithRun()
    const anchor = makeAnchor(doc, p(120, 0), [id])
    expect(anchor.kind).toBe('point')
    expect(anchor.point).toEqual(p(120, 0))
  })

  it('falls back to a literal point with nothing under the cursor', () => {
    const { doc } = docWithRun()
    expect(makeAnchor(doc, p(50, 50), []).kind).toBe('point')
  })
})

describe('associativity', () => {
  it('follows the geometry when it moves', () => {
    // The entire reason dimensions store a reference rather than a number.
    const { doc, id } = docWithRun()
    const dim = { from: makeAnchor(doc, p(0, 0), [id]), to: makeAnchor(doc, p(240, 0), [id]) }

    expect(resolveDimension(doc, dim).length).toBe(240)

    const stretched = updateNode(doc, id, { points: [p(0, 0), p(300, 0)] })
    expect(resolveDimension(stretched, dim).length).toBe(300)
  })

  it('does not follow anything when both ends are literal points', () => {
    const { doc, id } = docWithRun()
    const dim = { from: { kind: 'point', point: p(0, 0) }, to: { kind: 'point', point: p(240, 0) } }

    const stretched = updateNode(doc, id, { points: [p(0, 0), p(300, 0)] })
    expect(resolveDimension(stretched, dim).length).toBe(240)
    expect(isAssociative(dim)).toBe(false)
  })

  it('breaks visibly when its target is deleted', () => {
    // A dimension whose target is gone must not keep displaying the last
    // number it knew — somebody would build to it.
    const { doc, id } = docWithRun()
    const dim = { from: makeAnchor(doc, p(0, 0), [id]), to: makeAnchor(doc, p(240, 0), [id]) }

    const pruned = removeNode(doc, id)
    expect(resolveAnchor(pruned, dim.from)).toBeNull()
    expect(resolveDimension(pruned, dim)).toBeNull()
    expect(isDimensionLive(pruned, dim)).toBe(false)
  })
})

describe('cascade deletion', () => {
  function docWithDimension() {
    const { doc, id } = docWithRun()
    const withDim = addNode(doc, 'dimension', {
      from: makeAnchor(doc, p(0, 0), [id]),
      to: makeAnchor(doc, p(240, 0), [id]),
    })
    return { doc: withDim, runId: id, dimId: withDim.order[1] }
  }

  it('finds the dimensions that measure a node', () => {
    const { doc, runId, dimId } = docWithDimension()
    expect(dependentsOf(doc, runId)).toEqual([dimId])
  })

  it('takes dependent dimensions with it', () => {
    // A broken dimension renders nothing, so leaving it behind would put an
    // invisible node in the document that cannot be selected to clean up.
    const { doc, runId, dimId } = docWithDimension()
    const pruned = removeNodeCascade(doc, runId)

    expect(pruned.nodes[runId]).toBeUndefined()
    expect(pruned.nodes[dimId]).toBeUndefined()
    expect(pruned.order).toEqual([])
  })

  it('leaves unrelated dimensions alone', () => {
    const { doc, runId } = docWithDimension()
    const withFixed = addNode(doc, 'dimension', {
      from: { kind: 'point', point: p(0, 50) },
      to: { kind: 'point', point: p(100, 50) },
    })
    const fixedId = withFixed.order[withFixed.order.length - 1]

    expect(removeNodeCascade(withFixed, runId).nodes[fixedId]).toBeDefined()
  })
})

describe('resolveDimension', () => {
  it('offsets the dimension line perpendicular to the span', () => {
    const { doc, id } = docWithRun()
    const dim = {
      from: makeAnchor(doc, p(0, 0), [id]),
      to: makeAnchor(doc, p(240, 0), [id]),
      offset: 12,
    }

    const resolved = resolveDimension(doc, dim)
    // Span runs along +X, so the offset must be entirely in Y.
    expect(resolved.lineFrom.x).toBeCloseTo(0, 6)
    expect(Math.abs(resolved.lineFrom.y)).toBeCloseTo(12, 6)
    expect(resolved.mid.x).toBeCloseTo(120, 6)
  })

  it('returns null for a zero-length span', () => {
    const doc = createDocument()
    const dim = { from: { kind: 'point', point: p(5, 5) }, to: { kind: 'point', point: p(5, 5) } }
    expect(resolveDimension(doc, dim)).toBeNull()
  })
})
