/**
 * Cliquet : le fichier de langues généré pour le translator suit-il
 * `packages/shared` ? (#3658)
 *
 * Jumeau de `api/__tests__/ios-endpoints-generated-ratchet.test.ts`, qui joue
 * ce rôle pour les énumérations Swift. Il régénère le contenu attendu depuis
 * `SUPPORTED_LANGUAGE_CODES` et le compare, octet pour octet, au fichier
 * Python sur disque que le translator importe réellement
 * (`config.generated_languages`, `services/translator/src/config/settings.py`).
 *
 * Ce qu'il attrape, et qu'aucun test Python ne pourrait voir : une langue
 * ajoutée, retirée ou renommée côté produit pendant que la feuille consommée
 * par le translator reste figée — la même famille de défaut que le cliquet
 * iOS, appliquée à un service qui n'a PAS accès à `packages/shared` au
 * runtime (son image Docker ne copie que `services/translator/`, voir
 * `services/translator/Dockerfile`) : sans génération, il n'existe aucun
 * autre moyen pour lui de suivre le produit.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGE_CODES } from '../utils/language-codes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const GENERATED_PATH = resolve(
  REPO_ROOT,
  'services/translator/src/config/generated_languages.py'
);
const GENERATED_MARK = '# GÉNÉRÉ — ne pas éditer à la main.';
const REGENERATE = 'cd packages/shared && npm run translator-languages:generate';

function renderExpected(codes: readonly string[]): string {
  const lines = codes.map((code) => `    "${code}",`).join('\n');
  return `${GENERATED_MARK}
# Source : packages/shared/utils/language-codes.ts (SUPPORTED_LANGUAGE_CODES).
# Régénérer : cd packages/shared && npm run translator-languages:generate
#
# La « feuille » des codes de langue que Meeshy reconnaît côté produit (#3658).
# Ce n'est PAS la liste des codes que le translator sait traduire : voir
# LANGUAGE_MAPPINGS dans config/settings.py, qui reste une donnée ML propre à
# ce service. settings.py calcule l'intersection des deux — jamais ce fichier
# seul — pour ne jamais annoncer une langue que le modèle ne mappe pas.

SUPPORTED_LANGUAGE_CODES = (
${lines}
)
`;
}

describe('cliquet — les langues du translator suivent packages/shared', () => {
  it('generated_languages.py est identique à sa régénération', () => {
    const expected = renderExpected(SUPPORTED_LANGUAGE_CODES);
    const onDisk = readFileSync(GENERATED_PATH, 'utf8');

    expect(onDisk, `generated_languages.py a divergé. Régénérer : ${REGENERATE}`).toBe(expected);
  });

  /**
   * Fusible : le témoin ci-dessus passerait au vert sur un fichier VIDE
   * régénéré depuis une feuille elle-même vidée. Celui-ci ancre l'existence
   * réelle du catalogue, comme son jumeau iOS.
   */
  it("la feuille source n'est pas silencieusement vidée", () => {
    expect(SUPPORTED_LANGUAGE_CODES.length).toBeGreaterThan(50);
    expect(SUPPORTED_LANGUAGE_CODES).toContain('fr');
    expect(SUPPORTED_LANGUAGE_CODES).toContain('en');
  });
});
