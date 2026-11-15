/**
 * Balayage partagé des sites `jest.requireActual('spécificateur')` de la
 * suite du gateway (#6519).
 *
 * Bun n'implémente pas `jest.requireActual` nativement (oven-sh/bun#29834,
 * oven-sh/bun#5394) : sous `bun test`, l'appel lève
 * `TypeError: jest.requireActual is not a function`, alors que la même suite
 * est verte sous jest. `bun-preload.ts` répare ce trou pour le runtime bun en
 * préchargeant, AVANT que le premier `jest.mock()` ne s'exécute où que ce
 * soit, le module RÉEL derrière chaque site trouvé ici — c'est la seule
 * fenêtre où aucun mock n'existe encore pour personne (un `jest.mock` posé
 * par un fichier reste actif pour tous les fichiers suivants du même process
 * bun, cf. commentaire de #6519).
 *
 * `require-actual-bun-parity.test.ts` (le cliquet) réutilise EXACTEMENT ce
 * balayage pour vérifier qu'aucun site n'a échappé au préchargement — une
 * seconde implémentation de la même regex aurait pu dériver de la première en
 * silence (§ CLAUDE.md racine, « Un témoin qui ne peut pas tomber n'est pas un
 * témoin »).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

export const GATEWAY_ROOT = resolvePath(__dirname, '..', '..', '..');
export const SHARED_ROOT = resolvePath(GATEWAY_ROOT, '..', '..', 'packages', 'shared');

export interface RequireActualSite {
  readonly file: string;
  readonly specifier: string;
  readonly resolved: string;
}

const REQUIRE_ACTUAL_CALL = /jest\.requireActual(?:<[^>]*>)?\(\s*(['"])([^'"]+)\1\s*\)/g;

/** Même résolution que `moduleNameMapper` dans `jest.config.json`. */
export function resolveRequireActualSpecifier(specifier: string, fromFile: string): string {
  if (specifier === '@meeshy/shared') {
    return resolvePath(SHARED_ROOT, 'types', 'index');
  }
  if (specifier.startsWith('@meeshy/shared/')) {
    return resolvePath(SHARED_ROOT, specifier.slice('@meeshy/shared/'.length));
  }
  if (specifier.startsWith('.')) {
    // Même règle que `"^(\\.{1,2}/.*)\\.js$": "$1"` dans `moduleNameMapper` :
    // un import relatif en `.js` d'un projet TypeScript ESM vise le `.ts`
    // voisin, jamais un `.js` compilé qui n'existe pas dans `src/`.
    const withoutJsExtension = specifier.replace(/\.js$/, '');
    return resolvePath(dirname(fromFile), withoutJsExtension);
  }
  return specifier; // module Node natif (`path`, `crypto`, …) ou paquet npm
}

export function collectTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolvePath(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Un `${…}` dans le spécificateur n'est pas un appel réel : c'est un témoin
 * qui grep sa PROPRE source pour un motif textuel (patron déjà en place dans
 * `withMutationLog-mock-spread-guard.test.ts` et
 * `response-schema-stub-ratchet.test.ts`), jamais un site à précharger.
 */
export function collectRequireActualSites(srcRoot: string): RequireActualSite[] {
  const sites: RequireActualSite[] = [];
  for (const file of collectTestFiles(srcRoot)) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of source.matchAll(REQUIRE_ACTUAL_CALL)) {
      const specifier = match[2];
      if (specifier.includes('${')) continue;
      sites.push({ file, specifier, resolved: resolveRequireActualSpecifier(specifier, file) });
    }
  }
  return sites;
}
