/**
 * Turning a document into a scaled plan sheet.
 *
 * A drawing that says "not to scale" is a sketch. This picks a real
 * architectural scale — the largest one the drawing still fits at — and prints
 * it in the title block, so anything on the sheet can be measured with a
 * ruler and believed.
 */

import { PdfPage, buildPdf, POINTS_PER_INCH, PAGE_SIZES } from './pdf.js'
import { listSegments, listNodes, computeTakeoff, documentIssues } from './doc.js'
import { resolveDimension } from './dimension.js'
import { stairPlanLines } from './stairs.js'
import { hatchRegion, lineweightInches } from './hatch.js'
import { layerOf } from './layers.js'
import { formatLength } from './units.js'

/**
 * Standard architectural scales, as inches on paper per foot of building.
 * Ordered largest (most detail) to smallest, because we want the biggest scale
 * the drawing still fits at.
 */
export const ARCHITECTURAL_SCALES = [
  { label: '1" = 1\'-0"', inchesPerFoot: 1 },
  { label: '3/4" = 1\'-0"', inchesPerFoot: 0.75 },
  { label: '1/2" = 1\'-0"', inchesPerFoot: 0.5 },
  { label: '3/8" = 1\'-0"', inchesPerFoot: 0.375 },
  { label: '1/4" = 1\'-0"', inchesPerFoot: 0.25 },
  { label: '3/16" = 1\'-0"', inchesPerFoot: 0.1875 },
  { label: '1/8" = 1\'-0"', inchesPerFoot: 0.125 },
  { label: '3/32" = 1\'-0"', inchesPerFoot: 0.09375 },
  { label: '1/16" = 1\'-0"', inchesPerFoot: 0.0625 },
]

/** Points on paper per inch of building, at a given architectural scale. */
export function pointsPerWorldInch(inchesPerFoot) {
  return (inchesPerFoot * POINTS_PER_INCH) / 12
}

/** The extent of everything drawable in the document. */
export function documentBounds(doc) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false

  const include = (point) => {
    if (!point) return
    found = true
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  for (const segment of listSegments(doc)) {
    include(segment.start)
    include(segment.end)
  }
  for (const node of listNodes(doc)) {
    if (node.position) include(node.position)

    // A stair occupies its full width and computed run, which is wider than
    // the line that defines it — bound the drawing to what is actually drawn.
    if (node.type === 'stairRun') {
      for (const [from, to] of stairPlanLines(node)) {
        include(from)
        include(to)
      }
    }

    if (node.type === 'dimension') {
      const resolved = resolveDimension(doc, node)
      if (resolved) {
        include(resolved.lineFrom)
        include(resolved.lineTo)
      }
    }
  }

  return found ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } : null
}

/**
 * The largest standard scale at which the drawing fits the drawable area.
 *
 * Returns the smallest scale in the list if nothing fits, rather than inventing
 * an off-book ratio — a drawing at "1:37" cannot be measured by anyone.
 */
export function chooseScale(bounds, drawable) {
  if (!bounds) return ARCHITECTURAL_SCALES[ARCHITECTURAL_SCALES.length - 1]

  for (const scale of ARCHITECTURAL_SCALES) {
    const factor = pointsPerWorldInch(scale.inchesPerFoot)
    if (bounds.width * factor <= drawable.width && bounds.height * factor <= drawable.height) {
      return scale
    }
  }
  return ARCHITECTURAL_SCALES[ARCHITECTURAL_SCALES.length - 1]
}

const MARGIN = 36 // 1/2" all round
const TITLE_BLOCK_HEIGHT = 108

/**
 * Draw the document as a plan sheet.
 *
 * @param {object} doc
 * @param {{size?: string, projectName?: string, drawnBy?: string, date?: string}} options
 *        `date` is passed in rather than read from the clock, so the same
 *        document always produces the same bytes and can be diffed or tested.
 */
export function renderPlan(doc, options = {}) {
  const { size = 'letter', projectName = 'Untitled', drawnBy = '', date = '' } = options
  const sheet = PAGE_SIZES[size] ?? PAGE_SIZES.letter

  const drawable = {
    width: sheet.width - MARGIN * 2,
    height: sheet.height - MARGIN * 2 - TITLE_BLOCK_HEIGHT,
  }

  const bounds = documentBounds(doc)
  const scale = chooseScale(bounds, drawable)
  const factor = pointsPerWorldInch(scale.inchesPerFoot)

  // Centre the drawing in the area above the title block. PDF's Y runs upward,
  // and so does the model's, so this is a translation with no flip.
  const originX = bounds
    ? MARGIN + (drawable.width - bounds.width * factor) / 2 - bounds.minX * factor
    : MARGIN
  const originY = bounds
    ? MARGIN + TITLE_BLOCK_HEIGHT + (drawable.height - bounds.height * factor) / 2 - bounds.minY * factor
    : MARGIN + TITLE_BLOCK_HEIGHT

  const toPage = (point) => [originX + point.x * factor, originY + point.y * factor]

  const page = new PdfPage()

  // Sheet border and title block.
  page.setStroke(0, 0, 0).setLineWidth(1)
  page.rect(MARGIN / 2, MARGIN / 2, sheet.width - MARGIN, sheet.height - MARGIN)
  page.line(MARGIN / 2, MARGIN / 2 + TITLE_BLOCK_HEIGHT, sheet.width - MARGIN / 2, MARGIN / 2 + TITLE_BLOCK_HEIGHT)

  // Hatch first, so geometry lines sit on top of it rather than under.
  page.setLineWidth(0.4).setStroke(0.45, 0.45, 0.45)
  for (const node of listNodes(doc)) {
    if (node.type !== 'slab' || !node.hatch || node.hatch === 'none') continue

    for (const [from, to] of hatchRegion(node.points, node.hatch, {
      scale: node.hatchScale ?? 1,
      angleOffset: node.hatchAngle ?? 0,
    })) {
      const [x1, y1] = toPage(from)
      const [x2, y2] = toPage(to)
      page.line(x1, y1, x2, y2)
    }
  }

  // Geometry.
  page.setLineWidth(1).setStroke(0, 0, 0)
  for (const segment of listSegments(doc)) {
    // A stair's two points describe where it runs, not what it looks like;
    // its real plan representation is drawn below.
    if (doc.nodes[segment.id]?.type === 'stairRun') continue

    // Lineweight comes from the layer, in inches of ink converted to points.
    const layer = layerOf(doc, doc.nodes[segment.id])
    page.setLineWidth(lineweightInches(layer?.lineweight) * POINTS_PER_INCH)

    const [x1, y1] = toPage(segment.start)
    const [x2, y2] = toPage(segment.end)
    page.line(x1, y1, x2, y2)
  }

  // Objects whose plan appearance is more than their defining line.
  page.setLineWidth(0.75)
  for (const node of listNodes(doc)) {
    if (node.type !== 'stairRun') continue
    for (const [from, to] of stairPlanLines(node)) {
      const [x1, y1] = toPage(from)
      const [x2, y2] = toPage(to)
      page.line(x1, y1, x2, y2)
    }
  }

  // Dimensions, in a lighter weight so they read as annotation not structure.
  page.setLineWidth(0.5)
  for (const node of listNodes(doc)) {
    if (node.type !== 'dimension') continue
    const resolved = resolveDimension(doc, node)
    if (!resolved) continue

    const [fx, fy] = toPage(resolved.lineFrom)
    const [tx, ty] = toPage(resolved.lineTo)
    page.line(fx, fy, tx, ty)

    // Extension lines back to what is being measured.
    const [ox, oy] = toPage(resolved.from)
    const [px, py] = toPage(resolved.to)
    page.line(ox, oy, fx, fy)
    page.line(px, py, tx, ty)

    const [mx, my] = toPage(resolved.mid)
    const angle = Math.atan2(ty - fy, tx - fx)
    // Keep text upright — never let a dimension read upside down.
    const upright = Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle
    page.rotatedText(mx + 2, my + 3, upright, formatLength(resolved.length), 7)
  }

  // Notes.
  for (const node of listNodes(doc)) {
    if (node.type !== 'note' || !node.position) continue
    const [x, y] = toPage(node.position)
    page.text(x + 4, y, node.text, 7)
  }

  drawTitleBlock(page, sheet, { projectName, drawnBy, date, scale, doc })

  return { page, scale, bounds }
}

function drawTitleBlock(page, sheet, { projectName, drawnBy, date, scale, doc }) {
  const left = MARGIN / 2 + 8
  let y = MARGIN / 2 + TITLE_BLOCK_HEIGHT - 18

  page.setFill(0, 0, 0)
  page.text(left, y, projectName, 13)
  y -= 14
  page.text(left, y, `Scale ${scale.label}`, 8)
  y -= 11
  if (date) {
    page.text(left, y, `Date ${date}`, 8)
    y -= 11
  }
  if (drawnBy) {
    page.text(left, y, `Drawn by ${drawnBy}`, 8)
    y -= 11
  }
  page.text(left, y, 'OpenDraft', 7)

  // Quantities on the right of the title block — the drawing and its takeoff
  // arriving on the same sheet is the entire point of the tool.
  const right = sheet.width / 2
  let ty = MARGIN / 2 + TITLE_BLOCK_HEIGHT - 18
  page.text(right, ty, 'Takeoff', 9)
  ty -= 12

  for (const line of computeTakeoff(doc).slice(0, 6)) {
    const quantity =
      line.unit === 'in'
        ? formatLength(line.quantity)
        : line.unit === 'sq ft'
          ? `${line.quantity.toFixed(1)} sq ft`
          : `${Math.round(line.quantity)}`
    page.text(right, ty, `${line.description}: ${quantity}`, 7)
    ty -= 10
  }

  // Anything non-compliant is stated on the drawing, not buried in the app.
  const issues = documentIssues(doc).filter((i) => i.severity === 'error')
  if (issues.length) {
    page.text(right + 220, MARGIN / 2 + TITLE_BLOCK_HEIGHT - 18, `${issues.length} code issue(s)`, 8)
  }
}

/** Render and serialise in one step. */
export function exportPlanPdf(doc, options = {}) {
  const { page, scale } = renderPlan(doc, options)
  return {
    pdf: buildPdf([page], { size: options.size, title: options.projectName ?? 'OpenDraft plan' }),
    scale,
  }
}
