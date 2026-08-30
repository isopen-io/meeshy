/**
 * **Un fichier de routes qu'aucun chemin d'import n'atteint est du code mort au
 * sens strict : il compile, ses suites passent, et il ne s'exécute jamais.**
 *
 * Le dépôt a déjà payé ce défaut une fois. `routes/communities/` est resté
 * injoignable pendant trois cycles — `routes/communities.ts` le masquait, Node
 * résolvant `LOAD_AS_FILE` avant `LOAD_AS_DIRECTORY` — et trois lots de
 * correctifs y ont atterri sans jamais atteindre la production.
 * `module-shadowing.test.ts` garde CETTE forme-là : la paire `X.ts` / `X/`.
 *
 * Ce témoin garde la forme GÉNÉRALE, dont l'ombrage n'est qu'un cas : quel que
 * soit le mécanisme — un module jamais enregistré, un fichier d'aides dont le
 * dernier appelant a disparu, une scission abandonnée à mi-chemin — tout
 * fichier de `routes/` doit être atteignable depuis les points d'entrée du
 * serveur par une chaîne d'imports relatifs.
 *
 * Mesuré à la pose (#4284, 2026-08-30) : **193 fichiers sur 194 atteignables**.
 * Le seul orphelin était `routes/me/preferences/types.ts` — 146 lignes de DTO
 * survivantes du changement de paradigme des préférences, avec zéro importeur
 * en production comme en test. Il a été retiré dans le même lot, et la liste
 * ci-dessous est vide depuis.
 *
 * ### Pourquoi la liste des exemptions est vide, et doit le rester
 *
 * Une exemption est une déclaration que du code mort est acceptable à cet
 * endroit. Aucune ne l'est sous `routes/` : un fichier de routes existe pour
 * SERVIR quelque chose. S'il ne sert plus, il se retire — il ne s'annote pas.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, normalize, relative, sep } from 'path';

const SRC_DIR = join(__dirname, '../../..');
const ROUTES_DIR = join(SRC_DIR, 'routes');

/**
 * Les points d'entrée du serveur ASSEMBLÉ. `route-registration.ts` porte la
 * boucle d'enregistrement (#4278) ; `server.ts` porte tout ce qui est monté
 * hors de cette boucle.
 */
const ENTRYPOINTS = ['server.ts', 'route-registration.ts'].map((f) => join(SRC_DIR, f));

/** Aucune. Un fichier de routes que rien n'atteint se retire, il ne s'annote pas. */
const ALLOWED_ORPHANS: readonly string[] = [];

const isHandWrittenSource = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.split(sep).includes('__tests__');

const walk = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return isHandWrittenSource(full) ? [full] : [];
  });

/**
 * Couvre `import … from 'x'`, `export … from 'x'`, `import('x')` et
 * `require('x')` — les quatre formes qui créent une arête dans le graphe.
 */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const resolveRelative = (importer: string, specifier: string): string | null => {
  if (!specifier.startsWith('.')) return null;
  const base = normalize(join(dirname(importer), specifier));
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const reachableFrom = (entrypoints: readonly string[]): ReadonlySet<string> => {
  const seen = new Set<string>();
  const stack = [...entrypoints];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      const target = resolveRelative(file, match[1]);
      if (target !== null && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
};

describe('atteignabilité des fichiers de routes (#4284)', () => {
  it('part de points d’entrée qui existent — sinon un graphe vide déclarerait tout orphelin', () => {
    for (const entry of ENTRYPOINTS) expect(existsSync(entry)).toBe(true);
    expect(reachableFrom(ENTRYPOINTS).size).toBeGreaterThan(100);
  });

  it('n’a aucun fichier de routes qu’aucune chaîne d’imports n’atteint', () => {
    const reachable = reachableFrom(ENTRYPOINTS);
    const orphans = walk(ROUTES_DIR)
      .filter((path) => !reachable.has(path))
      .map((path) => relative(ROUTES_DIR, path))
      .sort();

    expect(orphans).toEqual(ALLOWED_ORPHANS);
  });
});
