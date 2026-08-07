/**
 * A very small PDF writer — enough for vector line drawings and text.
 *
 * Written by hand rather than pulled from a library because a plan drawing
 * needs exactly three things: strokes, text in a standard font, and correct
 * page geometry. A general PDF library is a megabyte of code and a font
 * pipeline to get those, and the output here can be asserted on in tests
 * byte for byte.
 *
 * Uses the base-14 Helvetica, which every reader has, so nothing is embedded.
 */

/** PDF's unit is 1/72", which happily matches typographic points. */
export const POINTS_PER_INCH = 72

export const PAGE_SIZES = {
  letter: { width: 612, height: 792 },
  tabloid: { width: 792, height: 1224 },
  a4: { width: 595, height: 842 },
  a3: { width: 842, height: 1191 },
}

/** Escape the characters that would otherwise end a PDF string. */
function escapeText(text) {
  return String(text).replace(/([\\()])/g, '\\$1')
}

const round = (n) => Math.round(n * 100) / 100

/**
 * Collects drawing operations, then serialises them.
 *
 * The coordinate system is PDF's own: origin bottom-left, Y upward. Callers
 * convert from world space, so this stays a dumb, predictable sink.
 */
export class PdfPage {
  constructor() {
    this.ops = []
  }

  setLineWidth(width) {
    this.ops.push(`${round(width)} w`)
    return this
  }

  /** Stroke colour, as 0–1 components. */
  setStroke(r, g, b) {
    this.ops.push(`${round(r)} ${round(g)} ${round(b)} RG`)
    return this
  }

  setFill(r, g, b) {
    this.ops.push(`${round(r)} ${round(g)} ${round(b)} rg`)
    return this
  }

  line(x1, y1, x2, y2) {
    this.ops.push(`${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`)
    return this
  }

  /** An open polyline through the given points. */
  polyline(points, close = false) {
    if (points.length < 2) return this

    const [first, ...rest] = points
    this.ops.push(`${round(first[0])} ${round(first[1])} m`)
    for (const [x, y] of rest) this.ops.push(`${round(x)} ${round(y)} l`)
    if (close) this.ops.push('h')
    this.ops.push('S')
    return this
  }

  rect(x, y, width, height) {
    this.ops.push(`${round(x)} ${round(y)} ${round(width)} ${round(height)} re S`)
    return this
  }

  text(x, y, content, size = 9) {
    this.ops.push(
      `BT /F1 ${round(size)} Tf ${round(x)} ${round(y)} Td (${escapeText(content)}) Tj ET`,
    )
    return this
  }

  /**
   * Text rotated about its own origin, for dimensions running up the page.
   * Angle in radians.
   */
  rotatedText(x, y, angle, content, size = 9) {
    const cos = round(Math.cos(angle))
    const sin = round(Math.sin(angle))
    this.ops.push(
      `BT /F1 ${round(size)} Tf ${cos} ${sin} ${round(-Math.sin(angle))} ${cos} ${round(x)} ${round(y)} Tm (${escapeText(content)}) Tj ET`,
    )
    return this
  }

  toContentStream() {
    return this.ops.join('\n')
  }
}

/**
 * Serialise pages into a complete PDF document.
 *
 * Byte offsets in the cross-reference table have to be exact or readers reject
 * the file, so the body is assembled while tracking the length of everything
 * written before each object.
 *
 * @returns {string} the document, one character per byte (latin1).
 */
export function buildPdf(pages, { size = 'letter', title = 'OpenDraft' } = {}) {
  const page = PAGE_SIZES[size] ?? PAGE_SIZES.letter
  const objects = []

  const pageCount = pages.length
  // Object numbering: 1 catalog, 2 pages, then per page a page object and a
  // content object, then the font, then the document info.
  const pageObjectIds = pages.map((_, i) => 3 + i * 2)
  const fontId = 3 + pageCount * 2
  const infoId = fontId + 1

  objects.push(`<</Type/Catalog/Pages 2 0 R>>`)
  objects.push(
    `<</Type/Pages/Kids[${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}]/Count ${pageCount}>>`,
  )

  pages.forEach((pdfPage, i) => {
    const contentId = pageObjectIds[i] + 1
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${page.width} ${page.height}]` +
        `/Contents ${contentId} 0 R/Resources<</Font<</F1 ${fontId} 0 R>>>>>>`,
    )

    const stream = pdfPage.toContentStream()
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`)
  })

  objects.push(`<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>`)

  // The trailer's /Info must be an INDIRECT REFERENCE to a real object. An
  // inline dictionary there is a spec violation that readers repair silently —
  // Ghostscript reports it, others may not, and "silently repaired" is not a
  // property to rely on for a document somebody builds from.
  objects.push(`<</Title (${escapeText(title)})/Producer (OpenDraft)/Creator (OpenDraft)>>`)

  let body = `%PDF-1.4\n`
  const offsets = []

  objects.forEach((content, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${content}\nendobj\n`
  })

  const xrefOffset = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  const trailer =
    `trailer\n<</Size ${objects.length + 1}/Root 1 0 R/Info ${infoId} 0 R>>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`

  return body + xref + trailer
}

/** Turn the document string into bytes for download. */
export function pdfToBlob(pdfString) {
  const bytes = new Uint8Array(pdfString.length)
  for (let i = 0; i < pdfString.length; i++) bytes[i] = pdfString.charCodeAt(i) & 0xff
  return new Blob([bytes], { type: 'application/pdf' })
}
