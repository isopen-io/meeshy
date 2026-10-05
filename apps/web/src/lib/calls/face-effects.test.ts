import { describe, expect, test } from 'bun:test';

import { FACE_EFFECTS } from './video-effects';
import { FACE_DETECT_EVERY, FACE_FRAME_BUDGET_MS, faceGrade, glowBucket, particleSeeds, haloOf, heuristicFaceBox, hornsOf, nextEffectLoad, risingParticles, shouldDetect, smoothFaceBox, sparklesOf, toadOf, demonEyesOf, lavaGlow, type Box } from './face-effects';

/**
 * LES EFFETS DE VISAGE, EN GÉOMÉTRIE PURE (#8551) — où poser les cornes, le
 * halo, les yeux du crapaud ; où sont les braises à l'instant `t`. Tout est
 * déterministe et piloté par le temps : la même image, au même instant, donne
 * le même dessin — c'est ce qui le rend testable et sans à-coups.
 */

const face: Box = { x: 400, y: 200, width: 300, height: 380 };
const centerX = (box: Box) => box.x + box.width / 2;

describe('où est le visage', () => {
  test('sans détecteur, le visage est supposé au centre, vers le haut du cadre', () => {
    const box = heuristicFaceBox({ width: 1280, height: 720 });
    expect(centerX(box)).toBeCloseTo(640, 5);
    expect(box.width).toBeCloseTo(1280 * 0.34, 5);
    expect(box.y + box.height / 2).toBeCloseTo(720 * 0.38, 5);
  });

  test('en portrait, la largeur supposée reste bornée par la hauteur', () => {
    const box = heuristicFaceBox({ width: 720, height: 1280 });
    expect(box.width).toBeCloseTo(720 * 0.34, 5);
    expect(box.height).toBeGreaterThan(box.width);
  });

  test('le détecteur ne tourne qu’une image sur cinq', () => {
    expect(FACE_DETECT_EVERY).toBe(5);
    expect([0, 1, 2, 3, 4, 5, 10].map(shouldDetect)).toEqual([true, false, false, false, false, true, true]);
  });

  test('la boîte suit le visage en douceur, sans sauter', () => {
    const next = { x: 500, y: 200, width: 300, height: 380 };
    const once = smoothFaceBox(face, next);
    expect(once.x).toBeGreaterThan(face.x);
    expect(once.x).toBeLessThan(next.x);
    const settled = Array.from({ length: 40 }).reduce<Box>((box) => smoothFaceBox(box, next), face);
    expect(settled.x).toBeCloseTo(next.x, 1);
    expect(smoothFaceBox(null, next)).toEqual(next);
  });
});

describe('les ornements se posent sur la tête', () => {
  test('les cornes du démon partent du haut du crâne, symétriques, et montent', () => {
    const { left, right } = hornsOf(face);
    expect(left.tip.y).toBeLessThan(face.y);
    expect(right.tip.y).toBeLessThan(face.y);
    expect(centerX(face) - left.tip.x).toBeCloseTo(right.tip.x - centerX(face), 5);
    expect(left.tip.x).toBeLessThan(centerX(face));
  });

  test('le halo de l’ange flotte au-dessus de la tête et scintille avec le temps', () => {
    const early = haloOf(face, 0);
    const later = haloOf(face, 400);
    expect(early.cy).toBeLessThan(face.y);
    expect(early.cx).toBeCloseTo(centerX(face), 5);
    expect(early.rx).toBeGreaterThan(face.width * 0.3);
    expect(early.glow).not.toBe(later.glow);
    expect(early.glow).toBeGreaterThan(0);
    expect(early.glow).toBeLessThanOrEqual(1);
  });

  test('le crapaud a deux gros yeux au sommet du visage, des joues gonflées et quelques verrues', () => {
    const toad = toadOf(face);
    expect(toad.eyes).toHaveLength(2);
    expect(toad.eyes.every((eye) => eye.cy < face.y + face.height * 0.25 && eye.r > face.width * 0.1)).toBe(true);
    expect(toad.eyes.every((eye) => eye.pupil < eye.r)).toBe(true);
    expect(toad.cheeks).toHaveLength(2);
    expect(toad.warts.length).toBeGreaterThanOrEqual(3);
    expect(toad.warts.every((wart) => wart.x > face.x && wart.x < face.x + face.width)).toBe(true);
  });

  test('les yeux du démon brillent dans le visage', () => {
    const eyes = demonEyesOf(face, 0);
    expect(eyes).toHaveLength(2);
    expect(eyes.every((eye) => eye.cy > face.y && eye.cy < face.y + face.height / 2)).toBe(true);
  });

  test('les plumes de l’ange tournent autour de la tête', () => {
    const now = sparklesOf(face, 0);
    const then = sparklesOf(face, 800);
    expect(now.length).toBeGreaterThan(3);
    expect(now).not.toEqual(then);
    expect(sparklesOf(face, 800)).toEqual(then);
  });
});

describe('les braises et la lave', () => {
  const area: Box = { x: 0, y: 0, width: 1280, height: 720 };

  test('les mêmes braises au même instant : un dessin déterministe', () => {
    expect(risingParticles({ seed: 7, t: 1234, count: 20, area })).toEqual(risingParticles({ seed: 7, t: 1234, count: 20, area }));
  });

  test('elles restent dans le cadre et MONTENT avec le temps', () => {
    const before = risingParticles({ seed: 3, t: 1000, count: 12, area });
    const after = risingParticles({ seed: 3, t: 1100, count: 12, area });
    expect(before.every((p) => p.x >= area.x && p.x <= area.x + area.width && p.y >= area.y && p.y <= area.y + area.height)).toBe(true);
    const rose = before.filter((p, index) => (after[index]?.y ?? p.y) < p.y).length;
    expect(rose).toBeGreaterThan(before.length / 2);
    expect(before.every((p) => p.alpha >= 0 && p.alpha <= 1 && p.r > 0)).toBe(true);
  });

  test('les paramètres d’une graine se calculent UNE fois : seule la phase change d’une image à l’autre (#9100)', () => {
    const first = particleSeeds(11, 28);
    expect(particleSeeds(11, 28)).toBe(first);
    expect(first).toHaveLength(28);
    expect(particleSeeds(12, 28)).not.toBe(first);
    expect(risingParticles({ seed: 11, t: 0, count: 28, area })).not.toEqual(risingParticles({ seed: 11, t: 500, count: 28, area }));
    expect(particleSeeds(11, 28)).toBe(first);
  });

  test('la lueur de lave vacille, sans jamais s’éteindre', () => {
    const glows = [0, 150, 300, 450, 600].map(lavaGlow);
    expect(new Set(glows).size).toBeGreaterThan(1);
    expect(glows.every((glow) => glow >= 0.55 && glow <= 1)).toBe(true);
  });
});

describe('l’étalonnage de chaque effet', () => {
  test('ange, démon et éruption changent la couleur de toute l’image ; chacun la sienne', () => {
    const grades = (['angel', 'demon', 'volcano'] as const).map(faceGrade);
    expect(grades.every((grade) => grade.length > 0)).toBe(true);
    expect(new Set(grades).size).toBe(3);
  });

  test('aucun, lissage et crapaud ne touchent que le visage', () => {
    expect(faceGrade('none')).toBe('');
    expect(faceGrade('smoothing')).toBe('');
    expect(faceGrade('toad')).toBe('');
    expect(FACE_EFFECTS.map(faceGrade)).toHaveLength(6);
  });
});

describe('le budget d’une image', () => {
  test('trop lent en moyenne, l’effet renonce aux ornements ; revenu sous le seuil, il les reprend', () => {
    const slow = Array.from({ length: 30 }).reduce((load: ReturnType<typeof nextEffectLoad>) => nextEffectLoad(load, FACE_FRAME_BUDGET_MS * 3), { ema: 0, degraded: false });
    expect(slow.degraded).toBe(true);
    const fast = Array.from({ length: 60 }).reduce((load: ReturnType<typeof nextEffectLoad>) => nextEffectLoad(load, 1), slow);
    expect(fast.degraded).toBe(false);
  });

  test('une image lente isolée ne fait pas renoncer', () => {
    expect(nextEffectLoad({ ema: 2, degraded: false }, FACE_FRAME_BUDGET_MS * 2).degraded).toBe(false);
  });
});

describe('les lueurs en sprites quantifiés (#9100)', () => {
  test('deux tailles voisines partagent un sprite ; des tailles éloignées, non', () => {
    expect(glowBucket(40)).toBe(glowBucket(41));
    expect(glowBucket(40)).not.toBe(glowBucket(80));
    expect(glowBucket(40)).toBeGreaterThanOrEqual(40 * 0.85);
    expect(glowBucket(40)).toBeLessThanOrEqual(40 * 1.2);
    expect(glowBucket(0.5)).toBeGreaterThanOrEqual(4);
  });
});
