import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * LES CONTACTS DE L'INSTANTANÉ DE PRÉSENCE — les autres participants actifs
 * des conversations du lecteur INSCRIT, inscrits ET anonymes. Un lecteur
 * invité (sans compte) n'en reçoit aucun (#10205).
 *
 * Un invité par lien n'a pas de compte : Prisma n'écrit pas sa clé `userId`.
 * Or, sur MongoDB, toute négation (`NOT`, `not`, `notIn`) écarte le document où
 * la clé est ABSENTE (mesuré contre `mongo:8`, #8309) : `NOT: { userId }` seul
 * retirait chaque invité. L'absence se dit donc à part, `isSet: false`.
 */
export function presenceSnapshotContactsWhere(input: {
  readonly conversationIds: readonly string[];
  readonly viewerId: string;
  readonly isAnonymous: boolean;
}): Prisma.ParticipantWhereInput {
  // #10205 — un invité sans compte ne reçoit pas la liste des participants :
  // l'instantané de présence n'en est qu'une autre forme. Aucune ligne.
  if (input.isAnonymous) return { id: { in: [] } };
  const notTheViewer: Prisma.ParticipantWhereInput = { OR: [{ NOT: { userId: input.viewerId } }, { userId: { isSet: false } }] };
  return { conversationId: { in: [...input.conversationIds] }, isActive: true, ...notTheViewer };
}
