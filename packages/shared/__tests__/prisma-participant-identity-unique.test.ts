/**
 * `Participant` — la clé unique doit porter l'IDENTITÉ, pas seulement `userId`.
 *
 * Le schéma déclarait `@@unique([conversationId, userId])`. En MongoDB, un
 * champ ABSENT ou `null` est une VALEUR indexée comme une autre : les deux
 * lignes `{conversationId: C}` sans `userId` entrent en collision sur la même
 * clé `(C, null)`. Un participant anonyme n'a jamais de `userId` — la
 * conséquence est qu'une conversation n'acceptait qu'UN SEUL anonyme, et que
 * le deuxième `POST /anonymous/join/:linkId` remontait un duplicate key
 * (`Participant_conversationId_userId_key`) transformé en 500 opaque.
 *
 * Mesuré en production le 2026-08-18 : 886 participants, 5 anonymes, répartis
 * sur 5 conversations DISTINCTES — jamais deux dans la même. La contrainte
 * n'était pas une hypothèse, c'était un plafond.
 *
 * L'invariant que ce fichier verrouille n'est pas « il existe un @@unique »,
 * c'est : **la clé unique doit contenir une colonne qui distingue deux
 * participants sans compte**. Pour un inscrit c'est `userId` ; pour un anonyme
 * c'est `sessionTokenHash` (écrit à la création dans `routes/anonymous.ts`,
 * jamais effacé ensuite). Une clé qui omet la seconde retombe mécaniquement
 * sur le plafond « un anonyme par conversation ».
 *
 * Ce garde lit `schema.prisma` parce que c'est la SOURCE de l'index : le
 * comportement fautif ne vit dans aucun fichier TypeScript, il vit dans la
 * déclaration qui produit l'index MongoDB.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCHEMA = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');

function modelBlock(name: string): string {
  const match = SCHEMA.match(new RegExp(`^model ${name} \\{$([\\s\\S]*?)^\\}$`, 'm'));
  if (!match) throw new Error(`model ${name} introuvable dans schema.prisma`);
  return match[1];
}

/** Les `@@unique([...])` du bloc, chacun réduit à la liste de ses colonnes. */
function uniqueKeys(block: string): readonly (readonly string[])[] {
  return [...block.matchAll(/@@unique\(\[([^\]]+)\]/g)].map(([, cols]) =>
    cols.split(',').map((c) => c.trim())
  );
}

describe('Participant — clé unique et participants sans compte', () => {
  const participant = modelBlock('Participant');
  const keys = uniqueKeys(participant);

  it('déclare exactement une clé unique', () => {
    expect(keys).toHaveLength(1);
  });

  it('conserve la garantie « un inscrit une seule fois par conversation »', () => {
    expect(keys[0]).toEqual(expect.arrayContaining(['conversationId', 'userId']));
  });

  it('distingue deux anonymes de la même conversation (sinon plafond à 1)', () => {
    const anonymousDiscriminators = ['sessionTokenHash'];

    expect(
      keys[0].some((col) => anonymousDiscriminators.includes(col))
    ).toBe(true);
  });

  it('garde `sessionTokenHash` nullable — un inscrit n’en a pas', () => {
    expect(participant).toMatch(/sessionTokenHash\s+String\?/);
  });
});
