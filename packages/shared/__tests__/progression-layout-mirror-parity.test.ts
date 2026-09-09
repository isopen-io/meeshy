/**
 * LA PARITÉ DE LA COMPOSITION (#5838).
 *
 * `ProgressionLayout.swift` est le MIROIR de `progression-layout.ts`. Xcode ne
 * peut pas importer un module TypeScript : le Swift en est la projection, et
 * rien n'empêche mécaniquement les deux de diverger — sauf ce témoin.
 *
 * Ce qu'une divergence coûterait est exactement ce que ce lot vient de
 * réparer : deux utilisateurs, l'un sur web l'autre sur iOS, trouveraient les
 * mêmes blocs à des places différentes. Pas une erreur, pas un plantage : deux
 * vérités. Et l'écrire une fois de chaque côté sans les comparer, c'est
 * reproduire la cause au lieu de la corriger.
 *
 * Le témoin lit le SOURCE Swift plutôt qu'un binaire — il n'a besoin ni de
 * Xcode ni d'un simulateur, donc il tourne dans le même `vitest` que le reste.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROGRESSION_SECTIONS, progressionLayout } from '../utils/progression-layout.js';
import { resolveEngagementProgress } from '../utils/engagement-progress.js';

const SWIFT = readFileSync(
  join(import.meta.dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/ProgressionLayout.swift'),
  'utf8',
);

const VIDE = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
} as const;

/** Les sections déclarées côté Swift, dans leur ordre de déclaration. */
function sectionsFromSwift(): string[] {
  const bloc = SWIFT.slice(SWIFT.indexOf('public enum ProgressionSection'));
  const corps = bloc.slice(0, bloc.indexOf('}'));
  return [...corps.matchAll(/case\s+([a-z]+)/g)].map((m) => m[1]!);
}

/** Les trois heros, dans l'ordre où le Swift les compose. */
function herosFromSwift(): string[] {
  const ligne = SWIFT.match(/return \[([^\]]+)\]/);
  return ligne === null ? [] : ligne[1]!.split(',').map((s) => s.trim().replace(/^\./, ''));
}

describe('la composition Swift est le miroir EXACT de la composition TypeScript', () => {
  it('déclare les mêmes sections, dans le même ordre', () => {
    expect(sectionsFromSwift()).toEqual([...PROGRESSION_SECTIONS]);
  });

  it('compose les mêmes trois heros, dans le même ordre', () => {
    const ts = progressionLayout(resolveEngagementProgress(VIDE))
      .filter((b) => b.kind !== 'section-link')
      .map((b) => b.kind);
    // `last-achievement` ↔ `lastAchievement` : même mot, deux conventions.
    const camel = ts.map((k) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));
    expect(herosFromSwift()).toEqual(camel);
  });

  /**
   * **La règle des portes doit être la MÊME phrase des deux côtés.**
   *
   * Le TypeScript pouvait la dire « si la carte est servie » ; le Swift ne le
   * peut pas, son modèle collapsant « carte absente » et « carte vide » en un
   * tableau vide. Une règle qu'un miroir ne peut pas reproduire est une
   * divergence en attente : les deux disent donc « s'il Y A des sections ».
   */
  it('gouverne la porte des défis par la PRÉSENCE de sections, des deux côtés', () => {
    expect(SWIFT).toContain('!progress.achievementSections.isEmpty');
    const source = readFileSync(join(import.meta.dirname, '../utils/progression-layout.ts'), 'utf8');
    expect(source).toContain('(progress.achievementSections ?? []).length > 0');
  });
});
