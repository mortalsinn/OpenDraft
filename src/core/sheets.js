/**
 * Sheets and viewports.
 *
 * A drawing and a drawing SET are different things. Up to now the document
 * exported as one page showing everything at whatever scale happened to fit.
 * A real submission is several sheets, each showing a chosen part of the model
 * at a chosen scale, with a title block that says which sheet you are holding.
 *
 * A viewport is a window onto the SAME model — never a copy. Change the
 * geometry and every sheet showing it updates, which is the entire reason
 * viewports exist rather than exporting each view separately.
 */

import { POINTS_PER_INCH, PAGE_SIZES } from './pdf.js'
import { pointsPerWorldInch, ARCHITECTURAL_SCALES } from './plan.js'

export const SHEET_SIZES = PAGE_SIZES

/**
 * Title block templates.
 *
 * `fields` are drawn from the sheet's own values, so a template is a layout
 * and not a fixed set of words.
 */
export const TITLE_BLOCK_TEMPLATES = {
  standard: {
    id: 'standard',
    name: 'Standard',
    height: 108,
    fields: [
      { key: 'projectName', size: 13, x: 8, y: 86 },
      { key: 'sheetTitle', size: 10, x: 8, y: 68 },
      { key: 'scaleLabel', size: 8, x: 8, y: 54, prefix: 'Scale ' },
      { key: 'date', size: 8, x: 8, y: 42, prefix: 'Date ' },
      { key: 'drawnBy', size: 8, x: 8, y: 30, prefix: 'Drawn by ' },
      { key: 'sheetNumber', size: 16, x: 460, y: 40, prefix: 'Sheet ' },
    ],
  },

  minimal: {
    id: 'minimal',
    name: 'Minimal',
    height: 54,
    fields: [
      { key: 'projectName', size: 10, x: 8, y: 32 },
      { key: 'sheetTitle', size: 8, x: 8, y: 18 },
      { key: 'scaleLabel', size: 8, x: 300, y: 18, prefix: 'Scale ' },
      { key: 'sheetNumber', size: 11, x: 460, y: 22, prefix: 'Sheet ' },
    ],
  },
}

export const TEMPLATE_LIST = Object.values(TITLE_BLOCK_TEMPLATES)

let nextSheetId = 1
export function makeSheetId() {
  return `sheet${nextSheetId++}`
}

/** Push the counter past a loaded document, as with node ids. */
export function seedSheetIds(doc) {
  let highest = 0
  for (const id of Object.keys(doc.sheets ?? {})) {
    const digits = Number(String(id).replace(/^\D+/, ''))
    if (Number.isFinite(digits)) highest = Math.max(highest, digits)
  }
  nextSheetId = highest + 1
}

export function createSheet(id, overrides = {}) {
  return {
    id,
    name: 'Sheet',
    sheetTitle: 'Plan',
    sheetNumber: 'A-1',
    size: 'letter',
    template: 'standard',
    viewports: [],
    ...overrides,
  }
}

/**
 * A window onto the model.
 *
 * `centre` is the model point shown at the middle of the frame, and `scale` is
 * an architectural scale — never an arbitrary ratio, because a viewport nobody
 * can measure with a ruler is not a drawing.
 */
export function createViewport(overrides = {}) {
  return {
    x: 36,
    y: 150,
    width: 540,
    height: 500,
    centre: { x: 0, y: 0, z: 0 },
    inchesPerFoot: 0.25,
    /** Layers hidden in THIS viewport only, so one model serves several views. */
    hiddenLayers: [],
    ...overrides,
  }
}

/**
 * The model→sheet transform for a viewport.
 *
 * Returns both the mapping and the frame, so callers can clip to exactly what
 * the viewport shows.
 */
export function viewportTransform(viewport) {
  const factor = pointsPerWorldInch(viewport.inchesPerFoot)
  const midX = viewport.x + viewport.width / 2
  const midY = viewport.y + viewport.height / 2

  return {
    factor,
    frame: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
    toSheet: (point) => [
      midX + (point.x - viewport.centre.x) * factor,
      midY + (point.y - viewport.centre.y) * factor,
    ],
  }
}

/** The scale entry matching a viewport, for printing in the title block. */
export function scaleLabelFor(inchesPerFoot) {
  const match = ARCHITECTURAL_SCALES.find(
    (scale) => Math.abs(scale.inchesPerFoot - inchesPerFoot) < 1e-9,
  )
  return match ? match.label : `${inchesPerFoot}" = 1'-0"`
}

/**
 * How much of the model a viewport can show, in inches.
 * Used to frame a viewport onto existing geometry.
 */
export function viewportCoverage(viewport) {
  const factor = pointsPerWorldInch(viewport.inchesPerFoot)
  return { width: viewport.width / factor, height: viewport.height / factor }
}

/**
 * Choose a scale and centre so a viewport frames the given bounds.
 *
 * Picks the largest standard scale that fits, for the same reason the single
 * plan export does: a sheet is only useful if it can be measured.
 */
export function frameBounds(viewport, bounds) {
  if (!bounds) return viewport

  for (const scale of ARCHITECTURAL_SCALES) {
    const factor = pointsPerWorldInch(scale.inchesPerFoot)
    if (bounds.width * factor <= viewport.width && bounds.height * factor <= viewport.height) {
      return {
        ...viewport,
        inchesPerFoot: scale.inchesPerFoot,
        centre: {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
          z: 0,
        },
      }
    }
  }

  const smallest = ARCHITECTURAL_SCALES[ARCHITECTURAL_SCALES.length - 1]
  return {
    ...viewport,
    inchesPerFoot: smallest.inchesPerFoot,
    centre: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: 0 },
  }
}

export { POINTS_PER_INCH }
