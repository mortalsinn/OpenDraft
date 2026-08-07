import { describe, it, expect } from 'vitest'
import {
  createSheet,
  createViewport,
  viewportTransform,
  scaleLabelFor,
  frameBounds,
  viewportCoverage,
  TITLE_BLOCK_TEMPLATES,
  TEMPLATE_LIST,
} from './sheets.js'
import { renderSheet, exportSheetSet } from './sheetRender.js'
import { createDocument, addNode, defaultSheets } from './doc.js'
import { documentBounds } from './plan.js'
import { updateLayer, addLayer, DEFAULT_LAYER_ID } from './layers.js'

const p = (x, y, z = 0) => ({ x, y, z })

function docWithGeometry() {
  let doc = createDocument()
  doc = addNode(doc, 'slab', { points: [p(0, 0), p(240, 0), p(240, 120), p(0, 120)] })
  doc = addNode(doc, 'railingRun', { points: [p(0, 0), p(240, 0)] })
  return doc
}

describe('viewportTransform', () => {
  const viewport = createViewport({ x: 100, y: 100, width: 400, height: 300, centre: p(50, 50) })

  it('puts the viewport centre in the middle of the frame', () => {
    const { toSheet } = viewportTransform(viewport)
    expect(toSheet(p(50, 50))).toEqual([300, 250])
  })

  it('scales the model by the architectural scale', () => {
    // 1/4" = 1'-0" means 1.5 points per model inch.
    const { toSheet, factor } = viewportTransform({ ...viewport, inchesPerFoot: 0.25 })
    expect(factor).toBeCloseTo(1.5, 9)

    const [x] = toSheet(p(150, 50))
    expect(x).toBeCloseTo(300 + 100 * 1.5, 6)
  })

  it('reports the frame so callers can clip to it', () => {
    expect(viewportTransform(viewport).frame).toEqual({ x: 100, y: 100, width: 400, height: 300 })
  })
})

describe('frameBounds', () => {
  it('picks the largest standard scale that fits', () => {
    const viewport = createViewport({ width: 540, height: 500 })
    const framed = frameBounds(viewport, { minX: 0, minY: 0, maxX: 240, maxY: 120, width: 240, height: 120 })

    const coverage = viewportCoverage(framed)
    expect(coverage.width).toBeGreaterThanOrEqual(240)
    expect(coverage.height).toBeGreaterThanOrEqual(120)
  })

  it('centres on what it is framing', () => {
    const framed = frameBounds(createViewport(), {
      minX: 100, minY: 200, maxX: 300, maxY: 400, width: 200, height: 200,
    })
    expect(framed.centre).toMatchObject({ x: 200, y: 300 })
  })

  it('never invents an off-book scale for something enormous', () => {
    // A viewport nobody can measure with a ruler is not a drawing.
    const framed = frameBounds(createViewport(), {
      minX: 0, minY: 0, maxX: 1e6, maxY: 1e6, width: 1e6, height: 1e6,
    })
    expect(scaleLabelFor(framed.inchesPerFoot)).toContain('1\'-0"')
  })

  it('leaves the viewport alone with nothing to frame', () => {
    const viewport = createViewport()
    expect(frameBounds(viewport, null)).toBe(viewport)
  })
})

describe('title block templates', () => {
  it('gives every template an id matching its key, a height and fields', () => {
    for (const [key, template] of Object.entries(TITLE_BLOCK_TEMPLATES)) {
      expect(template.id).toBe(key)
      expect(template.height).toBeGreaterThan(0)
      expect(template.fields.length).toBeGreaterThan(0)
    }
  })

  it('drives every field from a sheet value rather than fixed words', () => {
    for (const template of TEMPLATE_LIST) {
      for (const field of template.fields) expect(field.key).toBeTruthy()
    }
  })
})

describe('renderSheet', () => {
  const doc = docWithGeometry()

  it('draws the geometry, the frame and the title block', () => {
    const sheet = createSheet('s1', {
      sheetTitle: 'Deck plan',
      sheetNumber: 'A-2',
      viewports: [frameBounds(createViewport(), documentBounds(doc))],
    })

    const stream = renderSheet(doc, sheet, { projectName: 'Elm St', date: '2026-08-07' }).toContentStream()

    expect(stream).toContain('Deck plan')
    expect(stream).toContain('A-2')
    expect(stream).toContain('Elm St')
    expect(stream).toContain('W n') // the viewport clip
    expect(stream.split('\n').filter((l) => l.endsWith(' l S')).length).toBeGreaterThan(3)
  })

  it('balances every clip with a restore, so it cannot leak onto the sheet', () => {
    // An unbalanced clip would silently swallow the title block.
    const sheet = createSheet('s1', { viewports: [createViewport(), createViewport({ x: 300 })] })
    const stream = renderSheet(doc, sheet, {}).toContentStream()

    const saves = (stream.match(/^q$/gm) ?? []).length
    const restores = (stream.match(/^Q$/gm) ?? []).length
    expect(saves).toBe(2)
    expect(restores).toBe(saves)
  })

  it('says "As noted" when viewports disagree about scale', () => {
    // No single number would be honest.
    const sheet = createSheet('s1', {
      viewports: [
        createViewport({ inchesPerFoot: 0.25 }),
        createViewport({ x: 300, inchesPerFoot: 0.5 }),
      ],
    })
    expect(renderSheet(doc, sheet, {}).toContentStream()).toContain('As noted')
  })

  it('hides a layer in one viewport without hiding it in the others', () => {
    // One model, several views — the whole reason viewports beat exporting
    // each view as its own drawing.
    let withLayer = addLayer(doc, 'guard', 'Guard')
    withLayer = addNode(withLayer, 'railingRun', { points: [p(0, 200), p(240, 200)], layer: 'guard' })

    const shown = createSheet('s1', { viewports: [createViewport()] })
    const hidden = createSheet('s2', { viewports: [createViewport({ hiddenLayers: ['guard'] })] })

    const shownLines = renderSheet(withLayer, shown, {}).toContentStream().split('\n').length
    const hiddenLines = renderSheet(withLayer, hidden, {}).toContentStream().split('\n').length
    expect(hiddenLines).toBeLessThan(shownLines)
  })
})

describe('exportSheetSet', () => {
  it('produces one page per sheet', () => {
    const doc = { ...docWithGeometry(), ...defaultSheets() }
    const second = createSheet('sheet2', { sheetNumber: 'A-2', viewports: [createViewport()] })

    const set = exportSheetSet(
      { ...doc, sheets: { ...doc.sheets, sheet2: second }, sheetOrder: [...doc.sheetOrder, 'sheet2'] },
      { projectName: 'Elm St' },
    )

    expect(set.sheetCount).toBe(2)
    expect(set.pdf).toContain('/Count 2')
    expect(set.pdf.startsWith('%PDF')).toBe(true)
  })

  it('returns null when there are no sheets to render', () => {
    expect(exportSheetSet({ ...createDocument(), sheets: {}, sheetOrder: [] }, {})).toBeNull()
  })

  it('is deterministic', () => {
    const doc = docWithGeometry()
    const meta = { projectName: 'Elm St', date: '2026-08-07' }
    expect(exportSheetSet(doc, meta).pdf).toBe(exportSheetSet(doc, meta).pdf)
  })
})
