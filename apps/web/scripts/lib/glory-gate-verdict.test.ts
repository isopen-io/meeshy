import { describe, expect, test } from 'bun:test';

import { anchoredBox, geometryDrift, gloryVerdict, type GloryMeasure } from './glory-gate-verdict';

/**
 * LE VERDICT DU GATE DE FIDÉLITÉ DES CADRES DE GLOIRE (#10159, § 8.3) — ce qui
 * ROUGIT quel que soit le mode, et ce que `--report` se contente d'IMPRIMER.
 * Vu rouge d'abord : en `--report`, une peinture INSTABLE était rangée avec
 * les écarts de tolérance et sortait en 0, alors que la CI, D-211 et le
 * commit affirmaient le contraire ; et un manifeste qui dérive rendait le
 * gate vert sur ZÉRO cible composée.
 */

const THRESHOLDS = { share: 0.995, blockMeanDelta: 12 } as const;

const measure = (over: Partial<GloryMeasure> = {}): GloryMeasure => ({ file: 'savane-ambassadeur-1.plain.webp', stable: true, share: 0.999, worstBlock: 3, ...over });

const verdict = (over: Partial<Parameters<typeof gloryVerdict>[0]> = {}) =>
  gloryVerdict({ measures: [measure()], skipped: [], demoCollections: ['poses'], reportOnly: true, thresholds: THRESHOLDS, ...over });

describe('une peinture instable est ROUGE, --report ou non', () => {
  test('en --report, un still peint deux fois différemment rougit — il n’est pas une mesure de tolérance', () => {
    const result = verdict({ measures: [measure({ stable: false })] });
    expect(result.red).toBe(true);
    expect(result.unstable).toEqual(['savane-ambassadeur-1.plain.webp']);
    expect(result.outOfTolerance).toEqual([]);
  });

  test('une cible stable mais hors tolérance se MESURE en --report, et rougit sans', () => {
    const measured = verdict({ measures: [measure({ share: 0.9 })] });
    expect(measured.red).toBe(false);
    expect(measured.outOfTolerance).toEqual(['savane-ambassadeur-1.plain.webp']);
    expect(verdict({ measures: [measure({ share: 0.9 })], reportOnly: false }).red).toBe(true);
    expect(verdict({ measures: [measure({ worstBlock: 13 })], reportOnly: false }).red).toBe(true);
  });

  test('aux seuils exacts, la cible est dans la tolérance', () => {
    expect(verdict({ measures: [measure({ share: 0.995, worstBlock: 12 })], reportOnly: false }).red).toBe(false);
  });
});

describe('le plancher des cibles composées', () => {
  test('zéro cible composée est ROUGE, même en --report : un manifeste qui dérive ne rend pas le gate vert', () => {
    const result = verdict({ measures: [], skipped: [{ file: 'savane-ambassadeur-1.plain.webp', collection: 'savane' }] });
    expect(result.red).toBe(true);
    expect(result.nothingComposed).toBe(true);
  });

  test('une collection sans manifeste rougit, sauf si elle est déclarée de démonstration', () => {
    const drifted = verdict({ skipped: [{ file: 'olympe-ambassadeur-1.plain.webp', collection: 'olympe' }] });
    expect(drifted.red).toBe(true);
    expect(drifted.unexpectedlySkipped).toEqual(['olympe-ambassadeur-1.plain.webp']);
    const demo = verdict({ skipped: [{ file: 'poses-pied.plain.webp', collection: 'poses' }] });
    expect(demo.red).toBe(false);
    expect(demo.unexpectedlySkipped).toEqual([]);
  });
});

describe('ce que le résumé dit', () => {
  test('ROUGE nomme chaque cause ; MESURE ne nomme que les écarts de tolérance', () => {
    const red = verdict({ measures: [measure({ stable: false }), measure({ file: 'neon-ambassadeur-1.plain.webp', share: 0.9 })], skipped: [{ file: 'olympe-ambassadeur-1.plain.webp', collection: 'olympe' }] });
    expect(red.summary).toContain('ROUGE');
    expect(red.summary).toContain('instable');
    expect(red.summary).toContain('savane-ambassadeur-1.plain.webp');
    expect(red.summary).toContain('olympe-ambassadeur-1.plain.webp');
    const measured = verdict({ measures: [measure({ file: 'neon-ambassadeur-1.plain.webp', share: 0.9 })] });
    expect(measured.summary).toContain('MESURE');
    expect(measured.summary).toContain('neon-ambassadeur-1.plain.webp');
    expect(verdict().summary).toBe('vert');
  });
});

/**
 * LA GÉOMÉTRIE DES CIBLES : le générateur applique `lib/anchors.json` (lot L2,
 * #10153 — Mee et Meo déplacés hors de la photo, en repère 540 × 960) à
 * l'enregistrement de chaque SVG ; le contrat versionné ne porte PAS ces
 * ancres. La comparaison exclut donc les oiseaux aux DEUX places, et le
 * rapport nomme l'écart — il ne se maquille pas en « tolérance ».
 */
describe('les ancres corrigées du générateur', () => {
  test('la boîte d’un oiseau ancré se déplace de dx, dy × échelle et se réduit de son facteur, depuis son coin', () => {
    expect(anchoredBox([52, 1248, 264, 264], { bird: 0, dx: 0, dy: 72, scale: 1 }, 2)).toEqual([52, 1392, 264, 264]);
    expect(anchoredBox([52, 1248, 264, 264], { bird: 0, dx: -25, dy: 50, scale: 0.5 }, 2)).toEqual([2, 1348, 132, 132]);
    expect(anchoredBox([52, 1248, 264, 264], undefined, 2)).toEqual([52, 1248, 264, 264]);
  });

  test('l’écart se nomme par cadre : chaque oiseau déplacé, en pixels de l’image', () => {
    expect(geometryDrift([{ bird: 0, dx: 0, dy: 72, scale: 1 }, { bird: 1, dx: 0, dy: 82, scale: 1 }], 2)).toBe('oiseaux posés ailleurs dans la cible (anchors.json, L2) : Mee dy +144 · Meo dy +164');
    expect(geometryDrift([{ bird: 1, dx: -4, dy: 0, scale: 0.88 }], 2)).toBe('oiseaux posés ailleurs dans la cible (anchors.json, L2) : Meo dx -8 ×0.88');
    expect(geometryDrift([], 2)).toBeNull();
  });
});
