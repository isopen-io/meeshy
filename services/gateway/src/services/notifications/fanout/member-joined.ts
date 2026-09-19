/**
 * MEMBER_JOINED — extrait de `NotificationService.ts` (#7093). Cinquième
 * éventail batch de la tranche (§ 9 Q1 de la spécification #7093) : même
 * forme que les quatre autres — un instantané lu une fois, N
 * `createNotification`.
 */
import type { Notification } from '@meeshy/shared/types/notification';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { filterMutedRecipients } from '../mutedRecipients';
import type { FanoutDependencies } from './dependencies';

/**
 * La part d'une notification `member_joined` qui ne dépend PAS du destinataire.
 * Lue une fois, servie à toute l'audience — c'est ce qui distingue une arrivée
 * (un événement, N destinataires) d'une boucle de N notifications distinctes.
 */
type MemberJoinedSnapshot = {
  readonly newMember: { username: string; displayName: string | null; avatar: string | null };
  readonly conversation: { title: string | null; type: string } | null;
  readonly memberCount: number;
};

export type MemberJoinedFanoutCommon = {
  newMemberUserId: string;
  conversationId: string;
  joinMethod?: 'via_link' | 'invited';
};

export type CreateMemberJoinedNotificationParams = MemberJoinedFanoutCommon & {
  recipientUserId: string;
};

export async function createMemberJoinedNotification(
  deps: FanoutDependencies,
  params: CreateMemberJoinedNotificationParams
): Promise<Notification | null> {
  // Une arrivée est de l'activité AMBIANTE : elle se tait dans une
  // conversation en sourdine (cf. `mutedRecipients.ts`). Avant les lectures :
  // sur un groupe où tout le monde a coupé le son, un ajout de membre payait
  // trois requêtes par destinataire pour ne rien émettre.
  if (await deps.isConversationMutedFor(params.recipientUserId, params.conversationId, 'member_joined')) {
    return null;
  }

  const snapshot = await loadMemberJoinedSnapshot(deps, params.newMemberUserId, params.conversationId);
  if (!snapshot) return null;

  return createMemberJoinedFor(deps, params.recipientUserId, params, snapshot);
}

/**
 * Prévient une audience entière de la même arrivée.
 *
 * Les trois lectures dont `member_joined` a besoin — profil du nouveau
 * membre, conversation, effectif — ne dépendent pas du destinataire : elles
 * sont faites UNE fois pour toute l'audience, et le mute est demandé en une
 * requête plutôt qu'une par personne. La boucle d'appels unitaires qui
 * précédait payait 4 requêtes par destinataire pour quatre résultats
 * identiques, et le surcoût grandissait avec le groupe.
 *
 * Rend le nombre de notifications réellement créées : une préférence de type
 * ou un DND côté destinataire peut en écarter sans que ce soit une erreur.
 */
export async function createMemberJoinedNotificationsBatch(
  deps: FanoutDependencies,
  recipientUserIds: readonly string[],
  common: MemberJoinedFanoutCommon
): Promise<number> {
  const audience = [...new Set(recipientUserIds)];
  if (audience.length === 0) return 0;

  const listening = await filterMutedRecipients(deps.prisma, common.conversationId, audience);
  if (listening.length === 0) {
    notificationLogger.info('Member-joined fan-out silenced (whole audience muted)', {
      conversationId: common.conversationId,
      audienceSize: audience.length,
    });
    return 0;
  }

  const snapshot = await loadMemberJoinedSnapshot(deps, common.newMemberUserId, common.conversationId);
  if (!snapshot) return 0;

  // `createNotification` ne rejette jamais (catch interne) — un destinataire
  // en échec rend `null` et n'emporte pas les autres.
  const results = await Promise.all(
    listening.map((recipientUserId) => createMemberJoinedFor(deps, recipientUserId, common, snapshot))
  );
  return results.filter(Boolean).length;
}

/**
 * La part de `member_joined` qui ne dépend PAS du destinataire. `null` quand
 * le nouveau membre est introuvable : sans acteur, la notification n'a pas de
 * sujet, et aucun destinataire ne doit en recevoir.
 */
async function loadMemberJoinedSnapshot(
  deps: FanoutDependencies,
  newMemberUserId: string,
  conversationId: string
): Promise<MemberJoinedSnapshot | null> {
  const [newMember, conversation, memberCount] = await Promise.all([
    deps.prisma.user.findUnique({
      where: { id: newMemberUserId },
      select: { username: true, displayName: true, avatar: true },
    }),
    deps.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, type: true },
    }),
    deps.prisma.participant.count({
      where: { conversationId },
    }),
  ]);

  if (!newMember) return null;
  return { newMember, conversation, memberCount };
}

function createMemberJoinedFor(
  deps: FanoutDependencies,
  recipientUserId: string,
  common: { newMemberUserId: string; conversationId: string; joinMethod?: 'via_link' | 'invited' },
  snapshot: MemberJoinedSnapshot
): Promise<Notification | null> {
  return deps.createNotification({
    userId: recipientUserId,
    type: 'member_joined',
    priority: 'low',
    content: 'Nouveau membre',

    actor: {
      id: common.newMemberUserId,
      username: snapshot.newMember.username,
      displayName: snapshot.newMember.displayName,
      avatar: snapshot.newMember.avatar,
    },

    context: {
      conversationId: common.conversationId,
      conversationTitle: snapshot.conversation?.title,
      conversationType: snapshot.conversation?.type as any,
    },

    metadata: {
      action: 'view_conversation',
      memberCount: snapshot.memberCount,
      isMember: true,
      joinMethod: common.joinMethod,
    },
  });
}
