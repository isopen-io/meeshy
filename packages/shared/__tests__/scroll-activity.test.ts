import { describe, it, expect } from 'vitest'
import {
  scrollActivityLaw,
  initialState,
  reduce,
  isVisible,
  SCROLL_ACTIVITY_LINGER_MS,
  type ScrollActivityState,
} from '../utils/scroll-activity'

describe('scrollActivityLaw', () => {
  it('exposes the shared linger constant at 900ms (R15 — single constant for both skins)', () => {
    expect(SCROLL_ACTIVITY_LINGER_MS).toBe(900)
  })

  it('is invisible at open, before any scroll event', () => {
    const state = initialState()
    expect(isVisible(state, 0)).toBe(false)
    expect(isVisible(state, 1_000_000)).toBe(false)
  })

  it('becomes visible on the first scrolled event', () => {
    const t = 10_000
    const state = reduce(initialState(), { type: 'scrolled', at: t })
    expect(isVisible(state, t)).toBe(true)
  })

  it('stays visible at t+899', () => {
    const t = 10_000
    const state = reduce(initialState(), { type: 'scrolled', at: t })
    const after = reduce(state, { type: 'tick', at: t + 899 })
    expect(isVisible(after, t + 899)).toBe(true)
  })

  it('is invisible at t+901', () => {
    const t = 10_000
    const state = reduce(initialState(), { type: 'scrolled', at: t })
    const after = reduce(state, { type: 'tick', at: t + 901 })
    expect(isVisible(after, t + 901)).toBe(false)
  })

  it('is invisible EXACTLY at t+900 — the linger window is the semi-open interval [t, t+900), never inclusive of the boundary', () => {
    const t = 10_000
    const state = reduce(initialState(), { type: 'scrolled', at: t })
    expect(isVisible(state, t + SCROLL_ACTIVITY_LINGER_MS)).toBe(false)
    expect(isVisible(state, t + SCROLL_ACTIVITY_LINGER_MS - 1)).toBe(true)
  })

  it('rearms the timer on an interleaved scrolled event — the last scroll always wins', () => {
    const t = 10_000
    let state: ScrollActivityState = initialState()
    state = reduce(state, { type: 'scrolled', at: t })
    state = reduce(state, { type: 'scrolled', at: t + 500 })
    const atThirteenHundred = reduce(state, { type: 'tick', at: t + 1_300 })
    expect(isVisible(atThirteenHundred, t + 1_300)).toBe(true)

    const atFourteenOhOne = reduce(state, { type: 'tick', at: t + 1_401 })
    expect(isVisible(atFourteenOhOne, t + 1_401)).toBe(false)
  })

  it('tick events never mutate state — only scrolled sets a new lastScrolledAt', () => {
    const t = 10_000
    const scrolled = reduce(initialState(), { type: 'scrolled', at: t })
    const ticked = reduce(scrolled, { type: 'tick', at: t + 50 })
    expect(ticked).toEqual(scrolled)
  })

  it('reduce is pure — the input state is never mutated in place', () => {
    const before = initialState()
    const snapshot: ScrollActivityState = { ...before }
    reduce(before, { type: 'scrolled', at: 42 })
    expect(before).toEqual(snapshot)
  })

  it('exposes the same three functions grouped as scrollActivityLaw for ergonomic import', () => {
    expect(scrollActivityLaw.initialState).toBe(initialState)
    expect(scrollActivityLaw.reduce).toBe(reduce)
    expect(scrollActivityLaw.isVisible).toBe(isVisible)
  })
})
