import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LAYER_ID,
  addLayer,
  updateLayer,
  removeLayer,
  assignLayer,
  isVisible,
  isSelectable,
  countsInTakeoff,
  layerCounts,
} from './layers.js'
import { createDocument, addNode, computeTakeoff, listSegments, migrateDocument, SCHEMA_VERSION } from './doc.js'

const p = (x, y, z = 0) => ({ x, y, z })

function docWithRailing() {
  const doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)] })
  return { doc, id: doc.order[0] }
}

describe('layer basics', () => {
  it('starts every document with a default layer', () => {
    const doc = createDocument()
    expect(doc.layers[DEFAULT_LAYER_ID]).toBeDefined()
    expect(doc.layerOrder).toEqual([DEFAULT_LAYER_ID])
  })

  it('puts new nodes on the default layer', () => {
    const { doc, id } = docWithRailing()
    expect(doc.nodes[id].layer).toBe(DEFAULT_LAYER_ID)
  })

  it('counts what is on each layer', () => {
    let { doc } = docWithRailing()
    doc = addLayer(doc, 'existing', 'Existing structure')
    doc = addNode(doc, 'edge', { start: p(0, 0), end: p(10, 0), layer: 'existing' })

    expect(layerCounts(doc)).toEqual({ [DEFAULT_LAYER_ID]: 1, existing: 1 })
  })
})

describe('hidden is not the same as excluded', () => {
  it('keeps a hidden layer in the takeoff', () => {
    // The mistake this prevents: hiding a layer to see behind it, then
    // quoting short because its contents silently left the takeoff. You only
    // find out when the materials arrive.
    const { doc } = docWithRailing()
    const hidden = updateLayer(doc, DEFAULT_LAYER_ID, { visible: false })

    expect(computeTakeoff(hidden).length).toBeGreaterThan(0)
    expect(computeTakeoff(hidden)).toEqual(computeTakeoff(doc))
  })

  it('drops a layer from the takeoff only when explicitly excluded', () => {
    const { doc } = docWithRailing()
    const excluded = updateLayer(doc, DEFAULT_LAYER_ID, { includeInTakeoff: false })
    expect(computeTakeoff(excluded)).toEqual([])
  })

  it('treats the two flags independently', () => {
    const { doc } = docWithRailing()
    // Visible but not quoted: an existing deck drawn for context.
    const context = updateLayer(doc, DEFAULT_LAYER_ID, { visible: true, includeInTakeoff: false })
    expect(isVisible(context, context.nodes[doc.order[0]])).toBe(true)
    expect(countsInTakeoff(context, context.nodes[doc.order[0]])).toBe(false)
  })
})

describe('visibility and locking', () => {
  it('removes hidden geometry from inference', () => {
    // You cannot snap to what you cannot see.
    const { doc } = docWithRailing()
    expect(listSegments(doc).length).toBeGreaterThan(0)

    const hidden = updateLayer(doc, DEFAULT_LAYER_ID, { visible: false })
    expect(listSegments(hidden)).toEqual([])
  })

  it('removes locked geometry from inference but keeps it drawn', () => {
    const { doc, id } = docWithRailing()
    const locked = updateLayer(doc, DEFAULT_LAYER_ID, { locked: true })

    expect(listSegments(locked)).toEqual([])
    expect(isVisible(locked, locked.nodes[id])).toBe(true)
    expect(isSelectable(locked, locked.nodes[id])).toBe(false)
  })
})

describe('removeLayer', () => {
  it('rehomes its contents instead of destroying them', () => {
    // Deleting a layer reads as an organisational tidy-up; silently binning
    // drawn work is a surprising amount of damage for that.
    let { doc } = docWithRailing()
    doc = addLayer(doc, 'temp', 'Temporary')
    doc = addNode(doc, 'edge', { start: p(0, 0), end: p(10, 0), layer: 'temp' })
    const edgeId = doc.order[1]

    const pruned = removeLayer(doc, 'temp')
    expect(pruned.layers.temp).toBeUndefined()
    expect(pruned.nodes[edgeId]).toBeDefined()
    expect(pruned.nodes[edgeId].layer).toBe(DEFAULT_LAYER_ID)
  })

  it('refuses to remove the default layer', () => {
    // Everything needs somewhere to land.
    const { doc } = docWithRailing()
    expect(removeLayer(doc, DEFAULT_LAYER_ID)).toBe(doc)
  })
})

describe('assignLayer', () => {
  it('moves a node between layers', () => {
    let { doc, id } = docWithRailing()
    doc = addLayer(doc, 'phase-2', 'Phase 2')
    const moved = assignLayer(doc, id, 'phase-2')
    expect(moved.nodes[id].layer).toBe('phase-2')
  })

  it('ignores a layer that does not exist', () => {
    const { doc, id } = docWithRailing()
    expect(assignLayer(doc, id, 'nope')).toBe(doc)
  })
})

describe('migration to v3', () => {
  it('gives an older document layers and puts everything on the default', () => {
    const v2 = {
      schemaVersion: 2,
      nodes: { n1: { id: 'n1', type: 'railingRun', points: [p(0, 0), p(240, 0)] } },
      order: ['n1'],
    }

    const migrated = migrateDocument(v2)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.layers[DEFAULT_LAYER_ID]).toBeDefined()
    expect(migrated.nodes.n1.layer).toBe(DEFAULT_LAYER_ID)
  })

  it('migrates a v1 document all the way through', () => {
    // Chained migrations: v1 had no polylines AND no layers.
    const v1 = {
      schemaVersion: 1,
      nodes: { n1: { id: 'n1', type: 'railingRun', start: p(0, 0), end: p(240, 0) } },
      order: ['n1'],
    }

    const migrated = migrateDocument(v1)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.nodes.n1.points).toEqual([p(0, 0), p(240, 0)])
    expect(migrated.nodes.n1.layer).toBe(DEFAULT_LAYER_ID)
  })

  it('still refuses a document from the future', () => {
    expect(migrateDocument({ schemaVersion: 99, nodes: {}, order: [] })).toBeNull()
  })
})
