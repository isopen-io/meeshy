import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE BUDGET DE TAILLE DU FIL (#7429, CLAUDE.md § Code Style) — « budget
 * 1000–1200 lignes par fichier […] plafond DUR 1200 ; 1000 est le seuil
 * au-delà duquel un découpage se justifie sans se discuter ». `thread.tsx`
 * l'a franchi deux fois (#5878 à 1042, aujourd'hui 1172) sans qu'aucun
 * témoin ne le dise — ce fichier ferme ce trou.
 *
 * L'ENSEMBLE MESURÉ EST DÉRIVÉ DES IMPORTS DE `thread.tsx`, jamais une liste
 * tenue à la main (leçon 640 : « une énumération tenue à la main diverge de
 * ce qu'elle énumère ») : tout module relatif (`./xxx`), tout
 * `@/components/thread-*`, tout `@/lib/view/use-thread-*` et tout
 * `@/lib/reading-mode/use-thread-*` que `thread.tsx` importe, résolu en
 * `.ts`/`.tsx` sur disque. Un fichier extrait de plus entre automatiquement
 * dans la mesure dès qu'il est importé par ce motif — aucune deuxième
 * écriture à faire ici.
 */

const ROUTES_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROUTES_DIR, '..');
const THREAD_FILE = join(ROUTES_DIR, 'thread.tsx');
const THREAD_SOURCE = readFileSync(THREAD_FILE, 'utf8');

/** Équivalent de `wc -l` : le compte de caractères `\n`, jamais
 * `split('\n').length` (qui compte une ligne de trop sur un fichier sans
 * retour final — la mesure divergerait de celle citée dans la spécification
 * et dans `CLAUDE.md`). */
function lineCount(path: string): number {
  const text = readFileSync(path, 'utf8');
  return (text.match(/\n/g) ?? []).length;
}

function resolveModule(specifier: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = join(ROUTES_DIR, specifier);
  } else if (specifier.startsWith('@/components/thread-')) {
    base = join(SRC_DIR, 'components', specifier.slice('@/components/'.length));
  } else if (specifier.startsWith('@/lib/view/use-thread-')) {
    base = join(SRC_DIR, 'lib', 'view', specifier.slice('@/lib/view/'.length));
  } else if (specifier.startsWith('@/lib/reading-mode/use-thread-')) {
    base = join(SRC_DIR, 'lib', 'reading-mode', specifier.slice('@/lib/reading-mode/'.length));
  }
  if (base === null) return null;
  for (const ext of ['.tsx', '.ts']) {
    if (existsSync(`${base}${ext}`)) return `${base}${ext}`;
  }
  return null;
}

function derivedModules(): readonly string[] {
  const specifiers = [...THREAD_SOURCE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] ?? '');
  const resolved = specifiers.map(resolveModule).filter((p): p is string => p !== null);
  return [...new Set([THREAD_FILE, ...resolved])];
}

describe('Le fil tient dans le budget de taille (#7429, CLAUDE.md § Code Style)', () => {
  test('thread.tsx compte moins de 1000 lignes', () => {
    const count = lineCount(THREAD_FILE);
    expect(count).toBeLessThan(1000);
  });

  test('l’ensemble dérivé contient au moins thread-modes.tsx — sinon la regex de dérivation ne matche rien (leçon 651, un vert vide)', () => {
    const modules = derivedModules();
    expect(modules.some((p) => p.endsWith('thread-modes.tsx'))).toBe(true);
  });

  for (const path of derivedModules()) {
    const label = path.slice(SRC_DIR.length + 1);
    test(`aucun module de l'écran ne dépasse 1000 lignes — ${label}`, () => {
      const count = lineCount(path);
      expect(count).toBeLessThan(1000);
    });
  }
});
