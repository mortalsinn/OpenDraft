/**
 * The drawing library — more than one document per browser.
 *
 * Backed by localStorage, keyed per drawing with a small index alongside.
 * Drawings are a few kilobytes of JSON, so the 5MB budget holds hundreds; when
 * they start carrying images or scanned backgrounds this wants to become
 * IndexedDB, and the shape here is deliberately the same one an async store
 * would expose so that swap stays a small job.
 *
 * Every read is defensive. A corrupt entry must never make the app unopenable
 * — losing one drawing is bad, losing the ability to open ANY drawing is
 * unrecoverable without a console.
 */

import { createDocument, migrateDocument, seedIds, SCHEMA_VERSION } from './doc.js'
import { seedDefinitionIds } from './components.js'
import { seedSheetIds } from './sheets.js'

const INDEX_KEY = 'opendraft.library.index'
const DRAWING_PREFIX = 'opendraft.drawing.'

/** The interchange wrapper. Separate from the document schema on purpose. */
export const FILE_FORMAT = 'opendraft-drawing'
export const FILE_VERSION = 1

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    // Quota, private browsing, storage disabled. The in-memory drawing is
    // still fine, so the session continues.
    console.warn('OpenDraft: could not write', key, error)
    return false
  }
}

/** Every drawing in the library, newest first. */
export function listDrawings() {
  const index = readJson(INDEX_KEY, [])
  if (!Array.isArray(index)) return []

  return [...index].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

let nextDrawingId = 1
function makeDrawingId(existing) {
  const taken = new Set(existing.map((entry) => entry.id))
  while (taken.has(`drawing${nextDrawingId}`)) nextDrawingId++
  return `drawing${nextDrawingId++}`
}

/**
 * Save a drawing. `updatedAt` is supplied by the caller rather than read from
 * the clock here, so the core stays deterministic and testable.
 */
export function saveDrawing(id, name, doc, updatedAt) {
  const index = listDrawings()
  const drawingId = id ?? makeDrawingId(index)

  if (!writeJson(`${DRAWING_PREFIX}${drawingId}`, doc)) return null

  const entry = { id: drawingId, name, updatedAt }
  writeJson(INDEX_KEY, [...index.filter((e) => e.id !== drawingId), entry])

  return entry
}

/**
 * Load a drawing, migrating it forward.
 * Returns null if it is missing or unreadable — the caller decides what to do,
 * which is better than silently handing back an empty document that could then
 * be saved over the real one.
 */
export function loadDrawing(id) {
  const stored = readJson(`${DRAWING_PREFIX}${id}`, null)
  if (!stored?.nodes) return null

  const migrated = migrateDocument(stored)
  if (!migrated) return null

  seedIds(migrated)
  seedDefinitionIds(migrated)
  seedSheetIds(migrated)
  return migrated
}

export function deleteDrawing(id) {
  try {
    localStorage.removeItem(`${DRAWING_PREFIX}${id}`)
  } catch {
    /* nothing useful to do */
  }
  writeJson(INDEX_KEY, listDrawings().filter((entry) => entry.id !== id))
}

/** Copy a drawing under a new name. */
export function duplicateDrawing(id, name, updatedAt) {
  const doc = loadDrawing(id)
  return doc ? saveDrawing(null, name, doc, updatedAt) : null
}

/**
 * Wrap a document for export to a file.
 *
 * The file format is versioned SEPARATELY from the document schema, so the
 * drawing model can churn without every previously exported file becoming
 * unreadable.
 */
export function toFile(doc, meta = {}) {
  return {
    format: FILE_FORMAT,
    fileVersion: FILE_VERSION,
    documentSchema: doc.schemaVersion ?? SCHEMA_VERSION,
    name: meta.name ?? 'Untitled',
    exportedAt: meta.exportedAt ?? null,
    doc,
  }
}

/**
 * Read a file back.
 * @returns {{doc: object, name: string}|{error: string}}
 */
export function fromFile(parsed) {
  if (!parsed || typeof parsed !== 'object') return { error: 'Not a drawing file' }
  if (parsed.format !== FILE_FORMAT) return { error: 'Not an OpenDraft drawing' }
  if (parsed.fileVersion > FILE_VERSION) {
    return { error: `File is from a newer version (${parsed.fileVersion})` }
  }
  if (!parsed.doc?.nodes) return { error: 'File contains no drawing' }

  const migrated = migrateDocument(parsed.doc)
  if (!migrated) return { error: 'Drawing is from an unsupported schema' }

  seedIds(migrated)
  seedDefinitionIds(migrated)
  seedSheetIds(migrated)

  return { doc: migrated, name: parsed.name ?? 'Untitled' }
}

/** Fresh, empty drawing. */
export function blankDrawing() {
  return createDocument()
}

export { INDEX_KEY, DRAWING_PREFIX }
