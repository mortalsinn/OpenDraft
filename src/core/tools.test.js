import { describe, it, expect } from 'vitest'
import {
  PLAN_TOOL_GROUPS,
  MODEL_TOOL_GROUPS,
  toolGroupsForView,
  toolsForView,
  toolAfterViewChange,
} from './tools.js'

describe('the two palettes', () => {
  it('gives every entry an id and a label', () => {
    for (const groups of [PLAN_TOOL_GROUPS, MODEL_TOOL_GROUPS]) {
      for (const [id, label] of groups.flat()) {
        expect(id).toBeTruthy()
        expect(label).toBeTruthy()
      }
    }
  })

  it('never lists a tool twice within a view', () => {
    for (const view of ['plan', '3d']) {
      const ids = toolGroupsForView(view).flat().map(([id]) => id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('keeps plan-only editing tools out of 3D', () => {
    // Offering trim or dimension while orbiting implies they will work when
    // they will not.
    const model = toolsForView('3d')
    for (const planOnly of ['trim', 'extend', 'fillet', 'chamfer', 'dimension']) {
      expect(model.has(planOnly)).toBe(false)
      expect(toolsForView('plan').has(planOnly)).toBe(true)
    }
  })

  it('keeps push/pull out of the flat plan, where it means nothing', () => {
    expect(toolsForView('plan').has('pushpull')).toBe(false)
    expect(toolsForView('3d').has('pushpull')).toBe(true)
  })

  it('offers select and move in both', () => {
    for (const shared of ['select', 'move']) {
      expect(toolsForView('plan').has(shared)).toBe(true)
      expect(toolsForView('3d').has(shared)).toBe(true)
    }
  })

  it('puts the shared tools in the same place in both rails', () => {
    // Switching view should not move the thing your hand is already reaching
    // for.
    expect(PLAN_TOOL_GROUPS[0]).toEqual(MODEL_TOOL_GROUPS[0])
  })
})

describe('toolAfterViewChange', () => {
  it('keeps a tool the new view also offers', () => {
    // Nipping into 3D to check something and coming back should not cost you
    // your place.
    expect(toolAfterViewChange('move', '3d')).toBe('move')
    expect(toolAfterViewChange('line', '3d')).toBe('line')
    expect(toolAfterViewChange('circle', 'plan')).toBe('circle')
  })

  it('falls back to select when the new view has no such tool', () => {
    // Staying armed with an unavailable tool means a click does nothing for a
    // reason the rail does not show.
    expect(toolAfterViewChange('fillet', '3d')).toBe('select')
    expect(toolAfterViewChange('pushpull', 'plan')).toBe('select')
  })

  it('handles an unknown tool', () => {
    expect(toolAfterViewChange('nonsense', 'plan')).toBe('select')
  })
})
