/**
 * Le refus d'une demande d'entrée, annoncé au DEMANDEUR (#19879).
 *
 * `POST /communities/:id/join-requests/:requestId/reject` ne prévenait
 * personne : le demandeur lisait « Demande envoyée » jusqu'à sa prochaine
 * lecture du détail, et rien ne lui disait quand il pourrait redemander.
 *
 * Deux canaux, chacun indépendant de l'autre :
 *  - `community:join-request-decided` sur la room `user:<demandeur>` SEULE —
 *    la communauté, la décision, `retryAt` (fin du délai de sept jours) et
 *    `at` ; l'écran ouvert passe à « Demande refusée » sans relecture ;
 *  - une notification dans la langue de CADRAGE du demandeur
 *    (`utils/recipient-language.ts`), du type `community_invite` : la famille
 *    « entrer dans une communauté » que les trois clients savent déjà rendre
 *    et ouvrir, coupée par la même préférence (`groupInviteEnabled`).
 *
 * Rien ne nomme l'intendant qui a tranché (ni acteur, ni identifiant), rien ne
 * part vers lui. Un compte qui n'est plus utilisable n'est pas notifié ; une
 * communauté désactivée entre-temps n'annonce rien. Travail ASYNCHRONE, après
 * la réponse.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { SERVER_EVENTS, type CommunityJoinRequestDecidedEventData } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { deferAfterResponse, type AfterResponse } from '../utils/after-response.js';
import { broadcastToUser } from '../utils/socket-broadcast';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../utils/recipient-language.js';
import { USABLE_ACCOUNT_WHERE } from './relations/usableAccount';
import type { NotificationService } from './notifications/NotificationService.js';
import { getSharedNotificationService } from './notifications/notification-service-registry.js';
import { asWritten } from './notifications/community-added';
import { JOIN_REQUEST_COOLDOWN_MS } from './community-join-request-lifecycle';

const logger = enhancedLogger.child({ module: 'CommunityJoinRequestDecided' });

type Notifier = Pick<NotificationService, 'createNotification'>;
type DecidedPrisma = Pick<PrismaClient, 'community' | 'user'>;

export type JoinRequestRejection = {
  readonly communityId: string;
  readonly userId: string;
  readonly decidedBy: string;
  readonly decidedAt: Date;
};

export type JoinRequestDecidedDeps = {
  readonly prisma: DecidedPrisma;
  readonly notifications: Notifier | null;
  readonly deliver: (userId: string, payload: CommunityJoinRequestDecidedEventData) => void;
};

export function joinRetryAt(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + JOIN_REQUEST_COOLDOWN_MS);
}

async function notifyRequester(deps: JoinRequestDecidedDeps, rejection: JoinRequestRejection, communityName: string): Promise<void> {
  if (deps.notifications === null) return;
  const [requester] = await deps.prisma.user.findMany({
    where: { id: { in: [rejection.userId] }, ...USABLE_ACCOUNT_WHERE },
    select: { id: true, ...RECIPIENT_LANG_SELECT },
    take: 1,
  });
  if (!requester) return;
  const lang = recipientLanguage(requester, 'fr');
  await deps.notifications.createNotification({
    userId: requester.id,
    type: 'community_invite',
    priority: 'normal',
    content: notificationString(lang, 'community.joinRejected', { title: communityName }),
    context: { communityId: rejection.communityId, communityName },
    metadata: { action: 'view_community' },
    lang,
  });
}

export async function announceJoinRequestRejected(deps: JoinRequestDecidedDeps, rejection: JoinRequestRejection): Promise<void> {
  const community = await deps.prisma.community.findFirst({
    where: { id: rejection.communityId, isActive: true },
    select: { name: true },
  });
  if (!community) return;

  try {
    deps.deliver(rejection.userId, {
      communityId: rejection.communityId,
      decision: 'rejected',
      retryAt: joinRetryAt(rejection.decidedAt).toISOString(),
      at: rejection.decidedAt.toISOString(),
    });
  } catch (error) {
    logger.warn('community join-request-decided emit failed', { communityId: rejection.communityId, error });
  }

  try {
    await notifyRequester(deps, rejection, asWritten(community.name));
  } catch (error) {
    logger.warn('community join rejected notification failed', { communityId: rejection.communityId, error });
  }
}

export function scheduleJoinRequestRejected(
  prisma: DecidedPrisma,
  rejection: JoinRequestRejection,
  options: {
    readonly afterResponse?: AfterResponse;
    readonly notifications?: Notifier | null;
    readonly deliver: JoinRequestDecidedDeps['deliver'];
  },
): void {
  const notifications = options.notifications === undefined ? getSharedNotificationService() : options.notifications;
  (options.afterResponse ?? deferAfterResponse)(async () => {
    try {
      await announceJoinRequestRejected({ prisma, notifications: notifications ?? null, deliver: options.deliver }, rejection);
    } catch (error) {
      logger.warn('community join rejected announcement failed', { communityId: rejection.communityId, error });
    }
  }, 'community-join-request-rejected');
}

export function scheduleJoinRequestRejectedFrom(fastify: FastifyInstance, rejection: JoinRequestRejection): void {
  scheduleJoinRequestRejected(fastify.prisma, rejection, {
    deliver: (userId, payload) => broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_JOIN_REQUEST_DECIDED, payload),
  });
}
