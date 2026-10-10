import { describe, expect, test } from 'bun:test';

import {
  COMMENTS_ZONE_SHARE,
  COMMENTS_ZONE_TOP_GAP_PX,
  KEYBOARD_MIN_PX,
  commentsZoneOf,
  commentsZoneStageOf,
  nextKeyboardBaseline,
  virtualKeyboardOf,
} from './comments-zone';

/**
 * #9894 (jumelle web de #9893) — SUR UNE STORY, LA ZONE DE COMMENTAIRES MONTE
 * AVEC LE COMPOSEUR, PLUS ENCORE AVEC LE CLAVIER. Quatre états : composeur
 * absent (visiteur), replié en bulle, visible, visible + clavier virtuel.
 */
describe('commentsZoneStageOf — l’état de la zone', () => {
  test('sans clavier, la zone suit la présence du composeur', () => {
    expect(commentsZoneStageOf({ composer: 'absent', keyboardOpen: false })).toBe('absent');
    expect(commentsZoneStageOf({ composer: 'folded', keyboardOpen: false })).toBe('folded');
    expect(commentsZoneStageOf({ composer: 'open', keyboardOpen: false })).toBe('open');
  });

  test('le clavier ouvert sur le composeur visible : on tape', () => {
    expect(commentsZoneStageOf({ composer: 'open', keyboardOpen: true })).toBe('typing');
  });

  test('replier pendant que le clavier se retire : la zone descend AVEC le clavier, pas avant', () => {
    expect(commentsZoneStageOf({ composer: 'folded', keyboardOpen: true })).toBe('typing');
  });

  test('sans composeur, aucun clavier ne fait monter la zone', () => {
    expect(commentsZoneStageOf({ composer: 'absent', keyboardOpen: true })).toBe('absent');
  });
});

describe('commentsZoneOf — la hauteur de la zone sur les quatre états', () => {
  const share = (stage: 'absent' | 'folded' | 'open') => Number.parseFloat(commentsZoneOf({ stage, keyboardInset: 0, reducedMotion: false }).height);

  test('la zone MONTE quand le composeur paraît : absent ≤ bulle < visible', () => {
    expect(share('absent')).toBeLessThanOrEqual(share('folded'));
    expect(share('folded')).toBeLessThan(share('open'));
    expect(commentsZoneOf({ stage: 'open', keyboardInset: 0, reducedMotion: false }).height).toBe(`${COMMENTS_ZONE_SHARE.open * 100}%`);
  });

  test('hors clavier, la zone se pose au bas du cadre, au-dessus de l’indicateur d’accueil', () => {
    const zone = commentsZoneOf({ stage: 'folded', keyboardInset: 0, reducedMotion: false });
    expect(zone.bottom).toBe(0);
    expect(zone.paddingBottom).toBe('env(safe-area-inset-bottom, 0px)');
  });

  test('clavier ouvert : la zone occupe TOUT l’espace libre au-dessus du clavier, sous l’encoche', () => {
    const zone = commentsZoneOf({ stage: 'typing', keyboardInset: 320, reducedMotion: false });
    expect(zone.bottom).toBe(320);
    expect(zone.height).toBe(`calc(100% - 320px - env(safe-area-inset-top, 0px) - ${COMMENTS_ZONE_TOP_GAP_PX}px)`);
    expect(zone.paddingBottom).toBe('0px');
  });

  test('coque Android (la WebView rétrécit, aucun retrait) : la zone remplit le cadre réduit', () => {
    const zone = commentsZoneOf({ stage: 'typing', keyboardInset: 0, reducedMotion: false });
    expect(zone.bottom).toBe(0);
    expect(zone.height).toBe(`calc(100% - 0px - env(safe-area-inset-top, 0px) - ${COMMENTS_ZONE_TOP_GAP_PX}px)`);
  });

  test('sans saut : hauteur et bord bas glissent ensemble ; aucun mouvement si on le refuse', () => {
    const moving = commentsZoneOf({ stage: 'open', keyboardInset: 0, reducedMotion: false }).transition;
    expect(moving).toContain('height');
    expect(moving).toContain('bottom');
    expect(commentsZoneOf({ stage: 'open', keyboardInset: 0, reducedMotion: true }).transition).toBe('none');
  });
});

describe('virtualKeyboardOf — le clavier virtuel, lu au visualViewport', () => {
  const baseline = { width: 390, height: 844 };

  test('Safari iOS : la fenêtre garde sa hauteur, la vue visible rétrécit — retrait et clavier ouvert', () => {
    expect(virtualKeyboardOf({ innerHeight: 844, viewportHeight: 508, viewportOffsetTop: 0, baseline })).toEqual({ inset: 336, open: true });
  });

  test('coque Android : la WebView rétrécit — aucun retrait, mais le clavier est ouvert', () => {
    expect(virtualKeyboardOf({ innerHeight: 520, viewportHeight: 520, viewportOffsetTop: 0, baseline })).toEqual({ inset: 0, open: true });
  });

  test('la barre d’adresse qui se replie n’est pas un clavier', () => {
    expect(virtualKeyboardOf({ innerHeight: 844, viewportHeight: 844 - KEYBOARD_MIN_PX + 1, viewportOffsetTop: 0, baseline }).open).toBe(false);
  });

  test('rien ne rétrécit : clavier fermé', () => {
    expect(virtualKeyboardOf({ innerHeight: 844, viewportHeight: 844, viewportOffsetTop: 0, baseline })).toEqual({ inset: 0, open: false });
  });
});

describe('nextKeyboardBaseline — la hauteur de référence, sans clavier', () => {
  test('elle garde la plus grande hauteur vue à largeur égale', () => {
    expect(nextKeyboardBaseline({ width: 390, height: 844 }, { width: 390, height: 500 })).toEqual({ width: 390, height: 844 });
    expect(nextKeyboardBaseline({ width: 390, height: 800 }, { width: 390, height: 844 })).toEqual({ width: 390, height: 844 });
  });

  test('une rotation (largeur changée) repart de la hauteur mesurée', () => {
    expect(nextKeyboardBaseline({ width: 390, height: 844 }, { width: 844, height: 390 })).toEqual({ width: 844, height: 390 });
  });

  test('aucune référence : la première mesure en devient une', () => {
    expect(nextKeyboardBaseline(null, { width: 390, height: 844 })).toEqual({ width: 390, height: 844 });
  });
});
