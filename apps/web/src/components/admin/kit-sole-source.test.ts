import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **L'ADMINISTRATION N'A PLUS QU'UNE SOURCE DE PIÈCES : `components/admin`** (#9463) — décision
 * du porteur : l'approche module + composant remplace les pièces faites à la main. Les deux
 * anciens modules de `routes/` (`admin-parts`, `admin-table`) ont quitté le dépôt ; ce témoin
 * rougit si l'un revient, si un écran l'importe encore, ou si le kit se remet à dépendre d'un
 * écran (le kit ne lit dans `routes/` que le cadre `admin-shell`).
 */
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROUTES = join(HERE, '..', '..', 'routes');
const SRC = join(HERE, '..', '..');

const sources = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return /\.(tsx?|mjs)$/.test(entry.name) ? [path] : [];
  });

describe('les anciennes pièces d’administration ont quitté routes/', () => {
  test('admin-parts et admin-table n’existent plus', () => {
    expect(existsSync(join(ROUTES, 'admin-parts.tsx'))).toBe(false);
    expect(existsSync(join(ROUTES, 'admin-table.tsx'))).toBe(false);
  });

  test('aucun fichier ne les importe encore', () => {
    const importers = sources(SRC).filter((file) => /from ['"](?:@\/routes\/|\.\/)admin-(?:parts|table)['"]/.test(readFileSync(file, 'utf8')));
    expect(importers).toEqual([]);
  });

  test('le kit ne dépend d’aucun écran d’administration, hors le cadre admin-shell', () => {
    const kit = readdirSync(HERE).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    const leaks = kit.flatMap((name) =>
      [...readFileSync(join(HERE, name), 'utf8').matchAll(/from ['"]@\/routes\/(admin-[\w-]+)['"]/g)]
        .map((match) => match[1])
        .filter((module) => module !== 'admin-shell')
        .map((module) => `${name} → ${module}`),
    );
    expect(leaks).toEqual([]);
  });
});
