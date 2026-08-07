import { describe, it, expect } from 'vitest'
import { transformPoint, instantiate, definitionUsage } from './components.js'
import {
  createDocument,
  addNode,
  makeComponent,
  placeInstance,
  updateNode,
  computeTakeoff,
  listSegments,
} from './doc.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A railing promoted into a component, plus a second instance placed away. */
function twoInstances() {
  let doc = addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(120, 0)] })
  const firstId = doc.order[0]

  doc = makeComponent(doc, firstId, 'Rail panel')
  const definitionId = doc.nodes[firstId].definitionId

  doc = placeInstance(doc, definitionId, p(0, 200))
  return { doc, definitionId, firstId, secondId: doc.order[1] }
}

describe('transformPoint', () => {
  it('translates', () => {
    expect(transformPoint(p(10, 0), { position: p(5, 5) })).toMatchObject({ x: 15, y: 5 })
  })

  it('rotates about Z before translating', () => {
    const rotated = transformPoint(p(10, 0), { position: p(0, 0), rotation: Math.PI / 2 })
    expect(rotated.x).toBeCloseTo(0, 10)
    expect(rotated.y).toBeCloseTo(10, 10)
  })

  it('leaves height alone', () => {
    expect(transformPoint(p(1, 2, 7), { position: p(0, 0, 3), rotation: 1 }).z).toBe(10)
  })
})

describe('makeComponent', () => {
  it('replaces the node with an instance and keeps its id', () => {
    const { doc, firstId } = twoInstances()
    expect(doc.nodes[firstId].type).toBe('componentInstance')
    expect(doc.nodes[firstId].definitionId).toBeTruthy()
  })

  it('leaves the geometry exactly where it was', () => {
    // Making a component must not move anything on screen.
    const { doc, firstId } = twoInstances()
    const [inner] = instantiate(doc, doc.nodes[firstId])
    expect(inner.points[0]).toMatchObject({ x: 0, y: 0 })
    expect(inner.points[1]).toMatchObject({ x: 120, y: 0 })
  })

  it('stores definition geometry relative to its own origin', () => {
    // World coordinates in the definition would make the second instance a
    // copy rather than a reference, and the whole point would be lost.
    const { doc, definitionId } = twoInstances()
    const definition = doc.definitions[definitionId]
    const [only] = Object.values(definition.nodes)
    expect(only.points[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('refuses to componentise an instance', () => {
    const { doc, firstId } = twoInstances()
    expect(makeComponent(doc, firstId, 'Again')).toBe(doc)
  })
})

describe('instances follow their definition', () => {
  it('changes every instance when the definition changes', () => {
    // The reason components exist: edit once, not twelve times.
    const { doc, definitionId, secondId } = twoInstances()

    const definition = doc.definitions[definitionId]
    const innerId = definition.order[0]
    const taller = {
      ...doc,
      definitions: {
        ...doc.definitions,
        [definitionId]: {
          ...definition,
          nodes: { [innerId]: { ...definition.nodes[innerId], height: 60 } },
        },
      },
    }

    const [inner] = instantiate(taller, taller.nodes[secondId])
    expect(inner.height).toBe(60)
  })

  it('places each instance at its own position', () => {
    const { doc, firstId, secondId } = twoInstances()
    const [a] = instantiate(doc, doc.nodes[firstId])
    const [b] = instantiate(doc, doc.nodes[secondId])

    expect(a.points[0].y).toBe(0)
    expect(b.points[0].y).toBe(200)
  })

  it('namespaces inner ids so two instances never collide', () => {
    const { doc, firstId, secondId } = twoInstances()
    const a = instantiate(doc, doc.nodes[firstId])[0].id
    const b = instantiate(doc, doc.nodes[secondId])[0].id
    expect(a).not.toBe(b)
  })

  it('yields nothing for a missing definition', () => {
    const doc = createDocument()
    expect(instantiate(doc, { id: 'x', definitionId: 'gone', position: p(0, 0) })).toEqual([])
  })
})

describe('instances in the takeoff', () => {
  it('counts every instance, not just the definition', () => {
    // Twelve instances of a post assembly are twelve assemblies' worth of
    // material. Counting the definition once is how a job comes up short.
    const { doc, definitionId } = twoInstances()

    const two = computeTakeoff(doc).find((l) => l.sku === 'POST').quantity
    const three = computeTakeoff(placeInstance(doc, definitionId, p(0, 400))).find(
      (l) => l.sku === 'POST',
    ).quantity

    expect(three).toBeCloseTo(three, 6)
    expect(three - two).toBe(two / 2) // each instance contributes equally
  })

  it('reports how many instances use each definition', () => {
    const { doc, definitionId } = twoInstances()
    expect(definitionUsage(doc)[definitionId]).toBe(2)
  })
})

describe('instances in inference', () => {
  it('exposes their spans so you can snap to a placed component', () => {
    const { doc, secondId } = twoInstances()
    const segments = listSegments(doc)

    expect(segments.length).toBeGreaterThan(0)
    // The INSTANCE id, so clicking selects what you clicked rather than the
    // shared definition.
    expect(segments.some((s) => s.id === secondId)).toBe(true)
  })
})
