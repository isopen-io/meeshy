import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  SWIPE_ACTION_ZONE,
  SWIPE_COMMIT_DISTANCE,
  SWIPE_RUBBER_BAND,
  messageSwipeOffset,
  messageSwipeOutcome,
  replyDirectionOf,
  swipeDominanceRatio,
  swipeEngages,
  swipeMinimumDistance,
  swipeResistanceOf,
  swipeYieldsTo,
} from './swipe';

beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

describe('la loi du glissé latéral — miroir de BubbleSwipeResistance (#7559)', () => {
  test('les seuils sont ceux d’iOS : 22 px / 3:1 en normal, 48 px / 4:1 en résistant', () => {
    expect(swipeMinimumDistance('normal')).toBe(22);
    expect(swipeDominanceRatio('normal')).toBe(3);
    expect(swipeMinimumDistance('resistant')).toBe(48);
    expect(swipeDominanceRatio('resistant')).toBe(4);
    expect(SWIPE_ACTION_ZONE).toBe(72);
    expect(SWIPE_RUBBER_BAND).toBe(0.15);
    expect(SWIPE_COMMIT_DISTANCE).toBe(66);
  });

  test('une bulle audio/vidéo résiste : 40 px suffisent en normal, pas en résistant', () => {
    expect(swipeEngages(40, 0, 'normal')).toBe(true);
    expect(swipeEngages(40, 0, 'resistant')).toBe(false);
    expect(swipeEngages(49, 0, 'resistant')).toBe(true);
    expect(swipeEngages(-49, 0, 'resistant')).toBe(true);
    expect(swipeEngages(60, 16, 'resistant')).toBe(false);
    expect(swipeEngages(60, 14, 'resistant')).toBe(true);
  });

  test('la résistance se lit sur les pièces : audio ou vidéo ⇒ résistant, image ou texte ⇒ normal', () => {
    expect(swipeResistanceOf([{ mimeType: 'audio/mp4' }])).toBe('resistant');
    expect(swipeResistanceOf([{ mimeType: 'image/png' }, { mimeType: 'video/mp4' }])).toBe('resistant');
    expect(swipeResistanceOf([{ mimeType: 'image/jpeg' }])).toBe('normal');
    expect(swipeResistanceOf(undefined)).toBe('normal');
  });

  test('sens de la réponse : rangée plate toujours vers la droite ; bulle reçue à droite, envoyée à gauche', () => {
    expect(replyDirectionOf({ flat: true, isMine: true })).toBe(1);
    expect(replyDirectionOf({ flat: true, isMine: false })).toBe(1);
    expect(replyDirectionOf({ flat: false, isMine: false })).toBe(1);
    expect(replyDirectionOf({ flat: false, isMine: true })).toBe(-1);
  });

  const both = { resistance: 'normal', replyDirection: 1, canReply: true, canForward: true } as const;

  test('le décalage suit le doigt dans LES DEUX sens, avec l’élastique au-delà de 72 px', () => {
    expect(messageSwipeOffset(50, 0, both)).toBe(50);
    expect(messageSwipeOffset(-50, 0, both)).toBe(-50);
    expect(messageSwipeOffset(172, 0, both)).toBeCloseTo(72 + 100 * 0.15);
    expect(messageSwipeOffset(10, 0, both)).toBeNull();
  });

  test('un sens sans action ne déplace pas la rangée', () => {
    expect(messageSwipeOffset(-80, 0, { ...both, canForward: false })).toBe(0);
    expect(messageSwipeOffset(80, 0, { ...both, canReply: false })).toBe(0);
    expect(messageSwipeOffset(-80, 0, { ...both, replyDirection: -1, canForward: false })).toBe(-72 - 8 * 0.15);
  });

  test('relâcher au-delà de 66 px dans le sens de la réponse RÉPOND, dans l’autre TRANSFÈRE, en deçà rien', () => {
    expect(messageSwipeOutcome(66, both)).toBe('reply');
    expect(messageSwipeOutcome(-66, both)).toBe('forward');
    expect(messageSwipeOutcome(65, both)).toBeNull();
    expect(messageSwipeOutcome(-66, { ...both, replyDirection: -1 })).toBe('reply');
    expect(messageSwipeOutcome(66, { ...both, replyDirection: -1 })).toBe('forward');
    expect(messageSwipeOutcome(-70, { ...both, canForward: false })).toBeNull();
  });

  test('un geste né sur une piste de lecture (curseur, onde, couche qui réclame) ne glisse pas la rangée', () => {
    document.body.innerHTML = `
      <div id="row">
        <p id="text">bonjour</p>
        <span role="slider" id="wave"><i id="bar"></i></span>
        <div data-claims-gesture><b id="scrub"></b></div>
        <input type="range" id="range" />
      </div>`;
    const at = (id: string) => document.getElementById(id);
    expect(swipeYieldsTo(at('text'))).toBe(false);
    expect(swipeYieldsTo(at('bar'))).toBe(true);
    expect(swipeYieldsTo(at('scrub'))).toBe(true);
    expect(swipeYieldsTo(at('range'))).toBe(true);
    expect(swipeYieldsTo(null)).toBe(false);
  });
});
