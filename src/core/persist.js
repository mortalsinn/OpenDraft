/**
 * Persistence.
 *
 * localStorage for now: a drawing is a few KB of JSON and there is exactly one
 * of them. When documents become multi-file this should move to IndexedDB
 * (AscendOS already uses idb-keyval), but reaching for that now would be
 * ceremony without benefit.
 */

import { createDocument, seedIds } from './doc.js'

const STORAGE_KEY = 'opendraft.document.v1'

/** Write the document. Failures are non-fatal — never lose a drawing to a throw. */
export function saveDocument(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    return true
  } catch (error) {
    // Quota exceeded, private browsing, or storage disabled. The in-memory
    // document is still fine, so let the session continue.
    console.warn('OpenDraft: could not save', error)
    return false
  }
}

/**
 * Read the document back, or a fresh one if there is nothing valid stored.
 *
 * Anything unparseable is discarded rather than thrown, so a corrupt entry
 * cannot leave the app permanently unable to start.
 */
export function loadDocument() {
  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return createDocument()
  }

  if (!raw) return createDocument()

  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.nodes || !Array.isArray(parsed.order)) return createDocument()
    if (parsed.schemaVersion !== 1) return createDocument()

    // Critical: move the id counter past everything loaded, or the next node
    // drawn silently overwrites an existing one.
    seedIds(parsed)
    return parsed
  } catch {
    return createDocument()
  }
}

export function clearDocument() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing useful to do */
  }
}

export { STORAGE_KEY }
