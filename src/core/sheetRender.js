/**
 * Rendering a sheet set to PDF.
 *
 * Kept apart from plan.js because the two answer different questions. plan.js
 * makes ONE page showing everything at whatever scale fits — the quick export.
 * This makes a drawing SET: several sheets, each framing a chosen part of the
 * model at a chosen scale.
 */

import { PdfPage, buildPdf, POINTS_PER_INCH, PAGE_SIZES } from './pdf.js'
import { listSegments, listNodes, computeTakeoff } from './doc.js'
import { resolveDimension } from './dimension.js'
import { stairPlanLines } from './stairs.js'
import { hatchRegion, lineweightInches } from './hatch.js'
import { layerOf } from './layers.js'
import { formatLength } from './units.js'
import {
  TITLE_BLOCK_TEMPLATES,
  viewportTransform,
  scaleLabelFor,
  SHEET_SIZES,
} from './sheets.js'

const MARGIN = 18

/** Is this node visible in this particular viewport? */
function visibleInViewport(doc, node, viewport) {
  const layer = layerOf(doc, node)
  if (layer && layer.visible === false) return false
  // A viewport may hide layers the rest of the set still shows — one model,
  // several views.
  return !viewport.hiddenLayers?.includes(layer?.id)
}

/** Draw everything one viewport shows, clipped to its frame. */
function drawViewport(page, doc, viewport) {
  const { toSheet, frame } = viewportTransform(viewport)

  page.save()
  page.clipRect(frame.x, frame.y, frame.width, frame.height)

  // Hatch under everything else.
  page.setLineWidth(0.4).setStroke(0.5, 0.5, 0.5)
  for (const node of listNodes(doc)) {
    if (node.type !== 'slab' || !node.hatch || node.hatch === 'none') continue
    if (!visibleInViewport(doc, node, viewport)) continue

    for (const [from, to] of hatchRegion(node.points, node.hatch, {
      scale: node.hatchScale ?? 1,
      angleOffset: node.hatchAngle ?? 0,
    })) {
      page.line(...toSheet(from), ...toSheet(to))
    }
  }

  // Geometry, at each layer's lineweight.
  page.setStroke(0, 0, 0)
  for (const segment of listSegments(doc)) {
    const node = doc.nodes[segment.id]
    if (!node || node.type === 'stairRun') continue
    if (!visibleInViewport(doc, node, viewport)) continue

    page.setLineWidth(lineweightInches(layerOf(doc, node)?.lineweight) * POINTS_PER_INCH)
    page.line(...toSheet(segment.start), ...toSheet(segment.end))
  }

  // Stairs draw as treads, not as the line that defines them.
  page.setLineWidth(0.75)
  for (const node of listNodes(doc)) {
    if (node.type !== 'stairRun' || !visibleInViewport(doc, node, viewport)) continue
    for (const [from, to] of stairPlanLines(node)) {
      page.line(...toSheet(from), ...toSheet(to))
    }
  }

  // Dimensions, lighter so they read as annotation.
  page.setLineWidth(0.5)
  for (const node of listNodes(doc)) {
    if (node.type !== 'dimension' || !visibleInViewport(doc, node, viewport)) continue

    const resolved = resolveDimension(doc, node)
    if (!resolved) continue

    const [fx, fy] = toSheet(resolved.lineFrom)
    const [tx, ty] = toSheet(resolved.lineTo)
    page.line(fx, fy, tx, ty)
    page.line(...toSheet(resolved.from), fx, fy)
    page.line(...toSheet(resolved.to), tx, ty)

    const [mx, my] = toSheet(resolved.mid)
    const angle = Math.atan2(ty - fy, tx - fx)
    // Never let a dimension read upside down.
    const upright = Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle
    page.rotatedText(mx + 2, my + 3, upright, formatLength(resolved.length), 7)
  }

  // Notes.
  for (const node of listNodes(doc)) {
    if (node.type !== 'note' || !node.position) continue
    if (!visibleInViewport(doc, node, viewport)) continue
    const [x, y] = toSheet(node.position)
    page.text(x + 4, y, node.text, 7)
  }

  page.restore()

  // The frame itself, drawn after the clip is released so it is never clipped
  // by its own boundary.
  page.setLineWidth(0.5).setStroke(0.6, 0.6, 0.6)
  page.rect(frame.x, frame.y, frame.width, frame.height)
}

function drawTitleBlock(page, sheet, values) {
  const template = TITLE_BLOCK_TEMPLATES[sheet.template] ?? TITLE_BLOCK_TEMPLATES.standard
  const size = SHEET_SIZES[sheet.size] ?? SHEET_SIZES.letter

  page.setStroke(0, 0, 0).setLineWidth(1)
  page.rect(MARGIN, MARGIN, size.width - MARGIN * 2, size.height - MARGIN * 2)
  page.line(MARGIN, MARGIN + template.height, size.width - MARGIN, MARGIN + template.height)

  page.setFill(0, 0, 0)
  for (const field of template.fields) {
    const value = values[field.key]
    if (value === undefined || value === null || value === '') continue
    page.text(MARGIN + field.x, MARGIN + field.y, `${field.prefix ?? ''}${value}`, field.size)
  }
}

/** Render one sheet. */
export function renderSheet(doc, sheet, meta = {}) {
  const page = new PdfPage()

  for (const viewport of sheet.viewports ?? []) {
    drawViewport(page, doc, viewport)
  }

  const first = sheet.viewports?.[0]
  drawTitleBlock(page, sheet, {
    projectName: meta.projectName ?? 'Untitled',
    sheetTitle: sheet.sheetTitle,
    sheetNumber: sheet.sheetNumber,
    date: meta.date ?? '',
    drawnBy: meta.drawnBy ?? '',
    // With several viewports at different scales, no single number is honest.
    scaleLabel:
      (sheet.viewports?.length ?? 0) > 1
        ? 'As noted'
        : first
          ? scaleLabelFor(first.inchesPerFoot)
          : '',
  })

  return page
}

/**
 * Render the whole set to one PDF.
 *
 * Sheets share a page size because a PDF's pages are declared per page but
 * mixing sizes in a single submission is a way to annoy a plan examiner.
 */
export function exportSheetSet(doc, meta = {}) {
  const sheets = (doc.sheetOrder ?? []).map((id) => doc.sheets?.[id]).filter(Boolean)
  if (!sheets.length) return null

  const pages = sheets.map((sheet) => renderSheet(doc, sheet, meta))

  return {
    pdf: buildPdf(pages, {
      size: sheets[0].size,
      title: meta.projectName ?? 'OpenDraft drawing set',
    }),
    sheetCount: sheets.length,
  }
}

export { computeTakeoff }
