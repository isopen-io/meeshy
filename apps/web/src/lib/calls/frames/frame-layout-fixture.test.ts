import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { layoutFixture, layoutFixtureText } from './frame-layout-fixture';

/**
 * LA FIXTURE DE PARITÉ EST À JOUR (#8741) — le fichier suivi que le port
 * iOS de `frameSlots` compare au sien doit être exactement ce que le web
 * calcule. Rouge ⇒ `bun run scripts/generate-frame-layout-fixture.ts`.
 */

const FIXTURE = fileURLToPath(new URL('../../../../../../packages/shared/design/call-capture-frames-layout.fixture.json', import.meta.url));

describe('la fixture de géométrie des cadres', () => {
  test('le fichier suivi égale un calcul frais', () => {
    expect(readFileSync(FIXTURE, 'utf8')).toBe(layoutFixtureText());
  });

  test('elle couvre chaque disposition, chaque nombre, les deux orientations', () => {
    const fixture = layoutFixture();
    expect(fixture.cases).toHaveLength(13 * 2 * 7 * 2);
    fixture.cases.forEach((entry) => expect(entry.slots).toHaveLength(entry.people));
  });
});
