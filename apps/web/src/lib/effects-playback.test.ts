import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS as F } from '@meeshy/shared/types/message-effect-flags';

import {
  confettiFrame,
  confettiSeeds,
  effectPlaybackPlanOf,
  ENTRANCE_SURFACE_ANIMATIONS,
  fireworkFrame,
  fireworkSeeds,
  hasDecorativeEffects,
  glowLayerAnimation,
  PULSE_ANIMATION,
  rainbowCometAnimation,
} from './effects-playback';

describe('effectPlaybackPlanOf — miroir de MessageEffectPlan (iOS)', () => {
  test('aucun effet décoratif ⇒ rien à jouer (les bits de cycle de vie ne comptent pas)', () => {
    expect(hasDecorativeEffects(F.EPHEMERAL | F.BLURRED | F.VIEW_ONCE)).toBe(false);
    expect(hasDecorativeEffects(undefined)).toBe(false);
    expect(hasDecorativeEffects(F.CONFETTI)).toBe(true);
  });

  test('mouvement autorisé : apparitions et persistants joués, animés', () => {
    const plan = effectPlaybackPlanOf(F.SHAKE | F.CONFETTI | F.PULSE | F.RAINBOW, false);
    expect(plan.appearance).toEqual(['shake', 'confetti']);
    expect(plan.persistent).toEqual(['pulse', 'rainbow']);
    expect(plan.animatesPersistent).toBe(true);
    expect(plan.flash).toBe(false);
  });

  test('réduire les animations : aucune apparition, un éclat ; glow et rainbow posés fixes, pulse et sparkle retirés', () => {
    const plan = effectPlaybackPlanOf(F.ZOOM | F.GLOW | F.PULSE | F.RAINBOW | F.SPARKLE, true);
    expect(plan.appearance).toEqual([]);
    expect(plan.flash).toBe(true);
    expect(plan.persistent).toEqual(['glow', 'rainbow']);
    expect(plan.animatesPersistent).toBe(false);
  });

  test('réduire les animations sans apparition : pas d’éclat', () => {
    expect(effectPlaybackPlanOf(F.GLOW, true).flash).toBe(false);
  });
});

describe('les images clés parcourent réellement le mouvement', () => {
  test('la secousse n’est pas plate : elle passe par ±8 px et revient à 0', () => {
    const frames = ENTRANCE_SURFACE_ANIMATIONS.shake?.keyframes ?? [];
    const xs = frames.map((frame) => Number(/translateX\((-?[\d.]+)px\)/.exec(String(frame.transform))?.[1]));
    expect(Math.max(...xs)).toBeCloseTo(8, 1);
    expect(Math.min(...xs)).toBeCloseTo(-8, 1);
    expect(xs[0]).toBeCloseTo(0, 5);
    expect(xs[xs.length - 1]).toBeCloseTo(0, 5);
    expect(ENTRANCE_SURFACE_ANIMATIONS.shake?.options.duration).toBe(600);
  });

  test('le halo respire par l’OPACITÉ de son calque (jamais un filtre repeint) ; posé fixe sans mouvement', () => {
    const glow = glowLayerAnimation(true);
    expect(glow?.options.iterations).toBe(Infinity);
    expect(glow?.keyframes.every((frame) => frame.filter === undefined && frame.boxShadow === undefined)).toBe(true);
    expect(glowLayerAnimation(false)).toBeNull();
    expect(PULSE_ANIMATION.options.iterations).toBe(Infinity);
  });

  test('la comète court 55 % du cycle puis se repose', () => {
    const { keyframes, options } = rainbowCometAnimation();
    expect(options.duration).toBe(4500);
    const rest = keyframes.filter((frame) => (frame.offset ?? 0) >= 0.55);
    expect(rest.every((frame) => frame.opacity === 0)).toBe(true);
  });
});

describe('particules — tirées une fois, position déduite du temps écoulé', () => {
  const rng = () => 0.5;

  test('confettis : 30, tombent du haut vers le bas puis s’effacent', () => {
    const seeds = confettiSeeds(rng);
    expect(seeds).toHaveLength(30);
    const seed = seeds[0];
    if (seed === undefined) throw new Error('seed');
    expect(confettiFrame(seed, 0, 200, 100).y).toBe(-10);
    expect(confettiFrame(seed, 1500, 200, 100).y).toBeCloseTo(120, 5);
    expect(confettiFrame(seed, 1700, 200, 100).opacity).toBeCloseTo(0, 5);
  });

  test('feux d’artifice : 20 étincelles qui partent du centre', () => {
    const seeds = fireworkSeeds(rng);
    expect(seeds).toHaveLength(20);
    const seed = seeds[0];
    if (seed === undefined) throw new Error('seed');
    expect(fireworkFrame(seed, 0, 200, 100)).toEqual({ x: 100, y: 50, opacity: 1 });
    expect(fireworkFrame(seed, 800, 200, 100).x).toBeCloseTo(160, 5);
  });
});
