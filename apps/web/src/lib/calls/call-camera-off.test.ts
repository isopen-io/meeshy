import { describe, expect, test } from 'bun:test';

import * as cameraOff from './call-camera-off';

describe('G4.6 — le fondu image ↔ avatar', () => {
  test('250 ms, et 120 ms sous « Réduire les animations » : plus court, jamais supprimé', () => {
    expect(cameraOff.cameraOffFadeMs(false)).toBe(250);
    expect(cameraOff.cameraOffFadeMs(true)).toBe(120);
  });
});

describe('G4.2 · P9.6 (#17637) — la parole de la caméra coupée ne se lit plus dans les sous-titres', () => {
  test('la loi de la scène noire ne porte plus de lecture des sous-titres : l’anneau suit le niveau audio reçu (`usePeerSpeaking`), comme le duo audio', () => {
    expect(Object.keys(cameraOff)).toEqual(['cameraOffFadeMs']);
  });
});
