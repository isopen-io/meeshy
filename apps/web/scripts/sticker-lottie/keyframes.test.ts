import { describe, expect, test } from 'bun:test';

import { animatedValue, decomposeAffine, unwrapDegrees } from './keyframes';

describe('decomposeAffine — une matrice de navigateur devient position, rotation, échelle', () => {
  test('rotation de 90° et échelle (2, 3) se retrouvent, la translation aussi', () => {
    const angle = Math.PI / 2;
    const m = [2 * Math.cos(angle), 2 * Math.sin(angle), -3 * Math.sin(angle), 3 * Math.cos(angle), 7, -4] as const;
    const t = decomposeAffine(m);
    expect(t.position).toEqual([7, -4]);
    expect(t.rotation).toBeCloseTo(90, 6);
    expect(t.scale[0]).toBeCloseTo(200, 6);
    expect(t.scale[1]).toBeCloseTo(300, 6);
  });

  test('un miroir horizontal garde son signe dans l’échelle verticale, pas une rotation inventée', () => {
    const t = decomposeAffine([-1, 0, 0, 1, 0, 0]);
    expect(Math.abs(t.rotation)).toBeCloseTo(180, 6);
    expect(t.scale[1]).toBeCloseTo(-100, 6);
  });

  test('une échelle nulle ne produit ni NaN ni infini', () => {
    const t = decomposeAffine([0, 0, 0, 0, 3, 3]);
    expect([...t.position, t.rotation, ...t.scale].every(Number.isFinite)).toBe(true);
  });
});

describe('unwrapDegrees — un tour complet reste continu', () => {
  test('350° puis 10° devient 350 puis 370, jamais un retour en arrière de 340°', () => {
    expect(unwrapDegrees([340, 350, 10, 20])).toEqual([340, 350, 370, 380]);
  });
});

describe('animatedValue — l’échantillonnage image par image devient des keyframes linéaires', () => {
  test('une valeur constante est STATIQUE', () => {
    expect(animatedValue([[5], [5], [5]], { epsilon: 0.1, loopFrames: 3 })).toEqual({ a: 0, k: 5 });
  });

  test('une droite garde ses deux bouts, le milieu redondant est retiré, et la boucle revient au départ', () => {
    const value = animatedValue([[0], [1], [2], [3], [4]], { epsilon: 0.01, loopFrames: 5 });
    expect(value.a).toBe(1);
    const frames = value.a === 1 ? value.k.map((key) => key.t) : [];
    expect(frames).toEqual([0, 4, 5]);
    expect(value.a === 1 ? value.k.at(-1)?.s : null).toEqual([0]);
  });

  test('un coude au milieu reste une keyframe', () => {
    const value = animatedValue([[0], [5], [10], [5], [0]], { epsilon: 0.01, loopFrames: 5 });
    expect(value.a === 1 ? value.k.map((key) => key.t) : []).toEqual([0, 2, 4, 5]);
  });

  test('aucun écart à la courbe échantillonnée ne dépasse la tolérance', () => {
    const samples = Array.from({ length: 60 }, (_, i) => [Math.sin(i / 6) * 20]);
    const value = animatedValue(samples, { epsilon: 0.25, loopFrames: 60 });
    if (value.a !== 1) throw new Error('attendu animé');
    const at = (t: number) => {
      const next = value.k.findIndex((key) => key.t >= t);
      const b = value.k[next] as { t: number; s: number[] };
      const a = value.k[Math.max(0, next - 1)] as { t: number; s: number[] };
      return b.t === a.t ? (a.s[0] as number) : (a.s[0] as number) + (((b.s[0] as number) - (a.s[0] as number)) * (t - a.t)) / (b.t - a.t);
    };
    samples.forEach(([v], t) => expect(Math.abs(at(t) - (v as number))).toBeLessThanOrEqual(0.3));
  });
});
