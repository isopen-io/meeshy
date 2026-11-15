/**
 * SUPPRIMER des liens de partage sans laisser un invité derrière eux (#10492).
 *
 * `Participant.shareLinkId` est une colonne nue : supprimer la ligne d'un lien
 * ne cascade sur aucun invité, et emporte la marque d'une révocation différée
 * (`guestRevocationPendingAt`) que le balayage horaire ne retrouve alors plus.
 * La purge d'un compte supprimait ainsi les liens de son créateur en laissant
 * leurs invités actifs, dans la room, pour toujours.
 *
 * L'ordre, lien par lien :
 *
 * 1. **Fermer et marquer** — une seule écriture pour tous les liens visés.
 *    Plus aucune admission (`claimLinkUse` relit `isActive`), et la garde
 *    commune (`guestAccessEnd`) refuse dès cet instant chaque invité. La
 *    marque fait du balayage horaire la reprise d'une révocation qui échoue.
 * 2. **Révoquer** par `revokeShareLinkGuests`, l'unité des gestes de l'hôte.
 * 3. **Supprimer** les seuls liens dont la révocation a abouti.
 *
 * Une révocation qui échoue PROPAGE après la suppression des autres : son
 * lien reste, fermé et marqué. Rejouable — un lien déjà fermé se referme, un
 * invité déjà révoqué ne se révoque plus.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { revokeShareLinkGuests, type GuestSocketRegistry } from './revokeShareLinkGuests';
import type { DepartedMemberEphemeralState } from './endConversationMembership';

export type ShareLinksDeletion = {
  readonly prisma: PrismaClient;
  readonly io: GuestSocketRegistry | null | undefined;
  readonly manager: DepartedMemberEphemeralState | null | undefined;
  /** Les liens visés — aujourd'hui ceux qu'un compte a créés. */
  readonly where: { readonly createdBy: string };
  readonly now?: () => Date;
};

export async function deleteShareLinksRevokingGuests(params: ShareLinksDeletion): Promise<{ readonly count: number }> {
  const { prisma, io, manager, where } = params;
  const linkIds = (await prisma.conversationShareLink.findMany({ where, select: { id: true } })).map((link) => link.id);
  if (linkIds.length === 0) return { count: 0 };

  const closedAt = (params.now ?? (() => new Date()))();
  await prisma.conversationShareLink.updateMany({
    where: { id: { in: linkIds } },
    data: { isActive: false, guestRevocationPendingAt: closedAt },
  });

  const revokedIds: string[] = [];
  const failures: unknown[] = [];
  for (const shareLinkId of linkIds) {
    try {
      await revokeShareLinkGuests({ prisma, io, manager, shareLinkId, revokedAt: closedAt });
      revokedIds.push(shareLinkId);
    } catch (error) {
      failures.push(error);
    }
  }

  const deleted = revokedIds.length === 0
    ? { count: 0 }
    : await prisma.conversationShareLink.deleteMany({ where: { id: { in: revokedIds } } });

  if (failures.length > 0) throw failures[0];
  return { count: deleted.count };
}
