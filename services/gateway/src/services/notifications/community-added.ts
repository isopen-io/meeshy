/**
 * « Ajouté à la communauté Y » (#18052) — la personne qu'on fait entrer dans
 * une communauté l'apprend.
 *
 * Trois portes ajoutent quelqu'un sans qu'il ait rien demandé : l'invitation
 * (`POST /communities/:id/invite`), l'ajout par un administrateur
 * (`POST /communities/:id/members`) et la bascule d'une communauté publique en
 * privée, qui fait membres les occupants de ses salons (#16723). Aucune ne
 * disait rien à la personne : elle découvrait la communauté dans sa liste, ou
 * jamais. Les deux réponses possibles de la décision #16669 (une invitation à
 * accepter, ou au minimum « X vous a ajouté ») passent toutes deux par cette
 * annonce.
 *
 * Règles, gardées par `__tests__/community-added.test.ts` :
 *  - la langue est celle du DESTINATAIRE (cadrage du Prisme,
 *    `utils/recipient-language.ts`), descendue jusqu'à la locale appareil ;
 *  - jamais à l'acteur, jamais deux fois à la même personne, jamais à un compte
 *    qui n'est plus vivant ;
 *  - une communauté désactivée ou disparue entre-temps n'annonce rien ;
 *  - la charge ne porte que l'identité de la communauté (pour le tap) et celle
 *    de l'acteur — ni l'effectif, ni la confidentialité, ni les autres membres ;
 *  - le nom part tel qu'écrit : la passerelle le stocke échappé (#16786), une
 *    bannière n'est pas du HTML.
 *
 * La préférence du destinataire (`community_invite` → `groupInviteEnabled`)
 * est appliquée par `createNotification`, comme pour toute notification.
 *
 * Travail ASYNCHRONE : les routes l'appellent par
 * `scheduleCommunityAddedAnnouncement`, après la réponse, jamais en ligne.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language.js';
import { deferAfterResponse, type AfterResponse } from '../../utils/after-response.js';
import type { NotificationService } from './NotificationService.js';
import { getSharedNotificationService } from './notification-service-registry.js';

const logger = enhancedLogger.child({ module: 'CommunityAdded' });

type Notifier = Pick<NotificationService, 'createNotification'>;
type CommunityAddedPrisma = Pick<PrismaClient, 'community' | 'user'>;

export type CommunityAddedDeps = {
  readonly prisma: CommunityAddedPrisma;
  readonly notifications: Notifier;
};

export type CommunityAddedRequest = {
  readonly communityId: string;
  readonly actorId: string;
  readonly recipientIds: readonly string[];
};

const ESCAPED_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ',
};

function asWritten(name: string): string {
  return name.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ESCAPED_ENTITIES[entity] ?? entity);
}

export async function announceAddedToCommunity(
  deps: CommunityAddedDeps,
  request: CommunityAddedRequest,
): Promise<number> {
  const ids = [...new Set(request.recipientIds)].filter((id) => id !== request.actorId);
  if (ids.length === 0) return 0;

  const community = await deps.prisma.community.findFirst({
    where: { id: request.communityId, isActive: true },
    select: { name: true },
  });
  if (!community) return 0;

  const actor = await deps.prisma.user.findUnique({
    where: { id: request.actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return 0;

  const recipients = await deps.prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, deactivatedAt: null, deletedAt: null },
    select: { id: true, ...RECIPIENT_LANG_SELECT },
    take: ids.length,
  });

  const communityName = asWritten(community.name);
  const outcomes = await Promise.all(recipients.map(async (recipient) => {
    const lang = recipientLanguage(recipient, 'fr');
    try {
      await deps.notifications.createNotification({
        userId: recipient.id,
        type: 'community_invite',
        priority: 'normal',
        content: notificationString(lang, 'community.added', { title: communityName }),
        actor: {
          id: request.actorId,
          username: actor.username,
          displayName: actor.displayName ?? actor.username,
          avatar: actor.avatar ?? undefined,
        },
        context: { communityId: request.communityId, communityName },
        metadata: { action: 'view_community' },
        lang,
      });
      return 1;
    } catch (error) {
      logger.warn('community_added notification failed', { communityId: request.communityId, error });
      return 0;
    }
  }));
  return outcomes.reduce<number>((sum, sentOne) => sum + sentOne, 0);
}

export function scheduleCommunityAddedAnnouncement(
  prisma: CommunityAddedPrisma,
  request: CommunityAddedRequest,
  options: { readonly afterResponse?: AfterResponse; readonly notifications?: Notifier } = {},
): void {
  const notifications = options.notifications ?? getSharedNotificationService();
  if (!notifications || request.recipientIds.length === 0) return;
  (options.afterResponse ?? deferAfterResponse)(async () => {
    try {
      await announceAddedToCommunity({ prisma, notifications }, request);
    } catch (error) {
      logger.warn('community_added announcement failed', { communityId: request.communityId, error });
    }
  }, 'community-added-announcement');
}
