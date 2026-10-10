import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * LES CONTACTS DE L'INSTANTANÉ DE PRÉSENCE — les autres participants actifs
 * des conversations du lecteur, inscrits ET anonymes.
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
  const notTheViewer: Prisma.ParticipantWhereInput = input.isAnonymous
    ? { NOT: { id: input.viewerId } }
    : { OR: [{ NOT: { userId: input.viewerId } }, { userId: { isSet: false } }] };
  return { conversationId: { in: [...input.conversationIds] }, isActive: true, ...notTheViewer };
}
