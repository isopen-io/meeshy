import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, test } from 'bun:test';

/**
 * L'INTERRUPTEUR D'iOS A UNE SOURCE UNIQUE (#10622). `components/ios-switch.tsx`
 * porte le dessin du `Toggle` de SwiftUI (piste 51 × 31, pastille 27 qui glisse de
 * 2 à 22) ; les réglages, la création de communauté et le formulaire des liens de
 * partage en gardaient chacun une copie privée, qui divergerait en silence au
 * premier changement de dessin. Ce témoin refuse toute source, hors du composant,
 * qui redessine la pastille glissante.
 */
const SOURCE_ROOT = new URL('..', import.meta.url).pathname;
const OWNER = 'components/ios-switch.tsx';
const THUMB_TRAVEL = /insetInlineStart:\s*[\w.]+\s*\?\s*22\s*:\s*2\b/;

const sourcesUnder = (directory: string): readonly string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [path] : [];
  });

describe("l'interrupteur d'iOS a une source unique", () => {
  test('aucune source hors de `ios-switch.tsx` ne redessine la pastille glissante', () => {
    const copies = sourcesUnder(SOURCE_ROOT)
      .filter((path) => THUMB_TRAVEL.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SOURCE_ROOT, path));
    expect(copies).toEqual([OWNER]);
  });
});
