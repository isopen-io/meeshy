import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world-identity';

/**
 * WORLD WIDE ÉPINGLÉE EN TÊTE DE LISTE (#10004), en rangée ordinaire (#10191).
 * L'identifiant est celui que le serveur sème, lu sans schéma (#10038).
 */

export const pinWorldWide = <T extends { readonly identifier?: string | null | undefined }>(
  conversations: readonly T[],
): { readonly world: T | undefined; readonly rest: readonly T[] } => {
  const world = conversations.find((conversation) => conversation.identifier === WORLD_CONVERSATION_IDENTIFIER);
  return world === undefined ? { world, rest: conversations } : { world, rest: conversations.filter((conversation) => conversation !== world) };
};
