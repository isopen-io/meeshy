/**
 * Vecteurs inter-plateformes pour `focusCurve`
 * (`packages/shared/utils/focus-curve.ts`, §4.1, amendement A3).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/focus-curve.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — C-023,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur ──
 * `input` = `{ distance: number, variant: 'thread' | 'list' }`, appelé tel
 * quel comme `focusCurve(distance, variant)`. `expected` = `{ alpha, scale }`,
 * comparés avec la tolérance flottante du harnais (1e-4).
 *
 * Couverture de branche :
 *   - `thread` : d = 0 (pile), 190 (mi-course), 380 (borne `f = 1`),
 *     400 (au-delà de la borne, `f` clampé à 1 — même résultat que 380),
 *     et une distance négative (`-50`, clampée à `f = 0`, donc
 *     `alpha = scale = 1`, PAS de terme « sous la bande » pour ce variant).
 *   - `list` : d = 0, 260 (mi-course), 520 (borne `f = 1`), 600 (au-delà,
 *     clampé — même résultat que 520).
 *   - `list` sous la bande de focus (`distance < 0`, terme additif
 *     `belowBandFade`) : -16 (fondu court, `-16/160 = -0.1`), -56 (pile sur
 *     le plafond `-0.35`, `-56/160 = -0.35`), -100 (au-delà du plafond,
 *     `-100/160 ≈ -0.625` PLAFONNÉ à `-0.35` — même résultat que -56).
 */
import { focusCurve, type FocusCurveVariant, type FocusCurveResult } from '../../utils/focus-curve.js';
import { runVectors } from './harness.js';

type FocusCurveVectorInput = {
  readonly distance: number;
  readonly variant: FocusCurveVariant;
};

runVectors<FocusCurveVectorInput, FocusCurveResult>('focus-curve', ({ distance, variant }) =>
  focusCurve(distance, variant),
);
