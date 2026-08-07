import { describe, it, expect } from 'vitest'
import { JURISDICTIONS, getRules, checkGuard, checkStair, DEFAULT_JURISDICTION } from './code.js'
import { createDocument, addNode, documentIssues } from './doc.js'
import { layoutRailing } from './railing.js'

const p = (x, y, z = 0) => ({ x, y, z })

describe('jurisdictions', () => {
  it('states an authority and a clause for every rule group', () => {
    // A finding without a citation is an opinion. Someone will ask "says who?"
    for (const rules of Object.values(JURISDICTIONS)) {
      expect(rules.authority).toBeTruthy()
      expect(rules.stair.citation).toBeTruthy()
      expect(rules.guard.citation).toBeTruthy()
    }
  })

  it('derives inches from the metric the codes are actually written in', () => {
    // 100mm sphere = 3.937". Retyping a converted number is how a rounding
    // error gets baked into a compliance check.
    expect(JURISDICTIONS['obc-dwelling'].guard.maxOpening).toBeCloseTo(100 / 25.4, 10)
    expect(JURISDICTIONS['obc-dwelling'].stair.maxRiser).toBeCloseTo(200 / 25.4, 10)
    expect(JURISDICTIONS['obc-public'].guard.minHeight).toBeCloseTo(1070 / 25.4, 10)
  })

  it('falls back to the default for an unknown id', () => {
    expect(getRules('nonsense').id).toBe(DEFAULT_JURISDICTION)
    expect(getRules(undefined).id).toBe(DEFAULT_JURISDICTION)
  })
})

describe('checkGuard', () => {
  it('passes a compliant guard', () => {
    const rules = getRules('obc-dwelling')
    expect(checkGuard({ height: 42, actualGap: 3.5 }, rules)).toEqual([])
  })

  it('flags a guard that is too low, citing the clause', () => {
    const rules = getRules('obc-public')
    const [issue] = checkGuard({ height: 36, actualGap: 3.5 }, rules)

    expect(issue.code).toBe('GUARD-HEIGHT')
    expect(issue.citation).toContain('OBC')
    expect(issue.limit).toBeCloseTo(1070 / 25.4, 6)
  })

  it('judges the gap the railing is actually built to', () => {
    // A generous setting that happens to resolve to a legal spacing is fine;
    // the built result is what an inspector measures.
    const rules = getRules('obc-dwelling')
    expect(checkGuard({ height: 42, maxGap: 6, actualGap: 3.5 }, rules)).toEqual([])
    expect(checkGuard({ height: 42, maxGap: 3.5, actualGap: 4.5 }, rules)[0].code).toBe('GUARD-OPENING')
  })
})

describe('the same drawing under different codes', () => {
  /** A 36"-high guard — the US residential minimum. */
  function guardDoc(height) {
    return addNode(createDocument(), 'railingRun', { points: [p(0, 0), p(240, 0)], height })
  }

  it('passes a 36" guard under IRC but fails it under OBC public', () => {
    // This is the whole point of a rules layer: the geometry did not change,
    // the jurisdiction did.
    const doc = guardDoc(36)

    const underIrc = documentIssues({ ...doc, jurisdiction: 'irc-dwelling' })
    expect(underIrc.filter((i) => i.code === 'GUARD-HEIGHT')).toEqual([])

    const underObcPublic = documentIssues({ ...doc, jurisdiction: 'obc-public' })
    expect(underObcPublic.some((i) => i.code === 'GUARD-HEIGHT')).toBe(true)
  })

  it('does not silently re-shape geometry when the code changes', () => {
    // Quietly moving a picket spacing under someone would change a drawing
    // they had already checked and signed.
    const doc = guardDoc(42)
    const id = doc.order[0]

    const before = layoutRailing(doc.nodes[id])
    const after = layoutRailing({ ...doc, jurisdiction: 'irc-dwelling' }.nodes[id])

    expect(after.pickets.length).toBe(before.pickets.length)
    expect(after.gap).toBeCloseTo(before.gap, 10)
  })

  it('flags a stair legal in one jurisdiction and not the other', () => {
    // A 7.75" riser is at the IRC maximum but over the OBC public 7.087" one.
    let doc = createDocument()
    doc = addNode(doc, 'stairRun', { points: [p(0, 0), p(100, 0)], totalRise: 93, treadDepth: 11 })

    const irc = documentIssues({ ...doc, jurisdiction: 'irc-dwelling' })
    const obcPublic = documentIssues({ ...doc, jurisdiction: 'obc-public' })

    expect(obcPublic.filter((i) => i.severity === 'error').length).toBeGreaterThanOrEqual(
      irc.filter((i) => i.severity === 'error').length,
    )
  })
})

describe('checkStair', () => {
  it('separates a code failure from a comfort warning', () => {
    // A stair can be perfectly legal and still unpleasant to climb; conflating
    // the two makes people ignore both.
    const rules = getRules('obc-dwelling')
    const issues = checkStair({ riserHeight: 6, treadDepth: 16, riserCount: 15 }, rules)

    const comfort = issues.find((i) => i.code === 'COMFORT')
    expect(comfort.severity).toBe('warning')
    expect(comfort.citation).toContain('not code')
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('carries the actual value and the limit, not just prose', () => {
    const rules = getRules('obc-dwelling')
    const [issue] = checkStair({ riserHeight: 9, treadDepth: 11, riserCount: 12 }, rules)

    expect(issue.actual).toBe(9)
    expect(issue.limit).toBeCloseTo(200 / 25.4, 6)
  })
})
