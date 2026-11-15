// #17113 — régénérer les vecteurs croisés sous une AUTRE version de libsignal
// effacerait le seul jeu qui prouve qu'une session de l'ancienne version
// s'ouvre encore (#9231). Le générateur refuse tant que ce jeu n'est pas
// rangé dans `fixtures/libsignal/legacy/<version>.vectors.json`.

import { describe, it, expect } from 'vitest';
import { overwriteRefusal as refusal } from '../../scripts/libsignal-vectors-overwrite.mjs';

describe('generate-libsignal-vectors — jamais d’écrasement d’un jeu d’une autre version non rangé (#17113)', () => {
  it('refuse quand le jeu courant porte une autre version et que legacy/<version> manque', () => {
    expect(refusal({ existingVersion: '0.106.2', version: '0.107.0', legacyExists: false })).toContain(
      'fixtures/libsignal/legacy/0.106.2.vectors.json',
    );
  });

  it('accepte quand l’ancien jeu est déjà rangé dans legacy/', () => {
    expect(refusal({ existingVersion: '0.106.2', version: '0.107.0', legacyExists: true })).toBeUndefined();
  });

  it('accepte de régénérer à la même version', () => {
    expect(refusal({ existingVersion: '0.106.2', version: '0.106.2', legacyExists: false })).toBeUndefined();
  });

  it('accepte quand aucun jeu courant n’existe', () => {
    expect(refusal({ existingVersion: undefined, version: '0.106.2', legacyExists: false })).toBeUndefined();
  });
});
