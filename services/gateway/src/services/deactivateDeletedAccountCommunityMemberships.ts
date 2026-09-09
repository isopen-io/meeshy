import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'deactivateDeletedAccountCommunityMemberships' });

/**
 * Aucun des trois chemins de suppression de compte
 * (`routes/user-deletions.ts`, `routes/account-deletion.ts`,
 * `routes/me/delete-account.ts`) ne touchait `CommunityMember` — ni ses
 * lignes actives, ni ses lignes déjà quittées (#5801). Un compte purgé
 * restait donc compté comme membre ACTIF de chaque communauté qu'il avait
 * rejointe, y compris avec son rôle d'origine (`admin`/`moderator`).
 *
 * `CommunityMember` ne porte aucune donnée personnelle propre au-delà de
 * `role`/`joinedAt`/`leftAt` (`schema.prisma`) — son identité vient
 * ENTIÈREMENT de la relation `User`, que #5691 (issue liée) anonymise en
 * place. Ce module ne duplique donc pas ce travail : il traite le seul
 * défaut qui lui est propre, la CONTINUATION d'une adhésion active après la
 * suppression du compte, dans le vocabulaire déjà établi par le départ
 * volontaire et le retrait admin (#5760/#5799/#5800) — `isActive: false` +
 * `leftAt`, jamais un `deleteMany` : le rôle et les dates d'adhésion restent
 * lisibles pour l'historique de modération de la communauté, exactement
 * comme un départ ordinaire.
 *
 * Idempotent par construction : ne touche que les lignes encore actives, une
 * ré-exécution après un échec partiel ne fait donc rien de plus que ce qui
 * reste à faire.
 */
export async function deactivateCommunityMembershipsOfDeletedAccount(
  prisma: Pick<PrismaClient, 'communityMember'>,
  userId: string,
): Promise<{ deactivated: number }> {
  const { count } = await prisma.communityMember.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false, leftAt: new Date() },
  });

  log.info('deleted-account community memberships deactivated', { userId, deactivated: count });

  return { deactivated: count };
}
