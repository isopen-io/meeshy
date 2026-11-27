import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { claimableMediaWhere, unclaimedMediaWhere } from './mediaOwnership';

/**
 * Un média demandé par une publication et qui ne peut plus lui revenir (#13422).
 *
 * Un média pré-téléversé que rien ne réclame est BALAYÉ après 24 h
 * (`sweepPendingPostMedia`). Le brouillon qui le désignait encore publiait
 * alors sans lui, en silence — une story à la scène vide, une galerie amputée —,
 * parce que la réclamation (`updateMany`) ignore ce qui ne matche pas. Le
 * refus dit à l'appareil QUELS médias renvoyer avant de republier.
 *
 * Deux formes refusent : la ligne n'existe plus, ou elle est libre mais
 * appartient à un autre uploadeur. Un média déjà RATTACHÉ garde le chemin
 * d'avant : une publication sœur du même geste en reçoit une copie (#14305),
 * et les autres réemplois restent ce qu'ils étaient. Les deux clauses sont
 * celles de `mediaOwnership`, jamais redéfinies ici.
 */
export const MEDIA_NOT_CLAIMED = 'MEDIA_NOT_CLAIMED';

export class MediaNotClaimedError extends Error {
  constructor(readonly mediaIds: readonly string[]) {
    super(`${mediaIds.length} média(s) demandé(s) introuvable(s) ou non réclamable(s)`);
    this.name = 'MediaNotClaimedError';
  }
}

type UnpublishablePrisma = { postMedia: Pick<PrismaClient['postMedia'], 'findMany'> };

const idsOf = async (prisma: UnpublishablePrisma, where: Prisma.PostMediaWhereInput): Promise<Set<string>> => {
  const rows = await prisma.postMedia.findMany({ where, select: { id: true } });
  return new Set(rows.map((row) => row.id));
};

/** Rend `requestedIds` tels quels, ou lève `MediaNotClaimedError` avant toute écriture. */
export async function requirePublishableMedia<T extends readonly string[] | undefined>(
  prisma: UnpublishablePrisma,
  requestedIds: T,
  authorId: string,
): Promise<T> {
  const ids = [...new Set(requestedIds ?? [])];
  if (ids.length === 0) return requestedIds;
  const claimable = await idsOf(prisma, { id: { in: ids }, ...claimableMediaWhere(authorId) });
  const rest = ids.filter((id) => !claimable.has(id));
  if (rest.length === 0) return requestedIds;
  const existing = await idsOf(prisma, { id: { in: rest } });
  const free = await idsOf(prisma, { id: { in: rest }, ...unclaimedMediaWhere() });
  const refused = rest.filter((id) => !existing.has(id) || free.has(id));
  if (refused.length > 0) throw new MediaNotClaimedError(refused);
  return requestedIds;
}
