/**
 * Régénère la liste des codes de langue que le translator (Python) reconnaît
 * (#3658) depuis `packages/shared/utils/language-codes.ts`.
 *
 * Usage (une commande, sans argument), depuis `packages/shared` :
 *
 *   npm run translator-languages:generate
 *   # ou, équivalent : npx tsx scripts/generate-translator-languages.ts
 *
 * Jumeau de `generate-ios-endpoints.ts` : la RÈGLE reste que `packages/shared`
 * fait foi, ce script ne fait que lire, projeter et écrire.
 *
 * Ce qu'il exporte, et ce qu'il n'exporte PAS : `SUPPORTED_LANGUAGE_CODES` est
 * la « feuille » des codes que le PRODUIT reconnaît (langues offertes aux
 * clients) — pas les codes que le modèle NLLB sait effectivement traduire.
 * Cette seconde information (`LANGUAGE_MAPPINGS`, ISO → code NLLB) reste une
 * donnée ML propre au translator : la fusionner à l'aveugle ferait passer un
 * code produit sans mapping NLLB pour traduisible, ce qui est le bug même que
 * `translator_engine.py` documente avoir déjà eu (repli silencieux vers
 * `eng_Latn`/`fra_Latn`). `config/settings.py` calcule donc le défaut de
 * `SUPPORTED_LANGUAGES` comme l'INTERSECTION de ce fichier généré avec
 * `LANGUAGE_MAPPINGS`, jamais son contenu brut.
 */

import { exigerNodeRecent } from '../../../scripts/node-guard/require-node-runtime.js';

// AVANT tout autre import : voir generate-ios-endpoints.ts pour la raison.
exigerNodeRecent('packages/shared/scripts/generate-translator-languages.ts');

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORTED_LANGUAGE_CODES } from '../utils/language-codes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  'services/translator/src/config/generated_languages.py'
);

const GENERATED_MARK = '# GÉNÉRÉ — ne pas éditer à la main.';

function renderPython(codes: readonly string[]): string {
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

function main(): void {
  if (SUPPORTED_LANGUAGE_CODES.length === 0) {
    throw new Error('SUPPORTED_LANGUAGE_CODES est vide — refus de générer un fichier creux.');
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, renderPython(SUPPORTED_LANGUAGE_CODES), 'utf8');

  console.log(
    `${SUPPORTED_LANGUAGE_CODES.length} codes de langue écrits dans ${OUTPUT_PATH}.`
  );
}

main();
