import { describe, it, expect } from 'vitest'
import { focusCurve, electFocusRow, type FocusRowCandidate } from '../utils/focus-curve'

describe('focusCurve — thread variant (Focal, fil)', () => {
  // Spec « Focal Grandeur Nature » §3/§5
  // (docs/design/2026-08-15-focal-spec-integration.html, contrat 2026-08-18) :
  // f = min(1, d/380) ; opacity = 1 − 0.82·f ; scale = 1 − 0.40·f.
  it('at d=380 (saturation), alpha = 1 − 0.82 = 0.18 and scale = 1 − 0.40 = 0.60 — the spec floors', () => {
    const { alpha, scale } = focusCurve(380, 'thread')
    expect(alpha).toBeCloseTo(0.18, 4)
    expect(scale).toBeCloseTo(0.6, 4)
  })

  it('f saturates at d=380 exactly — same result as d=900 (min(1, ·) caps the ramp)', () => {
    expect(focusCurve(380, 'thread')).toEqual(focusCurve(900, 'thread'))
  })

  it('at d=0 (pile dans la bande de focus) renders alpha=1, scale=1 — no fade, no shrink', () => {
    expect(focusCurve(0, 'thread')).toEqual({ alpha: 1, scale: 1 })
  })

  it('at d=190 (mid-ramp), alpha and scale sit exactly halfway to their d=380 floor', () => {
    const { alpha, scale } = focusCurve(190, 'thread')
    expect(alpha).toBeCloseTo(1 - 0.82 * 0.5, 4)
    expect(scale).toBeCloseTo(1 - 0.4 * 0.5, 4)
  })

  it('recette §7 : a row 400px above the band weighs ≤ 20% opacity', () => {
    expect(focusCurve(400, 'thread').alpha).toBeLessThanOrEqual(0.2)
  })

  it('negative distance (thread has no below-band amendment) clamps to the same d=0 result', () => {
    expect(focusCurve(-50, 'thread')).toEqual({ alpha: 1, scale: 1 })
  })
})

describe('focusCurve — list variant (Lentille)', () => {
  it('at d=520 renders alpha=0.55 and scale=0.96 — literal contract criterion', () => {
    const { alpha, scale } = focusCurve(520, 'list')
    expect(alpha).toBeCloseTo(0.55, 4)
    expect(scale).toBeCloseTo(0.96, 4)
  })

  it('at d=0 (pile dans la bande) renders alpha=1, scale=1', () => {
    expect(focusCurve(0, 'list')).toEqual({ alpha: 1, scale: 1 })
  })

  it('at d=260 (mid-ramp), alpha and scale sit exactly halfway to their d=520 floor', () => {
    const { alpha, scale } = focusCurve(260, 'list')
    expect(alpha).toBeCloseTo(1 - 0.45 * 0.5, 4)
    expect(scale).toBeCloseTo(1 - 0.04 * 0.5, 4)
  })

  it('f saturates at d=520 — a farther row (d=700) renders the identical floor', () => {
    expect(focusCurve(700, 'list')).toEqual(focusCurve(520, 'list'))
  })

  it('the row height (64) never enters the law — focusCurve is a pure function of (distance, variant) only', () => {
    expect(focusCurve.length).toBe(2)
  })

  describe('below-band fade (d < 0 — proportional ramp capped at −0.35 over 160px, BLOCAGE 1 REV-1 correction)', () => {
    // Maquette normative : docs/design/2026-08-15-conversation-list-lentille.html:647
    //   `op = 1 − 0.35·min(1, d/160)` où `d = my - focusY` (distance SOUS la
    //   bande, positive) — soit, dans la convention de focus-curve.ts
    //   (`distance` = distance AU-DESSUS de la bande), `d = -distance`.
    //   belowBandFade = −0.35 · clampUnit(−distance / 160)
    it('at d=-16, belowBandFade = -0.35 * (16/160) = -0.035, so alpha = 0.965 and scale stays 1', () => {
      const { alpha, scale } = focusCurve(-16, 'list')
      expect(alpha).toBeCloseTo(0.965, 4)
      expect(scale).toBe(1)
    })

    it('at d=-56, belowBandFade = -0.35 * (56/160) = -0.1225, alpha = 0.8775', () => {
      const { alpha } = focusCurve(-56, 'list')
      expect(alpha).toBeCloseTo(0.8775, 4)
    })

    it('at d=-100, belowBandFade = -0.35 * (100/160) = -0.21875, alpha = 0.78125', () => {
      const { alpha } = focusCurve(-100, 'list')
      expect(alpha).toBeCloseTo(0.78125, 4)
    })

    it('at d=-160, the ramp saturates exactly at its -0.35 floor, alpha = 0.65', () => {
      expect(focusCurve(-160, 'list').alpha).toBeCloseTo(0.65, 4)
    })

    it('beyond the -160 threshold (d=-300, d=-999), the fade is capped — alpha never drops below 0.65', () => {
      expect(focusCurve(-300, 'list').alpha).toBeCloseTo(0.65, 4)
      expect(focusCurve(-999, 'list').alpha).toBeCloseTo(0.65, 4)
    })

    it('is continuous at the d=0 boundary: d=-0.0001 and d=0 both render alpha ≈ 1', () => {
      expect(focusCurve(-0.0001, 'list').alpha).toBeCloseTo(1, 4)
      expect(focusCurve(0, 'list').alpha).toBe(1)
    })

    it('scale is unaffected below the band — the additive fade only ever touches alpha', () => {
      expect(focusCurve(-16, 'list').scale).toBe(1)
      expect(focusCurve(-999, 'list').scale).toBe(1)
    })
  })
})

describe('electFocusRow — bande d\'hystérésis (§4.2 : bottom − 140 ± 45)', () => {
  const rowsAround = (focusY: number, currentOffset: number): readonly FocusRowCandidate[] => [
    { id: 'row-current', midY: focusY + currentOffset },
    { id: 'row-nearer', midY: focusY + 5 },
  ]

  it('with no current winner, the candidate whose midY is nearest focusY wins', () => {
    const winner = electFocusRow({
      candidates: [
        { id: 'a', midY: 100 },
        { id: 'b', midY: 500 },
        { id: 'c', midY: 515 },
      ],
      focusY: 510,
      currentId: null,
      hysteresis: 45,
    })
    expect(winner).toBe('c')
  })

  it('ties on distance are broken by ascending id — deterministic, no reliance on array order', () => {
    const winner = electFocusRow({
      candidates: [
        { id: 'b', midY: 510 },
        { id: 'a', midY: 490 },
      ],
      focusY: 500,
      currentId: null,
      hysteresis: 45,
    })
    expect(winner).toBe('a')
  })

  it('an oscillation of ±40px around focusY (band ±45) never changes the winner — the current keeps the hand', () => {
    const focusY = 500
    const hysteresis = 45
    const offsets = [40, -40, 35, -35, 20, -20, 40, -40, 0]
    let currentId: string | null = 'row-current'

    for (const offset of offsets) {
      currentId = electFocusRow({
        candidates: rowsAround(focusY, offset),
        focusY,
        currentId,
        hysteresis,
      })
      expect(currentId).toBe('row-current')
    }
  })

  it('stays sticky even against a strictly nearer candidate, as long as the current stays inside the band', () => {
    const winner = electFocusRow({
      candidates: [
        { id: 'row-current', midY: 540 }, // distance 40, inside the ±45 band
        { id: 'row-nearer', midY: 505 }, // distance 5 — nearer, but current wins anyway
      ],
      focusY: 500,
      currentId: 'row-current',
      hysteresis: 45,
    })
    expect(winner).toBe('row-current')
  })

  it('elects the nearest candidate once the current drifts outside the hysteresis band', () => {
    const winner = electFocusRow({
      candidates: [
        { id: 'row-current', midY: 550 }, // distance 50 — outside the ±45 band
        { id: 'row-nearer', midY: 505 },
      ],
      focusY: 500,
      currentId: 'row-current',
      hysteresis: 45,
    })
    expect(winner).toBe('row-nearer')
  })

  it('treats a currentId absent from the candidate list (row scrolled out) as no current winner', () => {
    const winner = electFocusRow({
      candidates: [
        { id: 'row-a', midY: 495 },
        { id: 'row-b', midY: 700 },
      ],
      focusY: 500,
      currentId: 'row-gone',
      hysteresis: 45,
    })
    expect(winner).toBe('row-a')
  })

  it('is exactly at the boundary: distance === hysteresis keeps the current (inclusive band)', () => {
    const winner = electFocusRow({
      candidates: [
        { id: 'row-current', midY: 545 }, // distance exactly 45
        { id: 'row-nearer', midY: 505 },
      ],
      focusY: 500,
      currentId: 'row-current',
      hysteresis: 45,
    })
    expect(winner).toBe('row-current')
  })

  it('returns null when there are no candidates at all', () => {
    expect(
      electFocusRow({ candidates: [], focusY: 500, currentId: null, hysteresis: 45 }),
    ).toBeNull()
  })

  it('does not mutate the candidates array passed in', () => {
    const candidates: FocusRowCandidate[] = [
      { id: 'b', midY: 510 },
      { id: 'a', midY: 490 },
    ]
    const snapshot = [...candidates]
    electFocusRow({ candidates, focusY: 500, currentId: null, hysteresis: 45 })
    expect(candidates).toEqual(snapshot)
  })
})
