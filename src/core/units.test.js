import { describe, it, expect } from 'vitest'
import { parseLength, formatLength, snapToFraction } from './units.js'

describe('parseLength', () => {
  it('reads bare numbers as inches', () => {
    expect(parseLength('12')).toBe(12)
    expect(parseLength('6.5')).toBe(6.5)
  })

  it('reads feet', () => {
    expect(parseLength("12'")).toBe(144)
    expect(parseLength('12ft')).toBe(144)
  })

  it('reads feet and inches, with or without separators', () => {
    expect(parseLength(`12' 6"`)).toBe(150)
    expect(parseLength("12'6")).toBe(150)
    expect(parseLength(`12' 6 1/2"`)).toBe(150.5)
  })

  it('reads fractions', () => {
    expect(parseLength('1/2')).toBe(0.5)
    expect(parseLength('6 1/2')).toBe(6.5)
    expect(parseLength('6-1/2')).toBe(6.5)
  })

  it('handles negatives', () => {
    expect(parseLength("-3'")).toBe(-36)
    expect(parseLength('-6 1/2')).toBe(-6.5)
  })

  it('takes metric only with an explicit suffix', () => {
    expect(parseLength('25.4mm')).toBeCloseTo(1, 10)
    expect(parseLength('1m')).toBeCloseTo(39.3700787, 6)
    // A bare number must never be read as millimetres.
    expect(parseLength('300')).toBe(300)
  })

  it('rejects junk', () => {
    expect(parseLength('')).toBeNull()
    expect(parseLength('abc')).toBeNull()
    expect(parseLength('1/0')).toBeNull() // guarded divide-by-zero
  })
})

describe('formatLength', () => {
  it('formats feet, inches and fractions', () => {
    expect(formatLength(150.5)).toBe(`12' 6 1/2"`)
    expect(formatLength(144)).toBe(`12'`)
    expect(formatLength(6.5)).toBe(`6 1/2"`)
    expect(formatLength(0.5)).toBe(`1/2"`)
    expect(formatLength(0)).toBe(`0"`)
  })

  it('reduces fractions', () => {
    expect(formatLength(6.25)).toBe(`6 1/4"`)
    expect(formatLength(6.5)).toBe(`6 1/2"`)
  })

  it('rounds without cascading into a bogus 12"', () => {
    // The classic bug: 15.9999 rounding to 16" and being rendered as 1' 4",
    // or worse, 0' 16". Rounding once in integer ticks prevents it.
    expect(formatLength(15.9999)).toBe(`1' 4"`)
    expect(formatLength(11.9999)).toBe(`1'`)
  })

  it('handles negatives', () => {
    expect(formatLength(-150.5)).toBe(`-12' 6 1/2"`)
  })
})

describe('round trip', () => {
  it('leaves already-canonical strings untouched', () => {
    const samples = [`12' 6 1/2"`, `3' 7 3/16"`, `7 3/4"`, `1/16"`, `3'`]
    for (const sample of samples) {
      const inches = parseLength(sample)
      expect(inches).not.toBeNull()
      expect(formatLength(inches)).toBe(sample)
    }
  })

  it('canonicalizes equivalent spellings to one form', () => {
    // 36" and 3' are the same length; format picks one spelling and sticks to it.
    const spellings = ['36', `36"`, `3'`, `2' 12"`]
    const canonical = spellings.map((s) => formatLength(parseLength(s)))
    expect(new Set(canonical)).toEqual(new Set([`3'`]))
  })

  it('is idempotent — formatting a formatted value changes nothing', () => {
    for (const sample of ['150.5', `12'6`, '6-1/2', '1000mm']) {
      const once = formatLength(parseLength(sample))
      const twice = formatLength(parseLength(once))
      expect(twice).toBe(once)
    }
  })
})

describe('snapToFraction', () => {
  it('snaps to the nearest sixteenth by default', () => {
    expect(snapToFraction(6.51)).toBe(6.5)
    expect(snapToFraction(6.56)).toBe(6.5625) // 9/16
    expect(snapToFraction(6.6)).toBe(6.625) // 10/16 → 5/8
    expect(snapToFraction(6.97)).toBe(7)
  })
})
