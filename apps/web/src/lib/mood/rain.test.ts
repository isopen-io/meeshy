import { describe, expect, test } from 'bun:test';

import { createRainEngine, rainPose, RAIN_GLYPH_PX, type RainParticle } from './rain';

/**
 * **LA PLUIE D'EMOJI** (#10813) — chaque instance naît à une place aléatoire,
 * grossit en se balançant, pâlit À MESURE qu'elle grossit, est TOTALEMENT
 * transparente quand sa taille atteint la moitié de la largeur de l'écran, et
 * disparaît alors du moteur. Leur nombre est BORNÉ, quoi qu'il arrive.
 */

const viewport = { width: 400, height: 800 } as const;

/** Un hasard REJOUABLE — la même suite à chaque témoin. */
const seeded = (seed = 7) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const particle = (overrides: Partial<RainParticle> = {}): RainParticle => ({
  id: 1,
  x: 200,
  y: 400,
  bornAt: 0,
  lifeMs: 4000,
  swayPx: 18,
  swayHz: 0.5,
  phase: 0,
  tiltDeg: 12,
  ...overrides,
});

describe('la pose d’une instance', () => {
  test('elle grossit et pâlit ensemble : plus elle est grande, plus elle est transparente', () => {
    const p = particle();
    const early = rainPose(p, 400, viewport);
    const late = rainPose(p, 3200, viewport);
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(late!.sizePx).toBeGreaterThan(early!.sizePx);
    expect(late!.opacity).toBeLessThan(early!.opacity);
  });

  test('à la moitié de la largeur de l’écran, elle est totalement transparente — puis elle n’existe plus', () => {
    const p = particle();
    const last = rainPose(p, 3999, viewport);
    expect(last!.sizePx).toBeGreaterThan(viewport.width * 0.5 * 0.99);
    expect(last!.opacity).toBeLessThan(0.01);
    expect(rainPose(p, 4000, viewport)).toBeNull();
  });

  test('elle se balance : sa position horizontale oscille autour de sa naissance', () => {
    const p = particle({ swayHz: 1, phase: 0 });
    const xs = [250, 500, 750, 1000].map((t) => rainPose(p, t, viewport)!.dx);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeLessThan(0);
    for (const dx of xs) expect(Math.abs(dx)).toBeLessThanOrEqual(p.swayPx + 1e-9);
  });

  test('seules transform et opacity bougent : la pose est une transformation GPU', () => {
    const pose = rainPose(particle(), 1000, viewport)!;
    expect(pose.transform).toMatch(/^translate3d\(.+\) scale\(.+\) rotate\(.+deg\)$/);
    expect(pose.transform).toContain(`scale(${(pose.sizePx / RAIN_GLYPH_PX).toFixed(4)})`);
  });
});

describe('le moteur', () => {
  test('le nombre d’instances vivantes ne dépasse JAMAIS la borne', () => {
    const engine = createRainEngine({ viewport: () => viewport, random: seeded(), maxParticles: 6, spawnEveryMs: 10, lifeMs: 4000 });
    let peak = 0;
    for (let now = 0; now <= 20_000; now += 16) {
      engine.tick(now);
      peak = Math.max(peak, engine.live().length);
    }
    expect(peak).toBe(6);
  });

  test('une instance arrivée à son fondu est RETIRÉE, et le moteur le dit', () => {
    const engine = createRainEngine({ viewport: () => viewport, random: seeded(), maxParticles: 3, spawnEveryMs: 100_000, lifeMs: 1000 });
    const first = engine.tick(0);
    expect(first.born).toHaveLength(1);
    expect(engine.live()).toHaveLength(1);
    expect(engine.tick(500).retired).toEqual([]);
    const later = engine.tick(1000);
    expect(later.retired).toEqual([first.born[0]!.id]);
    expect(engine.live()).toHaveLength(0);
  });

  test('les instances naissent partout dans la vue, jamais hors d’elle', () => {
    const engine = createRainEngine({ viewport: () => viewport, random: seeded(3), maxParticles: 40, spawnEveryMs: 1, lifeMs: 100_000 });
    for (let now = 0; now < 40; now += 1) engine.tick(now);
    const born = engine.live();
    expect(born.length).toBe(40);
    for (const p of born) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(viewport.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(viewport.height);
    }
    const left = born.filter((p) => p.x < viewport.width / 2).length;
    expect(left).toBeGreaterThan(5);
    expect(left).toBeLessThan(35);
  });

  test('une borne nulle (mouvement réduit) ne fait naître personne', () => {
    const engine = createRainEngine({ viewport: () => viewport, random: seeded(), maxParticles: 0, spawnEveryMs: 1, lifeMs: 1000 });
    for (let now = 0; now < 1000; now += 16) expect(engine.tick(now).born).toEqual([]);
    expect(engine.live()).toEqual([]);
  });
});
