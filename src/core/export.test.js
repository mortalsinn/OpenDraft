import { describe, it, expect } from 'vitest'
import { buildPdf, PdfPage, PAGE_SIZES } from './pdf.js'
import {
  chooseScale,
  documentBounds,
  pointsPerWorldInch,
  renderPlan,
  exportPlanPdf,
  ARCHITECTURAL_SCALES,
} from './plan.js'
import { buildHandoff, validateHandoff, HANDOFF_VERSION } from './handoff.js'
import { createDocument, addNode } from './doc.js'

const p = (x, y, z = 0) => ({ x, y, z })

function sampleDoc() {
  let doc = createDocument()
  doc = addNode(doc, 'railingRun', { points: [p(0, 0), p(240, 0)] })
  doc = addNode(doc, 'slab', { points: [p(0, 0), p(144, 0), p(144, 120), p(0, 120)] })
  doc = addNode(doc, 'stairRun', { points: [p(0, 0), p(100, 0)], totalRise: 108 })
  return doc
}

describe('buildPdf', () => {
  it('produces a structurally valid document', () => {
    const page = new PdfPage().line(0, 0, 100, 100).text(10, 10, 'Hello')
    const pdf = buildPdf([page])

    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Type/Catalog')
    expect(pdf).toContain('/Type/Page')
    expect(pdf).toContain('/BaseFont/Helvetica')
  })

  it('writes cross-reference offsets that actually point at their objects', () => {
    // Readers reject a PDF whose xref is wrong, and the failure is opaque, so
    // this checks the offsets land on the object headers they claim to.
    const pdf = buildPdf([new PdfPage().line(0, 0, 10, 10)])

    const xrefStart = Number(pdf.match(/startxref\n(\d+)/)[1])
    expect(pdf.slice(xrefStart, xrefStart + 4)).toBe('xref')

    const entries = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(entries.length).toBeGreaterThan(0)

    entries.forEach((offset, i) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${i + 1} 0 obj`))
    })
  })

  it('declares a stream length matching the actual stream', () => {
    const page = new PdfPage().line(0, 0, 100, 100)
    const pdf = buildPdf([page])

    const declared = Number(pdf.match(/<<\/Length (\d+)>>/)[1])
    const stream = pdf.match(/stream\n([\s\S]*?)\nendstream/)[1]
    expect(stream.length).toBe(declared)
  })

  it('references the Info dictionary indirectly, as the spec requires', () => {
    // An inline dictionary here is a violation that readers repair silently.
    // Ghostscript reports it; others may not, and "silently repaired" is not
    // something to rely on for a document somebody builds from.
    const pdf = buildPdf([new PdfPage().line(0, 0, 1, 1)], { title: 'Sheet' })

    expect(pdf).toMatch(/\/Info \d+ 0 R>>/)
    expect(pdf).not.toMatch(/\/Info<</)
    expect(pdf).toContain('/Title (Sheet)')
  })

  it('escapes characters that would end a PDF string early', () => {
    const pdf = buildPdf([new PdfPage().text(0, 0, 'a (b) \\ c')])
    expect(pdf).toContain('(a \\(b\\) \\\\ c)')
  })

  it('folds typographic punctuation into WinAnsi rather than dropping it', () => {
    // An em dash at its Unicode code point silently vanishes from the sheet,
    // which is how "Deck — structure only" prints with a gap and nobody
    // notices until it is on paper.
    const pdf = buildPdf([new PdfPage().text(0, 0, 'Deck — structure 45°')])
    expect(pdf).toContain(String.fromCharCode(0x97))
    expect(pdf).toContain(String.fromCharCode(0xb0))
  })

  it('substitutes a visible placeholder for anything unrepresentable', () => {
    // A visible '?' is a bug someone reports; a silent gap is one that ships.
    const pdf = buildPdf([new PdfPage().text(0, 0, 'a 中 b')])
    expect(pdf).toContain('(a ? b)')
  })

  it('handles multiple pages', () => {
    const pdf = buildPdf([new PdfPage().line(0, 0, 1, 1), new PdfPage().line(0, 0, 2, 2)])
    expect(pdf).toContain('/Count 2')
    expect([...pdf.matchAll(/\/Type\/Page[^s]/g)]).toHaveLength(2)
  })
})

describe('scale selection', () => {
  it('picks the largest standard scale that fits', () => {
    // A 20' run on a letter sheet should comfortably take 1/4" scale or better.
    const bounds = { width: 240, height: 120, minX: 0, minY: 0, maxX: 240, maxY: 120 }
    const scale = chooseScale(bounds, { width: 540, height: 648 })

    expect(scale.inchesPerFoot).toBeGreaterThanOrEqual(0.25)
    expect(bounds.width * pointsPerWorldInch(scale.inchesPerFoot)).toBeLessThanOrEqual(540)
  })

  it('never invents an off-book ratio for a huge drawing', () => {
    // A drawing nobody can measure with a ruler is worse than a small one.
    const massive = { width: 100000, height: 100000 }
    const scale = chooseScale(massive, { width: 540, height: 648 })
    expect(ARCHITECTURAL_SCALES).toContain(scale)
  })

  it('falls back sanely for an empty drawing', () => {
    expect(chooseScale(null, { width: 540, height: 648 })).toBeDefined()
  })
})

describe('documentBounds', () => {
  it('brackets all the geometry', () => {
    const bounds = documentBounds(sampleDoc())
    expect(bounds.minX).toBe(0)
    expect(bounds.maxX).toBe(240)
    expect(bounds.maxY).toBe(120)
  })

  it('is null for an empty document', () => {
    expect(documentBounds(createDocument())).toBeNull()
  })
})

describe('renderPlan', () => {
  it('draws geometry, a title block and the takeoff on one sheet', () => {
    const { page, scale } = renderPlan(sampleDoc(), { projectName: 'Deck at 14 Elm', date: '2026-08-07' })
    const stream = page.toContentStream()

    expect(stream).toContain('Deck at 14 Elm')
    expect(stream).toContain(`Scale ${scale.label}`.replace(/([\\()])/g, '\\$1'))
    expect(stream).toContain('2026-08-07')
    expect(stream).toContain('Takeoff')
    expect(stream.split('\n').filter((l) => l.endsWith(' l S')).length).toBeGreaterThan(3)
  })

  it('is deterministic — the same document exports identical bytes', () => {
    // Nothing may read the clock, or the output cannot be diffed or cached.
    const doc = sampleDoc()
    const options = { projectName: 'Repeatable', date: '2026-08-07' }
    expect(exportPlanPdf(doc, options).pdf).toBe(exportPlanPdf(doc, options).pdf)
  })

  it('renders an empty document without throwing', () => {
    expect(() => renderPlan(createDocument())).not.toThrow()
  })

  it('fits the drawing inside the sheet', () => {
    const { page } = renderPlan(sampleDoc(), {})
    const sheet = PAGE_SIZES.letter

    const coords = [...page.toContentStream().matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]/g)]
    expect(coords.length).toBeGreaterThan(0)
    for (const [, x, y] of coords) {
      expect(Number(x)).toBeGreaterThanOrEqual(0)
      expect(Number(x)).toBeLessThanOrEqual(sheet.width)
      expect(Number(y)).toBeGreaterThanOrEqual(0)
      expect(Number(y)).toBeLessThanOrEqual(sheet.height)
    }
  })
})

describe('buildHandoff', () => {
  it('carries quantities and never money', () => {
    const handoff = buildHandoff(sampleDoc(), { projectName: 'Deck', exportedAt: '2026-08-07T00:00:00Z' })

    expect(handoff.handoffVersion).toBe(HANDOFF_VERSION)
    expect(handoff.source).toBe('opendraft')
    expect(handoff.lines.length).toBeGreaterThan(0)

    // Pricing belongs to AscendOS. Anything money-shaped here is a leak.
    const serialised = JSON.stringify(handoff)
    for (const word of ['price', 'cost', 'margin', 'markup', 'total$']) {
      expect(serialised.toLowerCase()).not.toContain(word)
    }
  })

  it('rounds counts to whole units', () => {
    const handoff = buildHandoff(sampleDoc(), {})
    for (const line of handoff.lines.filter((l) => l.unit === 'ea')) {
      expect(Number.isInteger(line.quantity)).toBe(true)
    }
  })

  it('shows its working, so a number can be traced back', () => {
    const handoff = buildHandoff(sampleDoc(), {})
    const run = handoff.objects.find((o) => o.type === 'railingRun')

    expect(run.posts).toBeGreaterThan(0)
    expect(run.pickets).toBeGreaterThan(0)
    expect(run.clearGap).toBeGreaterThan(0)
  })

  it('passes code issues through rather than hiding them', () => {
    let doc = createDocument()
    doc = addNode(doc, 'stairRun', { points: [p(0, 0), p(100, 0)], totalRise: 108, treadDepth: 8 })

    const handoff = buildHandoff(doc, {})
    expect(handoff.issues.some((i) => i.code === 'TREAD-MIN')).toBe(true)
  })

  it('is deterministic', () => {
    const doc = sampleDoc()
    const meta = { projectName: 'X', exportedAt: '2026-08-07T00:00:00Z' }
    expect(JSON.stringify(buildHandoff(doc, meta))).toBe(JSON.stringify(buildHandoff(doc, meta)))
  })
})

describe('validateHandoff', () => {
  it('accepts a well-formed handoff', () => {
    expect(validateHandoff(buildHandoff(sampleDoc(), {}))).toEqual([])
  })

  it('catches a negative or non-numeric quantity before it reaches the estimator', () => {
    const bad = { handoffVersion: HANDOFF_VERSION, lines: [{ sku: 'POST', quantity: -3 }] }
    expect(validateHandoff(bad)).toContain('POST: negative quantity')

    const worse = { handoffVersion: HANDOFF_VERSION, lines: [{ sku: 'PICKET', quantity: NaN }] }
    expect(validateHandoff(worse)).toContain('PICKET: quantity is not a number')
  })

  it('catches a version it does not understand', () => {
    expect(validateHandoff({ handoffVersion: 99, lines: [] })).toHaveLength(1)
  })
})
