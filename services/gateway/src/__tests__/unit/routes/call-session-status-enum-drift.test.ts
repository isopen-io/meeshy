/**
 * callSessionSchema.status — parité avec l'enum CallStatus (schema.prisma).
 *
 * `callSessionSchema` (api-schemas.ts) est censé être "aligné avec
 * schema.prisma CallSession model" (voir son JSDoc), mais son `enum` listait
 * seulement 6 des 9 valeurs Prisma — `initiated`, `connecting` et
 * `reconnecting` en étaient absents. Sans effet à l'exécution aujourd'hui
 * (fast-json-stringify ne valide pas contre `enum` en sérialisation, il s'en
 * sert seulement comme indice de type), mais un contrat qui ment sur les
 * valeurs possibles mord dès qu'un outil plus strict (codegen OpenAPI,
 * validateur de requête, `deepStrictEqual` de contrat) commence à lui faire
 * confiance comme exhaustif. Repéré et documenté comme dette faible dans
 * tasks/calls-fonctionnel-todo.md (Vague 53) ; ce test verrouille la parité
 * pour qu'un futur ajout de statut Prisma (ou un renommage) casse
 * immédiatement ce fichier plutôt que de driver silencieusement.
 */

import { describe, it, expect } from '@jest/globals';
import { callSessionSchema } from '@meeshy/shared/types/api-schemas';

// Miroir volontairement statique de `enum CallStatus` dans
// packages/shared/prisma/schema.prisma — un changement là-bas doit être
// répercuté ici consciemment, pas halo silencieusement.
const PRISMA_CALL_STATUS_VALUES = [
  'initiated',
  'ringing',
  'connecting',
  'active',
  'reconnecting',
  'ended',
  'missed',
  'rejected',
  'failed',
];

describe('callSessionSchema.status — parité avec CallStatus (schema.prisma)', () => {
  it('liste exactement les 9 valeurs Prisma CallStatus, sans en omettre ni en inventer', () => {
    const schemaEnum = (callSessionSchema.properties.status as { enum: readonly string[] }).enum;

    expect(new Set(schemaEnum)).toEqual(new Set(PRISMA_CALL_STATUS_VALUES));
  });
});
