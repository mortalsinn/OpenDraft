import { describe, it, expect } from 'vitest'
import { boxFromDrag, nodesInBox, applySelection } from './selection.js'

const p = (x, y, z = 0) => ({ x, y, z })

/** A short line fully inside the test box, and one poking out of it. */
const inside = { id: 'inside', start: p(20, 20), end: p(40, 40) }
const straddling = { id: 'straddling', start: p(40, 40), end: p(200, 200) }
const outside = { id: 'outside', start: p(300, 300), end: p(400, 400) }

const nodes = [inside, straddling, outside]
const spansOf = (node) => [[node.start, node.end]]

describe('drag direction chooses the mode', () => {
  it('reads left-to-right as a window', () => {
    expect(boxFromDrag(p(0, 0), p(100, 100)).crossing).toBe(false)
  })

  it('reads right-to-left as a crossing', () => {
    expect(boxFromDrag(p(100, 100), p(0, 0)).crossing).toBe(true)
  })

  it('normalises the corners either way', () => {
    const box = boxFromDrag(p(100, 100), p(0, 0))
    expect(box.minX).toBe(0)
    expect(box.maxX).toBe(100)
  })
})

describe('window selection', () => {
  const box = boxFromDrag(p(0, 0), p(100, 100))

  it('takes only what is entirely inside', () => {
    // "Take this thing" — used when you can see the whole of what you want.
    expect(nodesInBox(nodes, box, spansOf)).toEqual(['inside'])
  })

  it('leaves out anything poking past the edge', () => {
    expect(nodesInBox(nodes, box, spansOf)).not.toContain('straddling')
  })
})

describe('crossing selection', () => {
  const box = boxFromDrag(p(100, 100), p(0, 0))

  it('takes anything the box touches', () => {
    // "Take everything through here" — grabs a run without framing all of it.
    const caught = nodesInBox(nodes, box, spansOf)
    expect(caught).toContain('inside')
    expect(caught).toContain('straddling')
    expect(caught).not.toContain('outside')
  })

  it('catches a line that passes clean through without an end inside', () => {
    const through = { id: 'through', start: p(-50, 50), end: p(150, 50) }
    const caught = nodesInBox([through], box, spansOf)
    expect(caught).toEqual(['through'])
  })
})

describe('nodesInBox edge cases', () => {
  it('ignores nodes with no geometry at all', () => {
    expect(nodesInBox([{ id: 'empty' }], boxFromDrag(p(0, 0), p(100, 100)), () => [])).toEqual([])
  })

  it('judges a generated symbol on its spans when it has no stored vertices', () => {
    // A block keeps only an insertion point; its outline is generated.
    const symbol = { id: 'sym' }
    const spans = () => [[p(10, 10), p(20, 20)]]
    expect(nodesInBox([symbol], boxFromDrag(p(0, 0), p(100, 100)), spans)).toEqual(['sym'])
  })
})

describe('applySelection', () => {
  it('replaces by default', () => {
    expect(applySelection(['a', 'b'], ['c'])).toEqual(['c'])
  })

  it('adds when additive', () => {
    expect(applySelection(['a'], ['b'], { additive: true }).sort()).toEqual(['a', 'b'])
  })

  it('removes something already selected, so an over-grab can be corrected', () => {
    expect(applySelection(['a', 'b'], ['a'], { additive: true })).toEqual(['b'])
  })

  it('never repeats an id', () => {
    expect(applySelection([], ['a', 'a', 'b'])).toEqual(['a', 'b'])
  })
})
