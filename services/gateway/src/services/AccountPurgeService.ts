import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'AccountPurgeService' });

export type AccountPurgeSummary = {
  readonly sessionsDeleted: number;
  readonly voiceProfileDeleted: number;
  readonly shareLinksDeleted: number;
};

/**
 * Purge, à l'expiration de la période de grâce (#3632), la portion des
 * données d'un compte supprimé qui ne touche AUCUN autre utilisateur :
 * sessions, profil vocal, liens de partage créés par ce compte. Trois tables
 * isolées, aucune ligne partagée avec un tiers — supprimables sans arbitrage
 * sur ce qu'un AUTRE participant continue de voir.
 *
 * Idempotent par construction (`deleteMany` sur une ligne déjà absente ne
 * lève pas) : rejouable sans effet de bord si l'appelant retente après un
 * échec partiel.
 *
 * Volontairement HORS DE PORTÉE ici — chacun est un suivi distinct ouvert
 * depuis #3632, jamais une ligne ajoutée à ce module sans sa propre revue :
 *  - les MESSAGES envoyés par ce compte, visibles par d'autres participants —
 *    l'anonymisation doit reprendre exactement la sémantique de « suppression
 *    pour tous » déjà en place (`translations: null, deletedAt: new Date()`,
 *    cf. `routes/messages-writes.ts`), résolue via `Participant.id` puisque
 *    `Message.senderId` référence un `Participant`, pas un `User` ;
 *  - les MÉDIAS (`MessageAttachment` / `PostMedia`) — la suppression PHYSIQUE
 *    des octets a sa propre infrastructure (`AttachmentService.deleteAttachment`,
 *    `reclaimPostMediaBytes`) qu'un lot dédié doit réutiliser, jamais dupliquer ;
 *  - l'anonymisation de l'identité (`User.username`/`email`/`displayName`/…) —
 *    contraintes d'unicité Mongo à respecter et copies dénormalisées sur
 *    `Participant.displayName` à traiter dans le même mouvement.
 */
export async function purgeAccountIsolatedData(
  prisma: Pick<PrismaClient, 'userSession' | 'userVoiceModel' | 'conversationShareLink'>,
  userId: string,
): Promise<AccountPurgeSummary> {
  const [sessions, voiceProfile, shareLinks] = await Promise.all([
    prisma.userSession.deleteMany({ where: { userId } }),
    prisma.userVoiceModel.deleteMany({ where: { userId } }),
    prisma.conversationShareLink.deleteMany({ where: { createdBy: userId } }),
  ]);

  const summary: AccountPurgeSummary = {
    sessionsDeleted: sessions.count,
    voiceProfileDeleted: voiceProfile.count,
    shareLinksDeleted: shareLinks.count,
  };

  logger.info(`[AccountPurge] user=${userId} sessions=${summary.sessionsDeleted} voiceProfile=${summary.voiceProfileDeleted} shareLinks=${summary.shareLinksDeleted}`);

  return summary;
}
