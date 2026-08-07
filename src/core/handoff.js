/**
 * The AscendOS handoff.
 *
 * This is the seam. OpenDraft does not price anything and does not know what a
 * margin is — it knows what was drawn and how much of it there is. AscendOS
 * owns cost, markup and the quote. So the contract carries QUANTITIES and the
 * evidence behind them, never money.
 *
 * It is versioned separately from the document schema on purpose: the drawing
 * format will churn as the tool grows, and the estimator must not have to care.
 */

import { computeTakeoff, documentIssues, listNodes, NODE_TYPES } from './doc.js'
import { layoutRailing } from './railing.js'
import { layoutStair } from './stairs.js'
import { polygonAreaSquareFeet } from './polygon.js'

/** Bump only when the shape below changes in a way AscendOS must handle. */
export const HANDOFF_VERSION = 1

/**
 * Build the handoff document.
 *
 * @param {object} doc
 * @param {{projectName?: string, drawingId?: string, exportedAt?: string}} meta
 *        `exportedAt` is supplied by the caller rather than read from the clock
 *        so the same drawing always produces identical output — otherwise
 *        nothing downstream can be diffed or cached.
 */
export function buildHandoff(doc, meta = {}) {
  const { projectName = 'Untitled', drawingId = null, exportedAt = null } = meta

  const lines = computeTakeoff(doc).map((line) => ({
    sku: line.sku,
    description: line.description,
    unit: line.unit,
    // Rounded at the boundary: the estimator should never have to decide how
    // many decimal places a picket count has.
    quantity: line.unit === 'ea' ? Math.round(line.quantity) : round(line.quantity, 4),
  }))

  return {
    handoffVersion: HANDOFF_VERSION,
    source: 'opendraft',
    documentSchema: doc.schemaVersion,
    projectName,
    drawingId,
    exportedAt,
    units: 'inches',
    lines,
    objects: listNodes(doc).map(summarise).filter(Boolean),
    issues: documentIssues(doc).map((issue) => ({
      nodeId: issue.nodeId,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    })),
  }
}

/**
 * A per-object record, so the estimator can show its working.
 *
 * Without this the quote is a wall of numbers nobody can audit. With it, a line
 * of 170 pickets can be traced to the run it came from and the spacing that
 * produced it — which is what someone asks when the number looks wrong.
 */
function summarise(node) {
  const definition = NODE_TYPES[node.type]
  if (!definition) return null

  const base = { id: node.id, type: node.type, label: definition.label }

  switch (node.type) {
    case 'railingRun': {
      const layout = layoutRailing(node)
      return {
        ...base,
        runLength: round(layout.runLength, 4),
        posts: layout.posts.length,
        pickets: layout.pickets.length,
        height: node.height,
        clearGap: round(layout.gap, 4),
        closed: !!node.closed,
        corners: node.points?.length ?? 0,
      }
    }

    case 'stairRun': {
      const layout = layoutStair(node)
      return {
        ...base,
        totalRise: node.totalRise,
        risers: layout.riserCount,
        riserHeight: round(layout.riserHeight, 4),
        treads: layout.treadCount,
        treadDepth: node.treadDepth,
        totalRun: round(layout.totalRun, 4),
        width: node.width,
      }
    }

    case 'slab':
      return {
        ...base,
        areaSquareFeet: round(polygonAreaSquareFeet(node.points), 4),
        thickness: node.thickness,
        elevation: node.elevation,
        corners: node.points?.length ?? 0,
      }

    // Edges, dimensions and notes carry no quantities, so they are not part of
    // the estimating record.
    default:
      return null
  }
}

function round(value, places) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Reject anything that would poison the estimator downstream.
 * Returns the problems found; empty means it is safe to send.
 */
export function validateHandoff(handoff) {
  const problems = []

  if (handoff.handoffVersion !== HANDOFF_VERSION) {
    problems.push(`Unexpected handoff version ${handoff.handoffVersion}`)
  }

  for (const line of handoff.lines ?? []) {
    if (!line.sku) problems.push('Line with no SKU')
    if (!Number.isFinite(line.quantity)) problems.push(`${line.sku}: quantity is not a number`)
    if (line.quantity < 0) problems.push(`${line.sku}: negative quantity`)
  }

  return problems
}
