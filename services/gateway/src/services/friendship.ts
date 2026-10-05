import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Deux comptes sont-ils AMIS — au sens d'une demande acceptée, dans un sens
 * comme dans l'autre ?
 *
 * Cette question était écrite trois fois dans le dépôt, à l'identique et sans
 * lien : `PresenceVisibilityService.areConnected` (privée),
 * `routes/signal-protocol.ts:232`, et la garde de visibilité d'un post. Trois
 * copies d'une même loi divergent en silence — celle qui bouge ne fait rougir
 * aucune des deux autres. Site unique désormais.
 *
 * `status: 'accepted'` et rien d'autre : une demande `pending` n'est pas une
 * amitié, et une demande `rejected` encore moins.
 */
export async function amitieAcceptee(
  prisma: Pick<PrismaClient, 'friendRequest'>,
  a: string,
  b: string
): Promise<boolean> {
  if (!a || !b || a === b) return false;

  const ligne = await prisma.friendRequest.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    select: { id: true },
  });

  return ligne !== null;
}

/**
 * Lesquels, parmi `candidats`, sont AMIS de `sujet` — la même loi que
 * {@link amitieAcceptee}, posée en une seule requête pour un éventail (la
 * sonnerie d'un appel de groupe, #8073).
 */
export async function amisAcceptesParmi(
  prisma: Pick<PrismaClient, 'friendRequest'>,
  sujet: string,
  candidats: ReadonlyArray<string>
): Promise<Set<string>> {
  const autres = [...new Set(candidats)].filter((id) => id && id !== sujet);
  if (!sujet || autres.length === 0) return new Set();

  const lignes = await prisma.friendRequest.findMany({
    where: {
      status: 'accepted',
      OR: [
        { senderId: sujet, receiverId: { in: autres } },
        { senderId: { in: autres }, receiverId: sujet },
      ],
    },
    select: { senderId: true, receiverId: true },
  });

  return new Set(lignes.map((l) => (l.senderId === sujet ? l.receiverId : l.senderId)));
}
