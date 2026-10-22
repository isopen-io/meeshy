/**
 * Régénère `fixtures/action-policy/{message,conversation}-actions.vectors.json`
 * en EXÉCUTANT la loi des actions sur son plan versionné
 * (`__tests__/action-policy/action-policy-vectors-law.ts`, seule source écrite
 * à la main). Ces fichiers sont rejoués par trois témoins : le rejeu TypeScript
 * (`__tests__/vectors/action-policy.vectors.test.ts`), la parité passerelle
 * (`services/gateway/.../action-policy-parity.test.ts`) et le miroir Swift
 * (`MessageActionPolicyVectorTests`, `ConversationActionPolicyVectorTests`).
 *
 * Usage, depuis `packages/shared` :
 *
 *   bun run action-policy-vectors:generate          # écrit
 *   bun run action-policy-vectors:check             # échoue si un fichier a dérivé du plan
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { actionPolicyVectorFiles } from '../__tests__/action-policy/action-policy-vectors-law.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'action-policy');
const checkOnly = process.argv.includes('--check');

const readOrEmpty = (path: string): string => {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
};

const files = actionPolicyVectorFiles().map((file) => ({ ...file, path: join(DIR, `${file.name}.vectors.json`) }));
const drifted = files.filter((file) => readOrEmpty(file.path) !== file.content);

if (checkOnly) {
  drifted.forEach((file) => console.error(`${file.name}.vectors.json a dérivé du plan — bun run action-policy-vectors:generate`));
  process.exit(drifted.length === 0 ? 0 : 1);
}

drifted.forEach((file) => writeFileSync(file.path, file.content));
console.log(drifted.length === 0 ? 'vecteurs à jour' : `régénérés : ${drifted.map((file) => file.name).join(', ')}`);
