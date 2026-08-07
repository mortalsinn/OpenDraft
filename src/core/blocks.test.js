import { describe, it, expect } from 'vitest'
import { BLOCKS, BLOCK_LIST, defaultAttributes, blockSegments, blockQuantities } from './blocks.js'

const p = (x, y, z = 0) => ({ x, y, z })

describe('the library', () => {
  it('gives every block a name and an id that matches its key', () => {
    for (const [key, block] of Object.entries(BLOCKS)) {
      expect(block.id).toBe(key)
      expect(block.name).toBeTruthy()
      expect(typeof block.build).toBe('function')
    }
  })

  it('gives every attribute a tag, a label and a default', () => {
    for (const block of BLOCK_LIST) {
      for (const attribute of block.attributes) {
        expect(attribute.tag).toBeTruthy()
        expect(attribute.label).toBeTruthy()
        expect(attribute.value).toBeDefined()
      }
    }
  })

  it('builds geometry for every block at its defaults', () => {
    for (const block of BLOCK_LIST) {
      const segments = block.build(defaultAttributes(block.id))
      expect(segments.length).toBeGreaterThan(0)

      for (const [a, b] of segments) {
        expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true)
        expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true)
      }
    }
  })
})

describe('attributes drive geometry', () => {
  it('makes a wider door actually wider', () => {
    // The whole reason a block carries parameters instead of frozen lines.
    const extentOf = (width) => {
      const segments = BLOCKS.door.build({ WIDTH: width, HANDING: 'LH' })
      return Math.max(...segments.flat().map((point) => Math.abs(point.x)))
    }

    expect(extentOf(36)).toBeCloseTo(36, 6)
    expect(extentOf(30)).toBeCloseTo(30, 6)
  })

  it('mirrors a door for the other handing', () => {
    const leafY = (handing) => BLOCKS.door.build({ WIDTH: 36, HANDING: handing })[0][1].y
    expect(leafY('LH')).toBeCloseTo(36, 6)
    expect(leafY('RH')).toBeCloseTo(-36, 6)
  })

  it('changes a newel from square to round', () => {
    const square = BLOCKS.newel.build({ SIZE: 3.5, STYLE: 'square' })
    const turned = BLOCKS.newel.build({ SIZE: 3.5, STYLE: 'turned' })
    expect(square).toHaveLength(4) // four sides
    expect(turned.length).toBeGreaterThan(4) // tessellated circle
  })

  it('refuses to collapse to nothing on a zero or negative size', () => {
    for (const block of BLOCK_LIST) {
      const zeroed = {}
      for (const attribute of block.attributes) {
        zeroed[attribute.tag] = attribute.type === 'length' ? 0 : attribute.value
      }
      expect(block.build(zeroed).length).toBeGreaterThan(0)
    }
  })
})

describe('blockSegments placement', () => {
  const node = { blockId: 'newel', position: p(100, 50), attributes: { SIZE: 4, STYLE: 'square' } }

  it('places geometry at the insertion point', () => {
    const segments = blockSegments(node)
    const xs = segments.flat().map((point) => point.x)
    // A 4" square newel centred on x = 100.
    expect(Math.min(...xs)).toBeCloseTo(98, 6)
    expect(Math.max(...xs)).toBeCloseTo(102, 6)
  })

  it('rotates about the insertion point', () => {
    const turned = blockSegments({ ...node, rotation: Math.PI / 4 })
    for (const point of turned.flat()) {
      // Rotation must not move the centre.
      expect(Math.hypot(point.x - 100, point.y - 50)).toBeCloseTo(Math.hypot(2, 2), 6)
    }
  })

  it('scales about the insertion point', () => {
    const doubled = blockSegments({ ...node, scale: 2 })
    const xs = doubled.flat().map((point) => point.x)
    expect(Math.max(...xs)).toBeCloseTo(104, 6)
  })

  it('yields nothing for an unknown block rather than throwing', () => {
    expect(blockSegments({ blockId: 'nonsense', position: p(0, 0) })).toEqual([])
  })
})

describe('blockQuantities', () => {
  it('counts a placed block once, keyed by its attributes', () => {
    // A door that knows its width can be scheduled. Lines on a page cannot.
    const lines = blockQuantities({ blockId: 'door', attributes: { WIDTH: 32 } })
    expect(lines).toHaveLength(1)
    expect(lines[0].sku).toBe('DOOR-32')
    expect(lines[0].quantity).toBe(1)
  })

  it('separates different sizes into different SKUs', () => {
    const a = blockQuantities({ blockId: 'door', attributes: { WIDTH: 32 } })[0].sku
    const b = blockQuantities({ blockId: 'door', attributes: { WIDTH: 36 } })[0].sku
    expect(a).not.toBe(b)
  })

  it('quotes nothing for a pure drawing symbol', () => {
    // A north arrow is not a thing anyone buys.
    expect(blockQuantities({ blockId: 'northArrow', attributes: {} })).toEqual([])
  })

  it('falls back to defaults when a placement carries no attributes', () => {
    expect(blockQuantities({ blockId: 'door' })[0].sku).toBe('DOOR-36')
  })
})
