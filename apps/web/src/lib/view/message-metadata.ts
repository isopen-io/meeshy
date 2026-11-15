import type { Message } from '@/lib/api/types';

/**
 * LE `metadata` D'UN MESSAGE, LU UNE SEULE FOIS POUR TOUT LE DÉPÔT
 * (revue-correction #5936).
 *
 * `Message.metadata` est déclaré `CallSummaryMetadata | Record<string,
 * unknown>` (`packages/shared/types/conversation.ts:186`) : une charge à
 * FORME LIBRE, servie telle quelle par REST
 * (`api-schemas/message.ts:140-153`, `additionalProperties: true`). Chaque
 * loi qui y lit un état — le sticker, le lieu, la story citée, le résumé
 * d'appel, l'avis d'arrivée — a besoin du MÊME accès prudent : objet ou
 * rien, jamais une exception, jamais un `any`.
 *
 * Ce module existe parce que deux lois voisines (`message-badges.ts`,
 * `message-body.ts`) l'avaient déjà écrit deux fois, à l'identique — et que
 * les 40+ surfaces restant à porter en écriraient une troisième. C'est
 * exactement la forme que le dépôt a payée trois fois sur le Prisme
 * (cycles 118-120) : une lecture recopiée ne rougit pas quand l'une des
 * copies dérive.
 */
export type MetadataRecord = Record<string, unknown>;

export function metadataOf(message: Pick<Message, 'metadata'>): MetadataRecord | null {
  const { metadata } = message;
  if (metadata === undefined || metadata === null || typeof metadata !== 'object') return null;
  return metadata as MetadataRecord;
}
