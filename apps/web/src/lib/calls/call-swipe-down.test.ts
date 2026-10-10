import { describe, expect, test } from 'bun:test';

import { SWIPE_DOWN_COURSE, swipeDownAllowed, swipeDownOffset, swipeDownOutcome, swipeDownStarted } from './call-swipe-down';

/**
 * GLISSER L'ÉCRAN D'APPEL VERS LE BAS (#9096, miroir de
 * `CallPiPPolicy.swipeDownOutcome` sur iOS) — en duo, l'écran suit le doigt
 * sur sa course et, relâché aux trois quarts (ou lancé franchement), quitte le
 * plein écran : vers l'image dans l'image quand le navigateur l'offre, sinon
 * vers la bulle. Un toucher reste un toucher ; le groupe garde ses gestes.
 */

describe('swipeDownStarted — un toucher reste un toucher', () => {
  test('sous 50 px, ce n’est pas encore un glissé', () => {
    expect(swipeDownStarted({ dx: 0, dy: 49 })).toBe(false);
  });

  test('vers le bas, au-delà de 50 px, c’est un glissé', () => {
    expect(swipeDownStarted({ dx: 10, dy: 60 })).toBe(true);
  });

  test('un glissé surtout horizontal n’en est pas un', () => {
    expect(swipeDownStarted({ dx: 90, dy: 60 })).toBe(false);
  });

  test('vers le haut, jamais', () => {
    expect(swipeDownStarted({ dx: 0, dy: -120 })).toBe(false);
  });
});

describe('swipeDownAllowed — où le geste existe', () => {
  test('en duo connecté, au repos : vidéo, audio, écran partagé', () => {
    expect(swipeDownAllowed({ joined: true, layout: 'video-duo', layerIdle: true })).toBe(true);
    expect(swipeDownAllowed({ joined: true, layout: 'portrait', layerIdle: true })).toBe(true);
    expect(swipeDownAllowed({ joined: true, layout: 'screen', layerIdle: true })).toBe(true);
  });

  test('en groupe, la scène garde ses propres gestes', () => {
    expect(swipeDownAllowed({ joined: true, layout: 'grid', layerIdle: true })).toBe(false);
  });

  test('menu, panneau ou mode ouvert : ses curseurs et ses rangées gardent les leurs', () => {
    expect(swipeDownAllowed({ joined: true, layout: 'video-duo', layerIdle: false })).toBe(false);
  });

  test('avant la connexion, l’écran n’a rien à réduire', () => {
    expect(swipeDownAllowed({ joined: false, layout: 'portrait', layerIdle: true })).toBe(false);
  });
});

describe('swipeDownOffset — l’écran suit le doigt', () => {
  test('sur sa course, bornée', () => {
    expect(swipeDownOffset({ dy: 120, allowed: true, reducedMotion: false })).toBe(120);
    expect(swipeDownOffset({ dy: 900, allowed: true, reducedMotion: false })).toBe(SWIPE_DOWN_COURSE);
    expect(swipeDownOffset({ dy: -40, allowed: true, reducedMotion: false })).toBe(0);
  });

  test('mouvement réduit : l’écran ne bouge pas, le geste conclut quand même', () => {
    expect(swipeDownOffset({ dy: 200, allowed: true, reducedMotion: true })).toBe(0);
    expect(swipeDownOutcome({ dy: 260, velocity: 0, allowed: true, canPip: false })).toBe('pill');
  });

  test('là où le geste n’existe pas, rien ne bouge', () => {
    expect(swipeDownOffset({ dy: 200, allowed: false, reducedMotion: false })).toBe(0);
  });
});

describe('swipeDownOutcome — relâcher', () => {
  test('aux trois quarts de la course : la bulle', () => {
    expect(swipeDownOutcome({ dy: 225, velocity: 0, allowed: true, canPip: false })).toBe('pill');
  });

  test('… ou l’image dans l’image, quand le navigateur l’offre', () => {
    expect(swipeDownOutcome({ dy: 225, velocity: 0, allowed: true, canPip: true })).toBe('pip');
  });

  test('relâché avant, lentement : l’écran revient', () => {
    expect(swipeDownOutcome({ dy: 200, velocity: 0.2, allowed: true, canPip: true })).toBe('none');
  });

  test('un lancer franc conclut avant les trois quarts', () => {
    expect(swipeDownOutcome({ dy: 90, velocity: 1.5, allowed: true, canPip: false })).toBe('pill');
  });

  test('un toucher, ou un glissé vers le haut, ne conclut jamais', () => {
    expect(swipeDownOutcome({ dy: 0, velocity: 0, allowed: true, canPip: true })).toBe('none');
    expect(swipeDownOutcome({ dy: -260, velocity: -2, allowed: true, canPip: true })).toBe('none');
  });

  test('là où le geste n’existe pas, jamais', () => {
    expect(swipeDownOutcome({ dy: 280, velocity: 2, allowed: false, canPip: true })).toBe('none');
  });
});
