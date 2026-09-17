import { describe, expect, test } from 'bun:test';

import type { CanvasObject, CanvasScene } from '@/lib/canvas/document';

import {
  MAX_CARD_HEIGHT_RATIO,
  MIN_CARD_ASPECT,
  SCENE_ASPECT,
  cappedContentSize,
  cardAspect,
  carouselAspect,
  clampedCardAspect,
  focus,
  imageAspect,
} from './scene-framing';

const obj = (overrides: Partial<CanvasObject>): CanvasObject => ({
  id: overrides.id ?? 'o',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: {},
  ...overrides,
});

const bg = (payload: Record<string, unknown>, id = 'bg'): CanvasObject => obj({ id, kind: 'media', plane: 'bg', payload });

const scene = (objects: readonly CanvasObject[], extra: Partial<CanvasScene> = {}): CanvasScene => ({ id: 's', objects, ...extra });

describe('cardAspect / focus — la carte cadre sur le contenu', () => {
  test('fond 16:9 + texte à y:0.42 ⇒ cadre pleine largeur, hauteur = union(bande, boîte plancher)', () => {
    const s = scene([bg({ aspectRatio: 16 / 9 }), obj({ id: 't', anchor: { t: 'free', x: 0.5, y: 0.42 } })]);
    const bandHeight = SCENE_ASPECT / (16 / 9);
    const bandTop = (1 - bandHeight) / 2;
    const textFloored = 0.42; // MINIMUM_SIDE
    const textTop = 0.42 - textFloored / 2;
    const expectedTop = Math.min(bandTop, textTop);
    const expectedBottom = Math.max(bandTop + bandHeight, textTop + textFloored);
    const result = focus(s);
    expect(result).not.toBeNull();
    expect(result?.width).toBe(1);
    expect(result?.y).toBeCloseTo(expectedTop, 6);
    expect(result?.height).toBeCloseTo(expectedBottom - expectedTop, 6);
  });

  test('fond couleur (sans image) + texte seul ⇒ cadre = boîte du texte, plancher 0.42', () => {
    const s = scene([bg({ background: '#4338CA' }), obj({ id: 't' })]);
    const result = focus(s);
    expect(result).toEqual({ x: 0, y: 0.29, width: 1, height: 0.42 });
    expect(cardAspect(s)).toBeCloseTo((1 * SCENE_ASPECT) / 0.42, 6);
  });

  test('fond 9:16 plein, rien d’autre ⇒ null (rien à resserrer)', () => {
    const s = scene([bg({ aspectRatio: 9 / 16 })]);
    expect(focus(s)).toBeNull();
    expect(cardAspect(s)).toBeUndefined();
  });

  test('imageAspect — image seule 4:1 intacte ⇒ 4', () => {
    const s = scene([bg({ aspectRatio: 4 })]);
    expect(imageAspect(s)).toBe(4);
  });

  test('imageAspect — image + un objet visible ⇒ undefined (échoue fermé)', () => {
    const s = scene([bg({ aspectRatio: 4 }), obj({ id: 't' })]);
    expect(imageAspect(s)).toBeUndefined();
  });

  test('imageAspect — carrierAspect posé ⇒ undefined', () => {
    const s = scene([bg({ aspectRatio: 4 })], { carrierAspect: 1.5 });
    expect(imageAspect(s)).toBeUndefined();
  });
});

describe('clampedCardAspect / cappedContentSize — plafond 1,4', () => {
  test('clamp(9/16) = 1/1.4 ; clamp(1.2) = 1.2 (déjà sous le plafond)', () => {
    expect(clampedCardAspect(SCENE_ASPECT)).toBeCloseTo(MIN_CARD_ASPECT, 10);
    expect(clampedCardAspect(1.2)).toBeCloseTo(1.2, 10);
  });

  test('les deux moitiés du seuil : hauteur/largeur 1,39 passe, 1,41 se plafonne', () => {
    const under = 1 / 1.39;
    const over = 1 / 1.41;
    expect(clampedCardAspect(under)).toBeCloseTo(under, 10);
    expect(clampedCardAspect(over)).toBeCloseTo(1 / MAX_CARD_HEIGHT_RATIO, 10);
  });

  test('contenu 9/16 dans une boîte 338×473 ⇒ 266×473, centré (bandes latérales)', () => {
    const size = cappedContentSize(SCENE_ASPECT, { width: 338, height: 473 });
    expect(size.height).toBeCloseTo(473, 1);
    expect(size.width).toBeCloseTo(473 * SCENE_ASPECT, 1);
  });
});

describe('carouselAspect — la page la plus haute vote, une page vide s’abstient', () => {
  test('panorama 4:1, portrait 9:16, fond nu ⇒ 9/16', () => {
    const scenes = [scene([bg({ aspectRatio: 4 })], { id: 'a' }), scene([bg({ aspectRatio: 9 / 16 })], { id: 'b' }), scene([bg({})], { id: 'c' })];
    expect(carouselAspect(scenes)).toBeCloseTo(SCENE_ASPECT, 10);
  });

  test('fond nu seul ⇒ 9/16 (défaut, aucune page ne vote)', () => {
    expect(carouselAspect([scene([bg({})])])).toBeCloseTo(SCENE_ASPECT, 10);
  });

  test('panorama seul ⇒ 4', () => {
    expect(carouselAspect([scene([bg({ aspectRatio: 4 })])])).toBe(4);
  });
});
