/**
 * LA PARITÉ DU CATALOGUE DE SUCCÈS (#5759).
 *
 * `AchievementCatalog.swift` est le MIROIR de `achievement-families.ts` et de
 * `achievement-view.ts` : le catalogue Xcode ne peut pas importer un module
 * TypeScript, il en est la projection. Rien n'empêche mécaniquement les deux de
 * diverger — sauf ce témoin.
 *
 * Ce qu'une divergence coûterait : deux utilisateurs, l'un sur web l'autre sur
 * iOS, verraient des DÉFIS DIFFÉRENTS pour le même compte. Pas une erreur, pas
 * un plantage : deux vérités. C'est exactement le mécanisme qui a produit trois
 * familles de Prisme divergentes en trois cycles (§ Prisme, cycles 118-120), et
 * ce fichier existe pour que ça ne recommence pas.
 *
 * Le témoin lit le SOURCE Swift plutôt qu'un binaire : il n'a besoin ni de
 * Xcode ni d'un simulateur, donc il tourne dans le même `bun test` que le reste.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACHIEVEMENT_FAMILIES, familyId } from '../types/achievement-families.js';
import {
  ACHIEVEMENT_COUNT_TIERS,
  ACHIEVEMENT_SIZE_TIERS,
} from '../types/achievement-catalog.js';
import {
  ACHIEVEMENT_WINDOW_MINIMUM,
  ACHIEVEMENT_WINDOW_STEP,
} from '../utils/achievement-view.js';

const SWIFT = readFileSync(
  join(import.meta.dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/AchievementCatalog.swift'),
  'utf8',
);

/** Les familles déclarées côté Swift, lues dans leur ordre de déclaration. */
function familiesFromSwift(): Array<{ id: string; base: number }> {
  const motif =
    /AchievementFamily\(section: "([^"]+)", subject: "([^"]+)", verb: "([^"]+)", scale: "([^"]+)", baseDifficulty: ([0-9.]+)\)/g;
  const sorties: Array<{ id: string; base: number }> = [];
  for (const m of SWIFT.matchAll(motif)) {
    sorties.push({ id: `${m[2]}.${m[3]}.${m[4]}`, base: Number.parseFloat(m[5]) });
  }
  return sorties;
}

describe('le catalogue Swift est le miroir EXACT du catalogue TypeScript', () => {
  it('déclare les mêmes familles, dans le même ordre', () => {
    const swift = familiesFromSwift().map((f) => f.id);
    const ts = ACHIEVEMENT_FAMILIES.map(familyId);
    expect(swift).toEqual(ts);
  });

  it('leur donne la MÊME difficulté de base — sinon l’ordre diverge', () => {
    // Une base différente ne casse rien visiblement : elle réordonne. Deux
    // écrans montreraient alors des défis différents pour un même compte.
    const swift = new Map(familiesFromSwift().map((f) => [f.id, f.base]));
    for (const famille of ACHIEVEMENT_FAMILIES) {
      expect(swift.get(familyId(famille))).toBe(famille.baseDifficulty);
    }
  });

  it('n’a PAS de famille que le TypeScript ignore', () => {
    // Le cas concret : `community.leave.count`, retirée du TS faute de signal
    // (#5760). La laisser côté Swift ferait promettre à iOS un succès que rien
    // ne peut faire tomber.
    const ts = new Set(ACHIEVEMENT_FAMILIES.map(familyId));
    const intrus = familiesFromSwift().map((f) => f.id).filter((id) => !ts.has(id));
    expect(intrus).toEqual([]);
  });

  it('porte les mêmes paliers', () => {
    const count = /countTiers: \[Int\] = \[([^\]]+)\]/.exec(SWIFT)?.[1] ?? '';
    const size = /sizeTiers: \[Int\] = \[([^\]]+)\]/.exec(SWIFT)?.[1] ?? '';
    const lire = (texte: string) =>
      texte.split(',').map((n) => Number.parseInt(n.replace(/[_\s]/g, ''), 10));
    expect(lire(count)).toEqual([...ACHIEVEMENT_COUNT_TIERS]);
    expect(lire(size)).toEqual([...ACHIEVEMENT_SIZE_TIERS]);
  });

  it('porte la même fenêtre — sept, puis deux par deux', () => {
    expect(Number.parseInt(/windowMinimum = (\d+)/.exec(SWIFT)?.[1] ?? '', 10)).toBe(
      ACHIEVEMENT_WINDOW_MINIMUM,
    );
    expect(Number.parseInt(/windowStep = (\d+)/.exec(SWIFT)?.[1] ?? '', 10)).toBe(
      ACHIEVEMENT_WINDOW_STEP,
    );
  });
});
