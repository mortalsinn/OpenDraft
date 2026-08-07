import { describe, it, expect } from 'vitest'
import {
  createDocument,
  addNode,
  convertNode,
  updateNode,
  removeNode,
  computeTakeoff,
  promoteChain,
  migrateDocument,
  SCHEMA_VERSION,
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

  it('carries the geometry across as a polyline and fills in type defaults', () => {
    const { doc, id } = docWithEdge()
    const node = convertNode(doc, id, 'railingRun').nodes[id]
    // A promoted single edge is the two-point case of a run.
    expect(node.points).toEqual([p(0, 0), p(240, 0)])
    expect(node.closed).toBe(false)
    expect(node.height).toBeGreaterThan(0)
    expect(node.maxGap).toBeGreaterThan(0)
  })

  it('leaves the document alone for an unknown type or missing node', () => {
    const { doc, id } = docWithEdge()
    expect(convertNode(doc, id, 'nonsense')).toBe(doc)
    expect(convertNode(doc, 'missing', 'railingRun')).toBe(doc)
  })
})

describe('promoteChain', () => {
  /** A rectangle drawn as four chained edges. */
  function rectangleDoc() {
    const corners = [p(0, 0), p(240, 0), p(240, 120), p(0, 120)]
    let doc = createDocument()
    for (let i = 0; i < 4; i++) {
      doc = addNode(doc, 'edge', { start: corners[i], end: corners[(i + 1) % 4] })
    }
    return doc
  }

  it('absorbs the whole chain into one run', () => {
    const doc = rectangleDoc()
    const first = doc.order[0]
    const promoted = promoteChain(doc, first)

    expect(promoted.order).toEqual([first])
    expect(promoted.nodes[first].type).toBe('railingRun')
    expect(promoted.nodes[first].closed).toBe(true)
    expect(promoted.nodes[first].points).toHaveLength(4)
  })

  it('consumes the edges it swallowed', () => {
    const doc = rectangleDoc()
    const promoted = promoteChain(doc, doc.order[0])
    expect(Object.keys(promoted.nodes)).toHaveLength(1)
  })

  it('quotes four fewer posts than promoting each side separately', () => {
    const doc = rectangleDoc()

    const asLoop = computeTakeoff(promoteChain(doc, doc.order[0])).find((l) => l.sku === 'POST')

    let separately = doc
    for (const id of doc.order) separately = convertNode(separately, id, 'railingRun')
    const asFour = computeTakeoff(separately).find((l) => l.sku === 'POST')

    expect(asFour.quantity - asLoop.quantity).toBe(4) // one per doubled corner
  })

  it('leaves non-edges alone', () => {
    const { doc, id } = docWithEdge()
    const railing = convertNode(doc, id, 'railingRun')
    expect(promoteChain(railing, id)).toBe(railing)
  })
})

describe('slabs', () => {
  /** A 12' x 10' deck ring. */
  const ring = [p(0, 0), p(144, 0), p(144, 120), p(0, 120)]

  it('quotes decking by area and rim board by perimeter', () => {
    const doc = addNode(createDocument(), 'slab', { points: ring })
    const lines = computeTakeoff(doc)

    expect(lines.find((l) => l.sku === 'DECK-SF').quantity).toBe(120) // sq ft
    expect(lines.find((l) => l.sku === 'RIM').quantity).toBe(2 * 144 + 2 * 120)
  })

  it('converts area into linear board footage', () => {
    const doc = addNode(createDocument(), 'slab', { points: ring, boardWidth: 5.5 })
    const linear = computeTakeoff(doc).find((l) => l.sku === 'DECK-LF').quantity
    expect(linear).toBeCloseTo((144 * 120) / 5.5, 6)
  })

  it('refuses to build a deck from an open chain', () => {
    // Closing it silently would invent an edge nobody drew and quote decking
    // for a shape that is not there.
    const corners = [p(0, 0), p(144, 0), p(144, 120)]
    let doc = createDocument()
    for (let i = 0; i < corners.length - 1; i++) {
      doc = addNode(doc, 'edge', { start: corners[i], end: corners[i + 1] })
    }
    expect(promoteChain(doc, doc.order[0], 'slab')).toBe(doc)
  })

  it('builds a deck from a closed chain', () => {
    let doc = createDocument()
    for (let i = 0; i < 4; i++) {
      doc = addNode(doc, 'edge', { start: ring[i], end: ring[(i + 1) % 4] })
    }
    const promoted = promoteChain(doc, doc.order[0], 'slab')

    expect(promoted.nodes[doc.order[0]].type).toBe('slab')
    expect(computeTakeoff(promoted).find((l) => l.sku === 'DECK-SF').quantity).toBe(120)
  })
})

describe('migrateDocument', () => {
  it('rewrites v1 single-segment railings as polylines', () => {
    const v1 = {
      schemaVersion: 1,
      nodes: { n1: { id: 'n1', type: 'railingRun', start: p(0, 0), end: p(240, 0), height: 42 } },
      order: ['n1'],
    }

    const migrated = migrateDocument(v1)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.nodes.n1.points).toEqual([p(0, 0), p(240, 0)])
    expect(migrated.nodes.n1.start).toBeUndefined()
    expect(migrated.nodes.n1.height).toBe(42) // parameters survive
  })

  it('passes a current document through untouched', () => {
    const doc = createDocument()
    expect(migrateDocument(doc)).toBe(doc)
  })

  it('refuses a document from an unknown future version', () => {
    // Better to start clean than to guess at a shape we do not understand.
    expect(migrateDocument({ schemaVersion: 99, nodes: {}, order: [] })).toBeNull()
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
