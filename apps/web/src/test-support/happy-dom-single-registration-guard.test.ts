import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * UN SEUL POINT d'enregistrement du DOM global (#5888).
 *
 * `GlobalRegistrator` (happy-dom) porte son état dans un champ STATIQUE,
 * partagé par tout le process `bun test` — `register()` lève si déjà
 * enregistré, `unregister()` lève si rien ne l'est. Cinq fichiers de test
 * l'appelaient chacun dans son propre `beforeAll`/`afterAll` : un rejet non
 * attrapé dans l'un de ces `afterAll` async se comptait en « error » par
 * `bun test`, sans faire tomber le moindre `expect` (1252 pass, 0 fail, 1
 * error) — la suite entière passait pendant que le process sortait en échec.
 *
 * `ensureHappyDomRegistered()` (`happy-dom-environment.ts`) est désormais
 * l'UNIQUE site autorisé à appeler le `register()` de `GlobalRegistrator` —
 * et rien n'appelle plus `unregister()` : le process se termine après
 * les tests, et chaque site continue de nettoyer SES propres nœuds DOM dans
 * son `afterEach`. Ce garde interdit tout retour en arrière : un nouveau
 * fichier qui réenregistre son propre happy-dom réintroduit exactement la
 * fenêtre de course fermée ici.
 */

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_FILE = 'happy-dom-environment.ts';

const listTestFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...listTestFiles(path));
    } else if (/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
};

describe('happy-dom — un seul point d\'enregistrement global', () => {
  test('aucun fichier de test ne réenregistre ou désenregistre GlobalRegistrator lui-même', () => {
    const offenders: string[] = [];
    for (const path of listTestFiles(SRC_ROOT)) {
      if (path.endsWith(ALLOWED_FILE)) continue;
      const source = readFileSync(path, 'utf8');
      if (/GlobalRegistrator\s*\.\s*(register|unregister)\s*\(/.test(source)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});
