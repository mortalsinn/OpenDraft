/**
 * Layers.
 *
 * The important decision here is that VISIBILITY AND QUANTIFICATION ARE
 * SEPARATE. Hiding a layer to see behind it must never quietly drop its
 * contents from the takeoff — that is a silent quoting error, and it is
 * exactly the shape of mistake that only surfaces when the materials arrive
 * short. So a layer has both `visible` and `includeInTakeoff`, and turning off
 * the first leaves the second alone.
 *
 * Excluding something from the quote is a deliberate act — an existing deck
 * being drawn for context, a future phase — and the panel says so.
 */

export const DEFAULT_LAYER_ID = 'layer-default'

export function createLayer(id, name, overrides = {}) {
  return {
    id,
    name,
    visible: true,
    locked: false,
    includeInTakeoff: true,
    color: null, // null means "use the object's own colour"
    // Lineweight is what separates a drawing that reads at a glance from a
    // flat wireframe: cut edges heavy, visible medium, annotation light.
    lineweight: 'medium',
    linetype: 'solid',
    ...overrides,
  }
}

/** The layer set a new document starts with. */
export function defaultLayers() {
  return {
    layers: { [DEFAULT_LAYER_ID]: createLayer(DEFAULT_LAYER_ID, 'Default') },
    layerOrder: [DEFAULT_LAYER_ID],
  }
}

/** The layer a node belongs to, falling back to the default. */
export function layerOf(doc, node) {
  return doc.layers?.[node?.layer] ?? doc.layers?.[DEFAULT_LAYER_ID] ?? null
}

/** Should this node be drawn? */
export function isVisible(doc, node) {
  const layer = layerOf(doc, node)
  return layer ? layer.visible !== false : true
}

/** Can this node be picked or dragged? */
export function isSelectable(doc, node) {
  const layer = layerOf(doc, node)
  if (!layer) return true
  return layer.visible !== false && layer.locked !== true
}

/** Should this node's quantities reach the takeoff? */
export function countsInTakeoff(doc, node) {
  const layer = layerOf(doc, node)
  return layer ? layer.includeInTakeoff !== false : true
}

/** Add a layer, returning a new document. */
export function addLayer(doc, id, name) {
  if (doc.layers?.[id]) return doc
  return {
    ...doc,
    layers: { ...doc.layers, [id]: createLayer(id, name) },
    layerOrder: [...(doc.layerOrder ?? []), id],
  }
}

/** Change layer properties. */
export function updateLayer(doc, id, changes) {
  if (!doc.layers?.[id]) return doc
  return {
    ...doc,
    layers: { ...doc.layers, [id]: { ...doc.layers[id], ...changes } },
  }
}

/**
 * Delete a layer, moving anything on it to the default rather than deleting it.
 *
 * Removing a layer should not silently destroy drawn work — that is a
 * surprising amount of damage for what reads as an organisational tidy-up.
 * The default layer itself cannot be removed, because everything needs
 * somewhere to land.
 */
export function removeLayer(doc, id) {
  if (id === DEFAULT_LAYER_ID || !doc.layers?.[id]) return doc

  const layers = { ...doc.layers }
  delete layers[id]

  const nodes = {}
  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    nodes[nodeId] = node.layer === id ? { ...node, layer: DEFAULT_LAYER_ID } : node
  }

  return {
    ...doc,
    layers,
    layerOrder: (doc.layerOrder ?? []).filter((layerId) => layerId !== id),
    nodes,
  }
}

/** Move a node onto a layer. */
export function assignLayer(doc, nodeId, layerId) {
  const node = doc.nodes[nodeId]
  if (!node || !doc.layers?.[layerId]) return doc
  return { ...doc, nodes: { ...doc.nodes, [nodeId]: { ...node, layer: layerId } } }
}

/** How many nodes sit on each layer. */
export function layerCounts(doc) {
  const counts = {}
  for (const node of Object.values(doc.nodes)) {
    const id = node.layer ?? DEFAULT_LAYER_ID
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}
