import { describe, expect, test } from 'bun:test';

import { mintCeremonyPlan, type MintCeremonyPlan } from '@meeshy/shared/utils/game/mint-ceremony';

import {
  DEFAULT_TARGET,
  SCENE_MARKS,
  buildCeremonyParticles,
  ceremonyFrame,
  drawCeremonyParticles,
  sceneTime,
  weaveRadius,
  type CeremonyCanvas,
  type CeremonyPalette,
} from './choreography-mint-ceremony';

/**
 * LA CÉRÉMONIE, IMAGE PAR IMAGE (#11177) — ce que la scène plein écran montre à un instant donné, sans navigateur :
 * le cercle que les étincelles tissent, le flan, le marteau gardé levé, la gravure au coup, le revers à la
 * révélation, l'Ombre et le retour de la lumière au refus, le fondu des animations réduites.
 */

const PALETTE: CeremonyPalette = {
  weave: ['w0', 'w1', 'w2'],
  iris: ['i0', 'i1', 'i2', 'i3', 'i4', 'i5', 'i6'],
  silver: ['s0', 's1'],
  gold: ['g0', 'g1'],
  diamond: ['d0', 'd1'],
  spark: ['k0', 'k1'],
  ash: 'ash',
};

const recorder = (): CeremonyCanvas & { readonly styles: Set<string>; rects: number } => {
  const styles = new Set<string>();
  const record = {
    styles,
    rects: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    get fillStyle(): string {
      return '';
    },
    set fillStyle(value: string) {
      styles.add(value);
    },
    setTransform: () => undefined,
    clearRect: () => undefined,
    fillRect: () => void (record.rects += 1),
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
  };
  return record;
};

const at = (plan: MintCeremonyPlan, phase: keyof MintCeremonyPlan['phases'], edge: 'fromMs' | 'toMs' = 'fromMs'): number => (plan.phases[phase]?.[edge] ?? NaN) / 1000;
const frame = (plan: MintCeremonyPlan, t: number) => ceremonyFrame(plan, t, DEFAULT_TARGET);
const silver = mintCeremonyPlan({ edition: 'silver', mode: 'normal' });

describe('les étincelles tissent un cercle', () => {
  const particles = buildCeremonyParticles(silver, 92);

  test('autant de fils, de grains et de gerbes que la loi en demande', () => {
    expect(particles.weave).toHaveLength(silver.particles.weave);
    expect(particles.dust).toHaveLength(silver.particles.dust.reduce((sum, d) => sum + d.count, 0));
    expect(particles.bursts).toHaveLength(silver.particles.bursts.reduce((sum, n) => sum + n, 0));
  });

  test('la même pièce tisse toujours le même cercle', () => {
    expect(buildCeremonyParticles(silver, 92).weave[17]).toEqual(particles.weave[17]);
  });

  test('avant leur départ, les étincelles sont dans ta lumière ; une fois le cercle resserré, sur l’anneau', () => {
    expect(weaveRadius(silver, particles, 0, 0)).toBeNull();
    const tight = at(silver, 'tighten', 'toMs') + 0.05;
    const radii = particles.weave.map((_, index) => weaveRadius(silver, particles, index, tight)).filter((r): r is number => r !== null);
    expect(radii.length).toBe(particles.weave.length);
    for (const radius of radii) expect(Math.abs(radius - SCENE_MARKS.radius)).toBeLessThan(2);
  });

  test('pendant la tresse, les deux brins s’écartent de l’anneau, en sens opposés', () => {
    const braiding = at(silver, 'tighten') - 0.05;
    const spread = particles.weave.map((_, index) => weaveRadius(silver, particles, index, braiding) ?? SCENE_MARKS.radius).map((r) => Math.abs(r - SCENE_MARKS.radius));
    expect(Math.max(...spread)).toBeGreaterThan(5);
  });

  test('le flan figé, plus aucune étincelle ni poussière : seules les gerbes des coups jaillissent', () => {
    const canvas = recorder();
    expect(drawCeremonyParticles(canvas, silver, particles, PALETTE, at(silver, 'blank', 'toMs') + 0.3, 1)).toBe(0);
    expect(drawCeremonyParticles(recorder(), silver, particles, PALETTE, (silver.strikes[0]?.impactMs ?? 0) / 1000 + 0.05, 1)).toBeGreaterThan(0);
  });

  test('l’argent tisse en argent et sème un peu d’or ; le prisme tisse en sept couleurs et sème du diamant', () => {
    const canvas = recorder();
    drawCeremonyParticles(canvas, silver, particles, PALETTE, at(silver, 'dust', 'toMs'), 1);
    expect([...canvas.styles].some((s) => s.startsWith('s'))).toBe(true);
    expect([...canvas.styles].some((s) => s.startsWith('g'))).toBe(true);
    expect([...canvas.styles].some((s) => s.startsWith('i'))).toBe(false);
    const prism = mintCeremonyPlan({ edition: 'prism', mode: 'normal' });
    const iris = recorder();
    drawCeremonyParticles(iris, prism, buildCeremonyParticles(prism, 1000), PALETTE, at(prism, 'dust', 'toMs'), 1);
    expect([...iris.styles].filter((s) => s.startsWith('i')).length).toBeGreaterThan(3);
    expect([...iris.styles].some((s) => s.startsWith('d'))).toBe(true);
    expect([...iris.styles].some((s) => s.startsWith('s'))).toBe(false);
  });
});

describe('la frappe arrive en dernier', () => {
  test('le flan vierge descend, puis la gravure apparaît au coup', () => {
    const impact = (silver.strikes[0]?.impactMs ?? 0) / 1000;
    expect(frame(silver, at(silver, 'blank', 'toMs')).coin.opacity).toBe(1);
    expect(frame(silver, impact - 0.01).coin.engraved).toBe(0);
    expect(frame(silver, impact + 0.3).coin.engraved).toBe(1);
    expect(frame(silver, at(silver, 'descent', 'toMs')).coin.y).toBeGreaterThan(SCENE_MARKS.circle.y);
  });

  test('tant que la passerelle n’a pas répondu, Meo garde le marteau levé', () => {
    const waiting = mintCeremonyPlan({ edition: 'silver', mode: 'normal', answeredAtMs: 9000 });
    const held = frame(waiting, 7);
    expect(held.hammerMeo.angle).toBeGreaterThan(55);
    expect(held.coin.engraved).toBe(0);
    expect(held.flash).toBe(0);
  });

  test('au coup : l’éclair, l’onde, le « tchak » et le tremblement', () => {
    const impact = (silver.strikes[0]?.impactMs ?? 0) / 1000;
    const hit = frame(silver, impact + 0.04);
    expect(hit.flash).toBeGreaterThan(0.5);
    expect(hit.ring.opacity).toBeGreaterThan(0.5);
    expect(hit.tchak.opacity).toBeGreaterThan(0.4);
    expect(Math.abs(hit.shake.x) + Math.abs(hit.shake.y)).toBeGreaterThan(0);
    expect(hit.tchak.final).toBe(false);
  });

  test('à l’or, le dernier « tchak » est le grand, les rayons jaillissent et les aïeux se manifestent', () => {
    const gold = mintCeremonyPlan({ edition: 'gold', mode: 'normal' });
    const last = (gold.strikes.at(-1)?.impactMs ?? 0) / 1000;
    expect(frame(gold, last + 0.04).tchak.final).toBe(true);
    expect(frame(gold, last + 0.6).rays.opacity).toBeGreaterThan(0.9);
    expect(frame(gold, at(gold, 'ancestors', 'toMs')).sign).toBe(1);
    expect(frame(silver, at(silver, 'celebrate')).sign).toBe(0);
  });

  test('au prisme, Mee prend un marteau pour le dernier coup seulement', () => {
    const prism = mintCeremonyPlan({ edition: 'prism', mode: 'normal' });
    const [first, , last] = prism.strikes;
    expect(frame(prism, (first?.atMs ?? 0) / 1000).hammerMee.opacity).toBe(0);
    expect(frame(prism, (last?.atMs ?? 0) / 1000).hammerMee.opacity).toBe(1);
    expect(frame(silver, (silver.strikes[0]?.atMs ?? 0) / 1000).hammerMee.opacity).toBe(0);
  });

  test('la pièce se lève et montre son revers, puis file dans l’Héritage', () => {
    const shown = frame(silver, at(silver, 'reveal', 'toMs'));
    expect(shown.coin.rotateY % 360).toBe(180);
    expect(shown.mee.pose).toBe('party');
    expect(shown.say).toBe(0);
    expect(frame(silver, at(silver, 'celebrate') + 0.3).say).toBe(1);
    const arrived = frame(silver, at(silver, 'flight', 'toMs'));
    expect(arrived.coin.x).toBeCloseTo(DEFAULT_TARGET.x, 5);
    expect(arrived.coin.opacity).toBe(0);
    expect(arrived.backdrop).toBe(0);
  });
});

describe('le refus ramène la lumière', () => {
  const refused = mintCeremonyPlan({ edition: 'silver', mode: 'refused', answeredAtMs: 1500 });
  const particles = buildCeremonyParticles(refused, 92);
  const refusedAt = (refused.refusal?.atMs ?? 0) / 1000;

  test('après le refus, la scène remonte jusqu’au départ des étincelles, et s’y arrête', () => {
    expect(sceneTime(refused, refusedAt - 0.2)).toBeCloseTo(refusedAt - 0.2, 6);
    expect(sceneTime(refused, refusedAt + 0.2)).toBeLessThan(refusedAt);
    const rewound = (refused.refusal?.rewind.toMs ?? 0) / 1000 + 0.1;
    expect(sceneTime(refused, rewound)).toBeLessThan(at(refused, 'emit'));
    expect(drawCeremonyParticles(recorder(), refused, particles, PALETTE, rewound, 1)).toBe(0);
  });

  test('l’Ombre voile le cercle ; ni marteau, ni pièce ; Mee dit ce qui bloque', () => {
    const shaded = frame(refused, refusedAt + 0.5);
    expect(shaded.shadow.opacity).toBeGreaterThan(0.9);
    expect(shaded.coin.opacity).toBe(0);
    expect(shaded.flash).toBe(0);
    const said = frame(refused, (refused.refusal?.sayMs ?? 0) / 1000 + 0.3);
    expect(said.say).toBe(1);
    expect(said.mee.pose).toBe('courage');
    expect(Number.isNaN(said.coin.opacity + said.glow.opacity + said.ring.opacity + said.rays.opacity + said.sign)).toBe(false);
  });

  test('un refus pendant le marteau levé dénoue aussi le flan', () => {
    const late = mintCeremonyPlan({ edition: 'gold', mode: 'refused', answeredAtMs: 6000 });
    expect(frame(late, 5.9).coin.opacity).toBe(1);
    expect(frame(late, (late.refusal?.rewind.toMs ?? 0) / 1000 + 0.1).coin.opacity).toBe(0);
  });
});

describe('réduire les animations', () => {
  const reduced = mintCeremonyPlan({ edition: 'gold', mode: 'reduced' });

  test('la pièce apparaît frappée en fondu, de face au revers, sans tremblement ni particule', () => {
    expect(frame(reduced, 0).coin.opacity).toBe(0);
    const shown = frame(reduced, 0.3);
    expect(shown.coin.opacity).toBe(1);
    expect(shown.coin.engraved).toBe(1);
    expect(shown.coin.rotateY).toBe(180);
    expect(shown.shake).toEqual({ x: 0, y: 0 });
    expect(drawCeremonyParticles(recorder(), reduced, buildCeremonyParticles(reduced, 100), PALETTE, 0.3, 1)).toBe(0);
  });
});
