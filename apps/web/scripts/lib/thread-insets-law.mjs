/**
 * LES DEUX COTES DE LA LOI DES RÉSERVES, LUES DEPUIS LA SOURCE (#6213).
 *
 * `scripts/*.mjs` ne peut pas importer un module TypeScript à alias `@/`, et
 * recopier `16` et `8` ici en ferait des JUMELLES : le jour où la loi bouge,
 * le témoin resterait vert sur l'ancienne valeur — exactement le vert vide
 * que ce dépôt traque. On LIT donc les littéraux dans
 * `src/lib/view/thread-insets.ts`, comme `check-curve.mjs` lit ses cotes dans
 * les fichiers Swift.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../../src/lib/view/thread-insets.ts', import.meta.url));
const source = readFileSync(SOURCE, 'utf8');

const literal = (name) => {
  const found = new RegExp(`export const ${name} = (-?\\d+(?:\\.\\d+)?);`).exec(source);
  if (found === null) throw new Error(`thread-insets.ts ne déclare plus « ${name} » — le témoin ne peut plus rien garder.`);
  return Number.parseFloat(found[1]);
};

export const LIST_BOTTOM_BREATH = literal('LIST_BOTTOM_BREATH');
export const SCROLL_BUTTON_GAP = literal('SCROLL_BUTTON_GAP');
