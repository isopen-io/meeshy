import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  scrollActivityLaw,
  initialState,
  reduce,
  isVisible,
  SCROLL_ACTIVITY_LINGER_MS,
  type ScrollActivityState,
} from '../utils/scroll-activity'

const LENTILLE_TOKENS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'design',
  'lentille-tokens.json',
)

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

describe('RÉSERVE 3 (REV-1) — parity with packages/shared/design/lentille-tokens.json', () => {
  // Une loi, deux libellés (workshop amendement A4, voir tête de fichier) :
  // la pilule du fil (Focal, thread.pill) ET la pilule de la liste (Lentille,
  // list.pill) doivent lier leur `dismissAfterMs` à CETTE MÊME constante,
  // jamais une valeur dupliquée en dur dans le JSON de design tokens — un
  // écart entre les deux serait la preuve qu'une peau a divergé de la loi.
  const tokens = JSON.parse(readFileSync(LENTILLE_TOKENS_PATH, 'utf-8')) as {
    readonly list: { readonly pill: { readonly dismissAfterMs: number; readonly fadeOutDelayMs?: number } }
    readonly thread: { readonly pill: { readonly dismissAfterMs: number; readonly fadeOutDelayMs?: number } }
  }

  it('lentille-tokens.json list.pill.dismissAfterMs === SCROLL_ACTIVITY_LINGER_MS', () => {
    expect(tokens.list.pill.dismissAfterMs).toBe(SCROLL_ACTIVITY_LINGER_MS)
  })

  it('lentille-tokens.json thread.pill.dismissAfterMs === SCROLL_ACTIVITY_LINGER_MS', () => {
    expect(tokens.thread.pill.dismissAfterMs).toBe(SCROLL_ACTIVITY_LINGER_MS)
  })

  it('list.pill and thread.pill agree with each other (single constant, two skins — R15)', () => {
    expect(tokens.list.pill.dismissAfterMs).toBe(tokens.thread.pill.dismissAfterMs)
  })

  it('if either pill also carries a fadeOutDelayMs alias, it stays in lockstep with dismissAfterMs too', () => {
    if (tokens.list.pill.fadeOutDelayMs !== undefined) {
      expect(tokens.list.pill.fadeOutDelayMs).toBe(SCROLL_ACTIVITY_LINGER_MS)
    }
    if (tokens.thread.pill.fadeOutDelayMs !== undefined) {
      expect(tokens.thread.pill.fadeOutDelayMs).toBe(SCROLL_ACTIVITY_LINGER_MS)
    }
  })
})
