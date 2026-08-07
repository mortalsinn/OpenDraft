/**
 * Reading and writing a node's vertices.
 *
 * Nodes store their geometry in one of three shapes — a `points` polyline, a
 * `start`/`end` pair, or a single `position`. Each shape earns its place, but
 * nothing outside this file should have to know which one it is dealing with.
 *
 * Lives in its own module because both the document and the component system
 * need it, and having them import each other for it would be a cycle.
 */

/** The movable vertices of a node, whatever shape it stores them in. */
export function nodeVertices(node) {
  if (!node) return []
  if (Array.isArray(node.points)) return node.points
  if (node.start && node.end) return [node.start, node.end]
  if (node.position) return [node.position]
  return []
}

/** Write vertices back in whatever shape the node uses. */
export function withVertices(node, vertices) {
  if (Array.isArray(node.points)) return { ...node, points: vertices }
  if (node.start && node.end) return { ...node, start: vertices[0], end: vertices[1] }
  if (node.position) return { ...node, position: vertices[0] }
  return node
}
