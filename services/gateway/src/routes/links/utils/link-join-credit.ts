import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementService } from '../../../services/engagement/EngagementService';
import type { LinkAdmissionIdentity } from '../../../services/conversations/linkAdmission';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'LinkJoinCredit' });

/** Ce que la jonction par lien demande au moteur d'engagement (#8959) — un double en test. */
export type LinkJoinEngagement = Pick<EngagementService, 'recordActivity'>;

/**
 * `social.conversation_link_joined` (#8959) : une ARRIVÉE par un lien
 * d'invitation paie son auteur, une fois par personne — la cible est le compte
 * de l'arrivant, ou sa ligne de participant quand il entre en invité. L'auteur
 * qui emprunte son propre lien ne se paie pas. L'appelant ne l'invoque que
 * pour une arrivée réelle, jamais pour un « déjà membre ».
 */
export function creditLinkJoin(params: {
  readonly prisma: PrismaClient;
  readonly engagement?: LinkJoinEngagement;
  readonly creatorId: string;
  readonly identity: LinkAdmissionIdentity;
  readonly participantId: string;
}): void {
  const { creatorId, identity, participantId } = params;
  const joinerUserId = identity.kind === 'registered' ? identity.userId : null;
  if (!creatorId || joinerUserId === creatorId) return;
  (params.engagement ?? new EngagementService(params.prisma))
    .recordActivity(creatorId, 'social.conversation_link_joined', {
      targetId: joinerUserId ?? participantId,
      ...(joinerUserId ? { actorId: joinerUserId } : {}),
    })
    .catch((err: unknown) => logger.warn('engagement social.conversation_link_joined failed', { err }));
}
