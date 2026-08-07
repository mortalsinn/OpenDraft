import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listDrawings,
  saveDrawing,
  loadDrawing,
  deleteDrawing,
  duplicateDrawing,
  toFile,
  fromFile,
  FILE_FORMAT,
  FILE_VERSION,
  INDEX_KEY,
} from './library.js'
import { createDocument, addNode, SCHEMA_VERSION } from './doc.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A minimal in-memory localStorage, so the tests do not need a browser. */
function fakeStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    _store: store,
  }
}

function docWithGeometry() {
  return addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)] })
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage()
})

describe('saving and listing', () => {
  it('stores a drawing and indexes it', () => {
    const entry = saveDrawing(null, 'Elm St deck', docWithGeometry(), '2026-08-07T10:00:00Z')

    expect(entry.id).toBeTruthy()
    expect(listDrawings()).toHaveLength(1)
    expect(listDrawings()[0].name).toBe('Elm St deck')
  })

  it('keeps several drawings apart', () => {
    saveDrawing('a', 'First', docWithGeometry(), '2026-08-07T10:00:00Z')
    saveDrawing('b', 'Second', createDocument(), '2026-08-07T11:00:00Z')

    expect(listDrawings()).toHaveLength(2)
    expect(Object.keys(loadDrawing('a').nodes)).toHaveLength(1)
    expect(Object.keys(loadDrawing('b').nodes)).toHaveLength(0)
  })

  it('lists the most recently touched first', () => {
    saveDrawing('old', 'Old', createDocument(), '2026-08-01T10:00:00Z')
    saveDrawing('new', 'New', createDocument(), '2026-08-07T10:00:00Z')
    expect(listDrawings()[0].id).toBe('new')
  })

  it('updates in place rather than duplicating on re-save', () => {
    saveDrawing('a', 'First', createDocument(), '2026-08-07T10:00:00Z')
    saveDrawing('a', 'Renamed', createDocument(), '2026-08-07T12:00:00Z')

    expect(listDrawings()).toHaveLength(1)
    expect(listDrawings()[0].name).toBe('Renamed')
  })
})

describe('loading defensively', () => {
  it('returns null for a drawing that is not there', () => {
    // Null rather than an empty document — handing back a blank that then gets
    // saved over the real one would destroy work.
    expect(loadDrawing('missing')).toBeNull()
  })

  it('returns null for an unreadable entry instead of throwing', () => {
    localStorage.setItem('opendraft.drawing.broken', '{not json')
    expect(loadDrawing('broken')).toBeNull()
  })

  it('survives a corrupt index', () => {
    // Losing one drawing is bad; losing the ability to open ANY is
    // unrecoverable without a console.
    localStorage.setItem(INDEX_KEY, 'garbage')
    expect(listDrawings()).toEqual([])
  })

  it('migrates an older document on load', () => {
    localStorage.setItem(
      'opendraft.drawing.old',
      JSON.stringify({
        schemaVersion: 1,
        nodes: { n1: { id: 'n1', type: 'railingRun', start: p(0, 0), end: p(240, 0) } },
        order: ['n1'],
      }),
    )

    const loaded = loadDrawing('old')
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
    expect(loaded.nodes.n1.points).toEqual([p(0, 0), p(240, 0)])
  })

  it('does not fall over when storage itself throws', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('disabled') },
      setItem: () => { throw new Error('disabled') },
      removeItem: () => {},
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(listDrawings()).toEqual([])
    expect(loadDrawing('a')).toBeNull()
    expect(saveDrawing(null, 'x', createDocument(), 'now')).toBeNull()

    warn.mockRestore()
  })
})

describe('delete and duplicate', () => {
  it('removes a drawing and its index entry', () => {
    saveDrawing('a', 'First', docWithGeometry(), 'now')
    deleteDrawing('a')

    expect(listDrawings()).toEqual([])
    expect(loadDrawing('a')).toBeNull()
  })

  it('copies a drawing under a new name and id', () => {
    saveDrawing('a', 'Original', docWithGeometry(), 'now')
    const copy = duplicateDrawing('a', 'Copy', 'later')

    expect(copy.id).not.toBe('a')
    expect(listDrawings()).toHaveLength(2)
    expect(Object.keys(loadDrawing(copy.id).nodes)).toHaveLength(1)
  })

  it('refuses to duplicate something that is not there', () => {
    expect(duplicateDrawing('missing', 'Copy', 'now')).toBeNull()
  })
})

describe('file interchange', () => {
  it('round-trips a drawing through a file', () => {
    const doc = docWithGeometry()
    const file = toFile(doc, { name: 'Elm St', exportedAt: '2026-08-07T00:00:00Z' })
    const back = fromFile(JSON.parse(JSON.stringify(file)))

    expect(back.error).toBeUndefined()
    expect(back.name).toBe('Elm St')
    expect(Object.keys(back.doc.nodes)).toHaveLength(1)
  })

  it('versions the FILE separately from the document schema', () => {
    // So the drawing model can churn without every exported file becoming
    // unreadable.
    const file = toFile(createDocument(), {})
    expect(file.fileVersion).toBe(FILE_VERSION)
    expect(file.documentSchema).toBe(SCHEMA_VERSION)
    expect(file.format).toBe(FILE_FORMAT)
  })

  it('refuses a file from a newer version, with a reason', () => {
    const result = fromFile({ format: FILE_FORMAT, fileVersion: 99, doc: { nodes: {} } })
    expect(result.error).toContain('newer version')
  })

  it('refuses something that is not a drawing at all', () => {
    expect(fromFile({ hello: 'world' }).error).toBeTruthy()
    expect(fromFile(null).error).toBeTruthy()
    expect(fromFile({ format: FILE_FORMAT, fileVersion: 1 }).error).toBeTruthy()
  })

  it('migrates an old document arriving in a file', () => {
    const result = fromFile({
      format: FILE_FORMAT,
      fileVersion: 1,
      name: 'Legacy',
      doc: {
        schemaVersion: 1,
        nodes: { n1: { id: 'n1', type: 'railingRun', start: p(0, 0), end: p(120, 0) } },
        order: ['n1'],
      },
    })

    expect(result.error).toBeUndefined()
    expect(result.doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
