import { describe, it, expect } from 'vitest'
import {
  createDocument,
  addNode,
  convertNode,
  updateNode,
  removeNode,
  computeTakeoff,
  seedIds,
  makeId,
} from './doc.js'

const p = (x, y, z = 0) => ({ x, y, z })

function docWithEdge() {
  const doc = addNode(createDocument(), 'edge', { start: p(0, 0), end: p(240, 0) })
  return { doc, id: doc.order[0] }
}

describe('convertNode', () => {
  it('actually changes the type', () => {
    // Regression: node types spread their overrides, so passing the whole
    // existing node into `create` let the old `type` overwrite the new one and
    // the conversion silently no-opped.
    const { doc, id } = docWithEdge()
    const converted = convertNode(doc, id, 'railingRun')
    expect(converted.nodes[id].type).toBe('railingRun')
  })

  it('keeps the id, so selection and history stay pointed at the same object', () => {
    const { doc, id } = docWithEdge()
    const converted = convertNode(doc, id, 'railingRun')
    expect(converted.nodes[id].id).toBe(id)
    expect(converted.order).toEqual(doc.order)
  })

  it('carries the geometry across and fills in type defaults', () => {
    const { doc, id } = docWithEdge()
    const node = convertNode(doc, id, 'railingRun').nodes[id]
    expect(node.start).toEqual(p(0, 0))
    expect(node.end).toEqual(p(240, 0))
    expect(node.height).toBeGreaterThan(0)
    expect(node.maxGap).toBeGreaterThan(0)
  })

  it('leaves the document alone for an unknown type or missing node', () => {
    const { doc, id } = docWithEdge()
    expect(convertNode(doc, id, 'nonsense')).toBe(doc)
    expect(convertNode(doc, 'missing', 'railingRun')).toBe(doc)
  })
})

describe('computeTakeoff', () => {
  it('is empty for bare edges', () => {
    const { doc } = docWithEdge()
    expect(computeTakeoff(doc)).toEqual([])
  })

  it('produces priced lines once an edge becomes a railing', () => {
    const { doc, id } = docWithEdge()
    const lines = computeTakeoff(convertNode(doc, id, 'railingRun'))

    expect(lines.find((l) => l.sku === 'POST').quantity).toBe(5)
    expect(lines.find((l) => l.sku === 'PICKET').quantity).toBeGreaterThan(0)
    expect(lines.find((l) => l.sku === 'TOPRAIL').quantity).toBeCloseTo(240, 6)
  })

  it('merges duplicate SKUs across runs', () => {
    let doc = createDocument()
    doc = addNode(doc, 'railingRun', { start: p(0, 0), end: p(240, 0) })
    doc = addNode(doc, 'railingRun', { start: p(0, 100), end: p(240, 100) })

    const posts = computeTakeoff(doc).find((l) => l.sku === 'POST')
    expect(posts.quantity).toBe(10) // two identical runs of 5
  })

  it('tracks a parameter edit', () => {
    const { doc, id } = docWithEdge()
    const railing = convertNode(doc, id, 'railingRun')
    const before = computeTakeoff(railing).find((l) => l.sku === 'PICKET').quantity

    const tighter = updateNode(railing, id, { maxGap: 2 })
    const after = computeTakeoff(tighter).find((l) => l.sku === 'PICKET').quantity

    expect(after).toBeGreaterThan(before)
  })
})

describe('removeNode', () => {
  it('drops the node and its place in the order', () => {
    const { doc, id } = docWithEdge()
    const pruned = removeNode(doc, id)
    expect(pruned.nodes[id]).toBeUndefined()
    expect(pruned.order).not.toContain(id)
  })
})

describe('seedIds', () => {
  it('pushes the counter past a loaded document', () => {
    // Without this, reopening a drawing hands the next edge an id that already
    // exists and silently overwrites a node.
    seedIds({ nodes: { e1: {}, e7: {}, e3: {} } })
    const fresh = makeId('e')
    expect(fresh).toBe('e8')
  })

  it('copes with an empty document', () => {
    seedIds({ nodes: {} })
    expect(makeId('e')).toBe('e1')
  })
})
