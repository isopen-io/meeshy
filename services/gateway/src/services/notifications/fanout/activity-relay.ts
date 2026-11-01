/**
 * LE RELAIS D'UNE ACTIVITÉ à l'entourage (#13929, suivis #14068…) — « X a réagi
 * à la publication de Y », envoyé à qui passe LES DEUX seuils (#14080, le plus
 * restrictif gagne) :
 *  - l'entourage B de l'AUTEUR du contenu (`circleOnMyContent<Action>`, mesuré
 *    depuis l'auteur, défaut Proche) ;
 *  - l'entourage C de l'ACTEUR (`circleElsewhere<Action>`, mesuré depuis lui,
 *    défaut Sang).
 * Puis l'admission de la publication (`filterPostConsumers`) retire qui ne peut
 * pas la voir. Une activité sur son PROPRE contenu n'est pas relayée par ici.
 *
 * La personne directement visée (l'auteur) est prévenue par SA notification
 * (`post_like`, …), hors de ce relais. Le blocage coupe dans chaque entourage
 * (mesuré depuis son propriétaire), et `createNotification` le revérifie entre
 * l'acteur et chaque destinataire ; les préférences par type du destinataire
 * s'appliquent (`friendContentEnabled`). Envoi par lots de `RELAY_BATCH_SIZE`.
 *
 * Une forme nouvelle par activité (`friend_content_reaction`, …) — rétrocompatibilité : un ancien
 * client ne connaît pas ce type et le range en notification système (iOS
 * `MeeshyNotificationType(rawValue:) ?? .system`, web et Android : famille
 * `system`) ; le titre (acteur + phrase), le corps et la bannière push sont
 * composés par la passerelle, lisibles tels quels.
 */
import type { CircleNotifyKey } from '@meeshy/shared/utils/relation-levels';
import type { NotificationType } from '@meeshy/shared/types/notification';
import { notificationLogger } from '../../../utils/logger-enhanced';
import { filterPostConsumers } from '../../posts/postAudience';
import { NOT_DELETED } from '../../posts/softDelete';
import { thirdPartyEntourage } from './entourage';
import type { FanoutDependencies } from './dependencies';

export type RelayedActivity = 'reaction';

const RELAYS = {
  reaction: { type: 'friend_content_reaction', onMyContent: 'circleOnMyContentReaction', elsewhere: 'circleElsewhereReaction' },
} as const satisfies Readonly<
  Record<RelayedActivity, { readonly type: NotificationType; readonly onMyContent: CircleNotifyKey; readonly elsewhere: CircleNotifyKey }>
>;

export const RELAY_BATCH_SIZE = 50;

/** Une activité est relayée UNE fois par (acteur, contenu) sur cette fenêtre : changer d'emoji ou réagir de nouveau ne relance pas l'entourage. */
export const RELAY_ONCE_WINDOW_SECONDS = 7 * 24 * 3600;

export type RelayThrottle = {
  get(key: string): Promise<string | null>;
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
};

export type ActivityRelayDependencies = Pick<FanoutDependencies, 'prisma' | 'createNotification'> & {
  readonly relayThrottle?: RelayThrottle;
};

const relayOnceKey = (params: ActivityRelayParams): string => `notif:relay:${params.activity}:${params.actorId}:${params.postId}`;

const relayThrottleOf = async (deps: ActivityRelayDependencies): Promise<RelayThrottle> =>
  deps.relayThrottle ?? (await import('../../CacheStore')).getCacheStore();

export type ActivityRelayParams = {
  readonly activity: RelayedActivity;
  readonly postId: string;
  readonly actorId: string;
  readonly emoji?: string;
};

type RelayedPost = {
  readonly authorId: string;
  readonly type: string | null;
  readonly visibility: string | null;
  readonly visibilityUserIds: readonly string[];
  readonly content: string | null;
  readonly expiresAt?: Date | string | null;
};

const isExpired = (post: RelayedPost, now: number): boolean =>
  post.expiresAt !== undefined && post.expiresAt !== null && new Date(post.expiresAt).getTime() <= now;

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export async function relayActivityToEntourage(deps: ActivityRelayDependencies, params: ActivityRelayParams): Promise<void> {
  try {
    const post = (await deps.prisma.post.findFirst({
      where: { id: params.postId, deletedAt: NOT_DELETED },
      select: { authorId: true, type: true, visibility: true, visibilityUserIds: true, content: true, expiresAt: true },
    })) as RelayedPost | null;
    if (!post || post.authorId === params.actorId || post.visibility === 'PRIVATE' || isExpired(post, Date.now())) return;

    const throttle = await relayThrottleOf(deps);
    const onceKey = relayOnceKey(params);
    if ((await throttle.get(onceKey)) !== null) return;

    const keys = RELAYS[params.activity];
    const entourage = await thirdPartyEntourage(deps.prisma, {
      authorId: post.authorId,
      actorId: params.actorId,
      onMyContent: keys.onMyContent,
      elsewhere: keys.elsewhere,
    });
    if (entourage.ids.length === 0) return;

    const recipients = (
      await filterPostConsumers({
        prisma: deps.prisma,
        authorId: post.authorId,
        visibility: post.visibility,
        visibilityUserIds: post.visibilityUserIds,
        candidateUserIds: entourage.ids,
      })
    ).filter((id) => id !== post.authorId && id !== params.actorId);
    if (recipients.length === 0) return;
    if (!(await throttle.setnx(onceKey, '1', RELAY_ONCE_WINDOW_SECONDS))) return;

    const [actor, author] = await Promise.all([
      deps.prisma.user.findUnique({ where: { id: params.actorId }, select: { username: true, displayName: true, avatar: true } }),
      deps.prisma.user.findUnique({ where: { id: post.authorId }, select: { username: true, displayName: true } }),
    ]);
    if (!actor) return;
    const authorName = author?.displayName?.trim() || author?.username?.trim() || '';
    const postType = post.type ?? 'POST';

    for (const batch of chunks(recipients, RELAY_BATCH_SIZE)) {
      await Promise.allSettled(
        batch.map((userId) =>
          deps.createNotification({
            userId,
            type: keys.type,
            priority: 'low',
            content: params.emoji ?? '',
            actor: { id: params.actorId, username: actor.username, displayName: actor.displayName, avatar: actor.avatar },
            context: { postId: params.postId },
            metadata: {
              action: 'view_post',
              activity: params.activity,
              postId: params.postId,
              postType,
              ...(params.emoji ? { emoji: params.emoji } : {}),
              ...(authorName ? { contentAuthorName: authorName } : {}),
            },
          })
        )
      );
    }
  } catch (error) {
    notificationLogger.error('Relais d’activité abandonné : lecture illisible', { postId: params.postId, activity: params.activity, error });
  }
}
