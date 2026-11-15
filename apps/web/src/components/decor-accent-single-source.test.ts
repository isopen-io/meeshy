import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { DEFAULT_AUTHOR_ACCENT } from '@meeshy/shared/utils/conversation-colors';

import { DECOR_ACCENT } from '../routes/profile-sections';

// @ts-expect-error — le gate d'harmonie est un module d'outillage `.mjs` sans déclaration de types.
import { scanSource } from '../../scripts/check-design-harmony.mjs';

/**
 * L'ACCENT DE REPLI DE MARQUE A UNE SOURCE UNIQUE (piste 80w, classe harmonie
 * héritée de 76w/77w/78w/79w). Trois surfaces web écrivaient l'indigo de marque
 * EN DUR (`#6366F1` ×3) comme accent affiché avant que `authorAccentColor` ait
 * une entrée : l'en-tête de MON profil (`routes/profile-sections.tsx`), la liste
 * de décors (`components/decor-preview.tsx`) et la boutique de packs
 * (`components/pack-sheet.tsx`). Jumelles qui divergeraient en silence si la
 * marque changeait. Source unique désormais : `DEFAULT_AUTHOR_ACCENT`
 * (`@meeshy/shared/utils/conversation-colors`, à côté de `authorAccentColor`).
 *
 * Ce témoin verrouille les DEUX moitiés : (1) le re-export `DECOR_ACCENT` suit
 * bien la source partagée ; (2) les trois fichiers ne portent plus AUCUNE
 * couleur écrite en dur au regard du gate d'harmonie — une couleur de chrome
 * NON motivée ne peut plus y revenir.
 */
const scanOf = (relative: string): readonly unknown[] =>
  scanSource(readFileSync(new URL(relative, import.meta.url), 'utf8')) as readonly unknown[];

describe("l'accent de repli de marque a une source unique", () => {
  test('`DECOR_ACCENT` (en-tête de profil) EST la constante partagée, pas un littéral jumeau', () => {
    expect(DECOR_ACCENT).toBe(DEFAULT_AUTHOR_ACCENT);
  });

  test("l'en-tête de profil ne porte plus de couleur écrite en dur (gate d'harmonie)", () => {
    expect(scanOf('../routes/profile-sections.tsx')).toEqual([]);
  });

  test('la liste de décors ne porte plus de couleur écrite en dur (gate d’harmonie)', () => {
    expect(scanOf('./decor-preview.tsx')).toEqual([]);
  });

  test('la boutique de packs ne porte plus de couleur écrite en dur (gate d’harmonie)', () => {
    expect(scanOf('./pack-sheet.tsx')).toEqual([]);
  });
});
