/**
 * Suite de vecteurs de la loi du Jeu Meeshy (#9373).
 *
 * Deux gardes, deux questions :
 *  - `runVectors` REJOUE chaque cas du fichier à travers la loi : tombe si la
 *    loi change sans que le fichier suive ;
 *  - le test de divergence compare le fichier à ce que la loi PRODUIT : tombe
 *    si le fichier est retouché à la main, ou s'il manque un cas du plan.
 *
 * Régénération voulue : `UPDATE_GAME_VECTORS=1 npx vitest run __tests__/vectors/game.vectors.test.ts`.
 *
 * @see packages/shared/fixtures/reading-modes/game.vectors.json
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVectors } from './harness.js';
import {
  GAME_VECTORS_FORMAT,
  buildGameVectors,
  evaluateGameVector,
  type GameVectorInput,
} from '../game/game-vectors-law.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'reading-modes', 'game.vectors.json');

const render = (): string =>
  `${JSON.stringify({ $format: GAME_VECTORS_FORMAT, vectors: buildGameVectors() }, null, 2)}\n`;

if (process.env.UPDATE_GAME_VECTORS === '1') writeFileSync(FILE, render());

runVectors<GameVectorInput, unknown>('game', (input) => JSON.parse(JSON.stringify(evaluateGameVector(input))) as unknown);

describe('game.vectors.json ne diverge pas de la loi', () => {
  it('est exactement ce que la loi produit', () => {
    expect(JSON.parse(readFileSync(FILE, 'utf-8'))).toEqual(JSON.parse(render()));
  });

  it('couvre chaque loi par au moins un cas', () => {
    const laws = new Set((buildGameVectors().map((v) => v.input.law)));
    expect([...laws].sort()).toEqual(
      [
        'level',
        'level-record',
        'mint-price',
        'mint-preview',
        'glory-standing',
        'glory-gain',
        'treasury',
        'flame-form',
        'flame-advance',
        'flame-status',
        'flame-relight',
        'tailwind',
        'prism-hour',
        'mission-objective',
        'mission-reward',
        'rng',
        'missions-draw',
        'mission-reroll',
        'chest',
        'guide',
      ].sort(),
    );
  });
});
