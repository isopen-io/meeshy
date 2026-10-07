import { describe, expect, test } from 'bun:test';

import { detectionOf, surfaceCapture, type CaptureHost } from './capture-policy';

/* UN CONTENU QUI DISPARAÎT EST SOIT ANNONCÉ, SOIT NOIR — JAMAIS CAPTURÉ EN
   SILENCE (règle de la revue de sécurité de #9617, valable pour la coque).
   Dans la coque, un éphémère n'échappe à FLAG_SECURE que si sa capture
   produira l'annonce : capture ET enregistrement détectés sur cette version,
   ET la surface qui l'affiche déclarée par la collecte du fil. */

/** Ce que `MeeshyScreenGuard.getState` rend selon la version d'Android (`ScreenGuardRules`). */
const shellOn = (sdk: number): CaptureHost => ({
  kind: 'shell',
  detection: detectionOf({ screenshotDetection: sdk >= 34, recordingDetection: sdk >= 35, recording: false }),
});

describe('la politique de capture d’une surface', () => {
  test('un message ordinaire est libre partout', () => {
    for (const host of [shellOn(33), shellOn(36), { kind: 'browser' } as const]) {
      expect(surfaceCapture({ verdict: 'free', host, declared: false })).toBe('free');
    }
  });

  test('une vue unique ou une nature illisible est noire partout dans la coque', () => {
    expect(surfaceCapture({ verdict: 'blocked', host: shellOn(36), declared: true })).toBe('blocked');
  });

  test('Android 13 et avant : aucune détection, l’éphémère est noir', () => {
    expect(surfaceCapture({ verdict: 'announced', host: shellOn(33), declared: true })).toBe('blocked');
  });

  test('Android 14 : la capture se détecte, pas l’enregistrement — l’éphémère est noir', () => {
    expect(surfaceCapture({ verdict: 'announced', host: shellOn(34), declared: true })).toBe('blocked');
  });

  test('Android 15+ : capture et enregistrement détectés, l’éphémère d’une rangée déclarée est annoncé', () => {
    expect(surfaceCapture({ verdict: 'announced', host: shellOn(35), declared: true })).toBe('announced');
    expect(surfaceCapture({ verdict: 'announced', host: shellOn(36), declared: true })).toBe('announced');
  });

  test('une surface que la collecte ne déclare pas (visionneuse, citation) est noire', () => {
    expect(surfaceCapture({ verdict: 'announced', host: shellOn(36), declared: false })).toBe('blocked');
  });

  test('tant que la coque n’a pas dit ce qu’elle détecte : fermé', () => {
    expect(surfaceCapture({ verdict: 'announced', host: { kind: 'shell', detection: null }, declared: true })).toBe('blocked');
    expect(detectionOf(undefined)).toBeNull();
    expect(detectionOf({ screenshotDetection: 'oui' })).toBeNull();
  });

  test('le navigateur ne détecte rien : l’éphémère y reste capturable en silence (limite acceptée)', () => {
    expect(surfaceCapture({ verdict: 'announced', host: { kind: 'browser' }, declared: true })).toBe('announced');
  });
});
