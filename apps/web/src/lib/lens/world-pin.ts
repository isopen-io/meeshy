/**
 * WORLD WIDE ÉPINGLÉE EN CARTE EN TÊTE DE LISTE (#10004).
 *
 * `WORLD_IDENTIFIER` est la JUMELLE GARDÉE de `WORLD_CONVERSATION_IDENTIFIER`
 * (`@meeshy/shared/types/world`) : ce module partagé construit au niveau
 * module le schéma Zod COMPLET de `GET /world`, et l'importer depuis l'écran
 * de liste ferait entrer `zod` (et non `zod/mini`) dans le chunk de la route
 * pour une seule chaîne. `world-pin.test.ts` rougit au premier écart entre
 * les deux ; l'extraction des constantes hors du module Zod est suivie à part.
 */
export const WORLD_IDENTIFIER = 'world';

export const pinWorldWide = <T extends { readonly identifier?: string | null | undefined }>(
  conversations: readonly T[],
): { readonly world: T | undefined; readonly rest: readonly T[] } => {
  const world = conversations.find((conversation) => conversation.identifier === WORLD_IDENTIFIER);
  return world === undefined ? { world, rest: conversations } : { world, rest: conversations.filter((conversation) => conversation !== world) };
};
