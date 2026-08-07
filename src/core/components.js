/**
 * Components.
 *
 * A component is a definition plus instances of it. Edit the definition once
 * and every instance changes — which is the difference between drawing twelve
 * newel posts and drawing one twelve times.
 *
 * Definition geometry is stored RELATIVE TO ITS OWN ORIGIN, and each instance
 * carries a position and a rotation. Storing world coordinates in the
 * definition would make the second instance a copy rather than a reference,
 * and the whole point would be lost.
 *
 * Rotation is about Z only. Everything this tool draws stands on a floor;
 * a full rotation basis would be three numbers nobody sets and a class of bugs
 * nobody needs yet.
 */

import { nodeVertices, withVertices } from './vertices.js'

let nextDefinitionId = 1
export function makeDefinitionId() {
  return `def${nextDefinitionId++}`
}

/** Push the counter past a loaded document, as with node ids. */
export function seedDefinitionIds(doc) {
  let highest = 0
  for (const id of Object.keys(doc.definitions ?? {})) {
    const digits = Number(String(id).replace(/^\D+/, ''))
    if (Number.isFinite(digits)) highest = Math.max(highest, digits)
  }
  nextDefinitionId = highest + 1
}

/** Rotate a point about the Z axis and translate it. */
export function transformPoint(point, { position, rotation = 0 }) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    x: position.x + point.x * cos - point.y * sin,
    y: position.y + point.x * sin + point.y * cos,
    z: (position.z ?? 0) + (point.z ?? 0),
  }
}

/** Apply a placement to every vertex of a node. */
function transformNode(node, placement) {
  return withVertices(
    node,
    nodeVertices(node).map((vertex) => transformPoint(vertex, placement)),
  )
}

/**
 * The nodes an instance stands for, in world space.
 *
 * Ids are namespaced with the instance id so two instances of the same
 * definition never collide — and so a click on one can be traced back to the
 * instance it belongs to rather than the shared definition.
 */
export function instantiate(doc, instance) {
  const definition = doc.definitions?.[instance.definitionId]
  if (!definition) return []

  const placement = { position: instance.position, rotation: instance.rotation ?? 0 }

  return (definition.order ?? [])
    .map((id) => definition.nodes[id])
    .filter(Boolean)
    .map((node) => ({
      ...transformNode(node, placement),
      id: `${instance.id}/${node.id}`,
      instanceId: instance.id,
      definitionNodeId: node.id,
    }))
}

/**
 * Turn a node into a component definition, leaving an instance in its place.
 *
 * The node's first vertex becomes the definition origin, so a newly made
 * component sits exactly where the geometry already was.
 */
export function extractDefinition(node, name) {
  const vertices = nodeVertices(node)
  if (!vertices.length) return null

  const origin = { ...vertices[0] }
  const localised = transformNode(node, {
    position: { x: -origin.x, y: -origin.y, z: -(origin.z ?? 0) },
    rotation: 0,
  })

  const definitionId = makeDefinitionId()
  const inner = { ...localised, id: `${definitionId}-0` }

  return {
    definition: {
      id: definitionId,
      name,
      nodes: { [inner.id]: inner },
      order: [inner.id],
    },
    origin,
  }
}

/** How many instances reference each definition. */
export function definitionUsage(doc) {
  const counts = {}
  for (const node of Object.values(doc.nodes ?? {})) {
    if (node.type !== 'componentInstance') continue
    counts[node.definitionId] = (counts[node.definitionId] ?? 0) + 1
  }
  return counts
}
