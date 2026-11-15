import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **LE CATALOGUE D'ADMINISTRATION NE SE CHARGE QUE PAR L'ADMINISTRATION**
 * (décision porteur 2026-10-23, `decisions.md` D-225) — contrepartie de son
 * plafond porté à 500 Ko (`budgets.json › on_demand_chunks.interface_catalogs_admin`) :
 * ce poids n'est acceptable que parce qu'aucun lecteur ne le paie hors de
 * `/adm`. `admin-catalog-loading.test.ts` garde un sens (toute route `/adm…`
 * le charge) ; ce témoin garde l'autre : RIEN d'autre ne le charge.
 *
 * Trois portes, lues dans la SOURCE (même raison que son voisin : à l'exécution,
 * le catalogue est déjà en mémoire, partagé par tous les témoins du processus) :
 * - les fichiers `interface-catalogs/catalog-admin-<langue>` ne sont atteints
 *   que par un `import()` de `lib/i18n-admin-catalog.ts` — aucune importation
 *   statique ailleurs, ni depuis la coque, ni depuis le routeur, ni depuis les
 *   catalogues communs (un `import type` n'émet rien et reste permis) ;
 * - `loadAdminInterfaceCatalog` / `suspendForAdminInterfaceCatalog` ne sont
 *   appelés que par la table des routes et les écrans `routes/admin*.tsx` ;
 * - dans la table, un chargeur qui attend ce catalogue ne sert qu'une adresse
 *   `/adm…` (ou le pont `/admin…`).
 * Le graphe CONSTRUIT est gardé en plus par `measure-weight.mjs`
 * (`dynamic_only: true`) : un import statique du chunk y est rouge.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const LOADER_FILE = 'lib/i18n-admin-catalog.ts';
const ROUTE_TABLE = 'routes/route-table.tsx';

const isProductionSource = (path: string): boolean =>
  /\.(ts|tsx)$/.test(path) && !path.includes('.test.') && !path.startsWith('test-support/') && !path.includes('/__tests__/');

const SOURCES: ReadonlyArray<{ readonly path: string; readonly text: string }> = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .map((path) => path.split('\\').join('/'))
  .filter(isProductionSource)
  .map((path) => ({ path, text: readFileSync(`${SRC}/${path}`, 'utf8') }));

const withoutTypeImports = (text: string): string => text.replace(/import\s+type\s[^;]*;/g, '');

const ADMIN_CATALOG_SPECIFIER = /['"][^'"]*interface-catalogs\/catalog-admin-[a-z]+(?:\.ts)?['"]/g;
const LOADER_CALL = /\b(?:loadAdminInterfaceCatalog|suspendForAdminInterfaceCatalog)\(/;

describe('le catalogue d’administration n’est chargé que par l’administration', () => {
  test('la lecture des sources voit l’application — sinon zéro fichier ressemblerait à un succès', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
    expect(SOURCES.some(({ path }) => path === LOADER_FILE)).toBe(true);
    expect(SOURCES.some(({ path }) => path === ROUTE_TABLE)).toBe(true);
  });

  test('seul i18n-admin-catalog.ts désigne les fichiers catalog-admin-*, et seulement par import()', () => {
    const referencing = SOURCES.filter(({ text }) => withoutTypeImports(text).match(ADMIN_CATALOG_SPECIFIER) !== null).map(({ path }) => path);
    expect(referencing).toEqual([LOADER_FILE]);

    const loader = withoutTypeImports(SOURCES.find(({ path }) => path === LOADER_FILE)?.text ?? '');
    const references = loader.match(ADMIN_CATALOG_SPECIFIER) ?? [];
    const dynamic = loader.match(/import\(\s*['"][^'"]*interface-catalogs\/catalog-admin-[a-z]+(?:\.ts)?['"]\s*\)/g) ?? [];
    expect(references.length).toBeGreaterThanOrEqual(4);
    expect(dynamic.length).toBe(references.length);
  });

  test('seuls la table des routes et les écrans d’administration déclenchent son chargement', () => {
    const callers = SOURCES.filter(({ path, text }) => path !== LOADER_FILE && LOADER_CALL.test(text)).map(({ path }) => path);
    expect(callers).toContain(ROUTE_TABLE);
    expect(callers.filter((path) => path !== ROUTE_TABLE && !/^routes\/admin[\w-]*\.tsx$/.test(path))).toEqual([]);
  });

  test('dans la table, un chargeur qui attend ce catalogue ne sert qu’une adresse d’administration', () => {
    const table = SOURCES.find(({ path }) => path === ROUTE_TABLE)?.text ?? '';
    const loaders = new Set(
      [...table.matchAll(/const\s+(\w+)\s*=\s*\(\)\s*=>\s*([\s\S]*?);\n/g)]
        .filter(([, , body]) => body?.includes('loadAdminInterfaceCatalog') === true)
        .map(([, name]) => String(name)),
    );
    const served = [...table.matchAll(/(\w+):\s*\{\s*pattern:\s*'([^']*)',\s*screen:\s*([^},]+)\s*\}/g)].map(([, key, pattern, screen]) => ({
      key: String(key),
      pattern: String(pattern),
      screen: String(screen).trim(),
    }));

    expect(loaders.size).toBeGreaterThanOrEqual(4);
    expect(served.filter(({ screen }) => loaders.has(screen)).length).toBeGreaterThanOrEqual(8);
    expect(served.filter(({ screen, pattern }) => loaders.has(screen) && !pattern.startsWith('/adm')).map(({ key, pattern }) => `${key} (${pattern})`)).toEqual([]);
  });
});
