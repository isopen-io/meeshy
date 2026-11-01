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
import { simpleRepostRootId } from '../../posts/postVisibility';
import { getBlockedUserIdsAmong, isBlockedBetween } from '../../../utils/blocking';
import { resolveEntourage, thirdPartyEntourage, type Entourage } from './entourage';
import type { FanoutDependencies } from './dependencies';

export type RelayedActivity = 'reaction' | 'share' | 'repost' | 'quote';

type RelayKeys = {
  readonly type: NotificationType;
  readonly onMyContent: CircleNotifyKey;
  /** Le cran C de l'acteur ; absent (republication) ⇒ l'entourage B seul, l'acteur ne bloquant personne. */
  readonly elsewhere?: CircleNotifyKey;
  /** Sur son PROPRE contenu : l'entourage A de l'acteur ; absent ⇒ rien n'est relayé. */
  readonly publication?: CircleNotifyKey;
};

const RELAYS: Readonly<Record<RelayedActivity, RelayKeys>> = {
  reaction: { type: 'friend_content_reaction', onMyContent: 'circleOnMyContentReaction', elsewhere: 'circleElsewhereReaction' },
  share: {
    type: 'friend_content_share',
    onMyContent: 'circleOnMyContentShare',
    elsewhere: 'circleElsewhereShare',
    publication: 'circlePublicationShare',
  },
  repost: { type: 'friend_content_repost', onMyContent: 'circleOnMyContentRepost' },
  quote: { type: 'friend_content_quote', onMyContent: 'circleOnMyContentQuote', elsewhere: 'circleElsewhereQuote' },
};

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

const relayOnceKey = (params: { readonly activity: RelayedActivity; readonly actorId: string; readonly postId: string }): string => `notif:relay:${params.activity}:${params.actorId}:${params.postId}`;

/**
 * Le débit d'un acteur, par activité : au plus `RELAY_BURST` relais sur
 * `RELAY_BURST_WINDOW_SECONDS`. Sans lui, partager soixante contenus en une
 * minute pousserait soixante notifications à chaque proche. Des cases posées
 * par `setnx`, chacune expirant seule : la première libre est prise.
 */
export const RELAY_BURST = 5;
export const RELAY_BURST_WINDOW_SECONDS = 10 * 60;

async function claimBurstSlot(
  throttle: RelayThrottle,
  params: { readonly activity: RelayedActivity; readonly actorId: string }
): Promise<boolean> {
  for (let slot = 0; slot < RELAY_BURST; slot += 1) {
    if (await throttle.setnx(`notif:relay-burst:${params.activity}:${params.actorId}:${slot}`, '1', RELAY_BURST_WINDOW_SECONDS)) return true;
  }
  return false;
}

const relayThrottleOf = async (deps: ActivityRelayDependencies): Promise<RelayThrottle> =>
  deps.relayThrottle ?? (await import('../../CacheStore')).getCacheStore();

export type ActivityRelayParams = {
  readonly activity: RelayedActivity;
  readonly postId: string;
  readonly actorId: string;
  readonly emoji?: string;
};

type RelayedPost = {
  readonly id: string;
  readonly authorId: string;
  readonly type: string | null;
  readonly visibility: string | null;
  readonly visibilityUserIds: readonly string[];
  readonly content: string | null;
  readonly expiresAt?: Date | string | null;
  readonly isQuote?: boolean;
  readonly repostOfId?: string | null;
  readonly originalRepostOfId?: string | null;
};

const isExpired = (post: RelayedPost, now: number): boolean =>
  post.expiresAt !== undefined && post.expiresAt !== null && new Date(post.expiresAt).getTime() <= now;

/**
 * Son propre contenu : l'entourage A de l'acteur. Celui d'un autre : B ∩ C, ou
 * B seul sans cran C — et personne si l'auteur et l'acteur sont bloqués, dans
 * un sens ou dans l'autre : le relais n'ouvre jamais au bloqué l'entourage de
 * qui l'a bloqué. Une lecture en échec jette, donc n'envoie rien.
 */
async function entourageOf(
  deps: ActivityRelayDependencies,
  post: RelayedPost,
  actorId: string,
  keys: RelayKeys
): Promise<Entourage> {
  if (post.authorId === actorId && keys.publication !== undefined) {
    return resolveEntourage(deps.prisma, { ownerId: actorId, key: keys.publication, excludeUserIds: [] });
  }
  if (await isBlockedBetween(deps.prisma, actorId, post.authorId)) return { ids: [], truncated: false };
  if (keys.elsewhere !== undefined) {
    return thirdPartyEntourage(deps.prisma, {
      authorId: post.authorId,
      actorId,
      onMyContent: keys.onMyContent,
      elsewhere: keys.elsewhere,
    });
  }
  const ofAuthor = await resolveEntourage(deps.prisma, { ownerId: post.authorId, key: keys.onMyContent, excludeUserIds: [actorId], mustBeAlive: [actorId] });
  const blockedWithActor = await getBlockedUserIdsAmong(deps.prisma, actorId, [...ofAuthor.ids]);
  return { ids: ofAuthor.ids.filter((id) => !blockedWithActor.has(id)), truncated: ofAuthor.truncated };
}

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const readRelayedPost = (deps: ActivityRelayDependencies, postId: string): Promise<RelayedPost | null> =>
  deps.prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: {
      id: true, authorId: true, type: true, visibility: true, visibilityUserIds: true, content: true, expiresAt: true,
      isQuote: true, repostOfId: true, originalRepostOfId: true,
    },
  }) as Promise<RelayedPost | null>;

const relayable = (post: RelayedPost | null): post is RelayedPost =>
  post !== null && post.visibility !== 'PRIVATE' && !isExpired(post, Date.now());

const admit = async (deps: ActivityRelayDependencies, post: RelayedPost, candidateUserIds: readonly string[]): Promise<string[]> =>
  candidateUserIds.length === 0
    ? []
    : filterPostConsumers({
        prisma: deps.prisma,
        authorId: post.authorId,
        visibility: post.visibility,
        visibilityUserIds: post.visibilityUserIds,
        candidateUserIds: [...candidateUserIds],
      });

type RelayDelivery = {
  readonly activity: RelayedActivity;
  readonly actorId: string;
  readonly content: RelayedPost;
  readonly targetPostId: string;
  readonly recipients: readonly string[];
  readonly onceKey: string;
  readonly emoji?: string;
  readonly metadata?: Record<string, string>;
};

/** Débit, clé « une fois », puis l'envoi par lots — commun à toutes les activités. */
async function deliver(deps: ActivityRelayDependencies, throttle: RelayThrottle, delivery: RelayDelivery): Promise<void> {
  const recipients = delivery.recipients.filter((id) => id !== delivery.content.authorId && id !== delivery.actorId);
  if (recipients.length === 0) return;
  if (!(await claimBurstSlot(throttle, { activity: delivery.activity, actorId: delivery.actorId }))) return;
  if (!(await throttle.setnx(delivery.onceKey, '1', RELAY_ONCE_WINDOW_SECONDS))) return;

  const [actor, author] = await Promise.all([
    deps.prisma.user.findUnique({ where: { id: delivery.actorId }, select: { username: true, displayName: true, avatar: true } }),
    deps.prisma.user.findUnique({ where: { id: delivery.content.authorId }, select: { username: true, displayName: true } }),
  ]);
  if (!actor) return;
  const ownContent = delivery.content.authorId === delivery.actorId;
  const authorName = author?.displayName?.trim() || author?.username?.trim() || '';
  const keys = RELAYS[delivery.activity];

  for (const batch of chunks(recipients, RELAY_BATCH_SIZE)) {
    await Promise.allSettled(
      batch.map((userId) =>
        deps.createNotification({
          userId,
          type: keys.type,
          priority: 'low',
          content: delivery.emoji ?? '',
          actor: { id: delivery.actorId, username: actor.username, displayName: actor.displayName, avatar: actor.avatar },
          context: { postId: delivery.targetPostId },
          metadata: {
            action: 'view_post',
            activity: delivery.activity,
            postId: delivery.targetPostId,
            postType: delivery.content.type ?? 'POST',
            ...(delivery.emoji ? { emoji: delivery.emoji } : {}),
            ...(authorName && !ownContent ? { contentAuthorName: authorName } : {}),
            ...(delivery.metadata ?? {}),
          },
        })
      )
    );
  }
}

export async function relayActivityToEntourage(deps: ActivityRelayDependencies, params: ActivityRelayParams): Promise<void> {
  try {
    const post = await readRelayedPost(deps, params.postId);
    if (!relayable(post)) return;
    const keys = RELAYS[params.activity];
    if (post.authorId === params.actorId && keys.publication === undefined) return;

    const throttle = await relayThrottleOf(deps);
    const onceKey = relayOnceKey(params);
    if ((await throttle.get(onceKey)) !== null) return;

    const entourage = await entourageOf(deps, post, params.actorId, keys);
    const recipients = await admit(deps, post, entourage.ids);
    await deliver(deps, throttle, {
      activity: params.activity,
      actorId: params.actorId,
      content: post,
      targetPostId: params.postId,
      recipients,
      onceKey,
      ...(params.emoji ? { emoji: params.emoji } : {}),
    });
  } catch (error) {
    notificationLogger.error('Relais d’activité abandonné : lecture illisible', { postId: params.postId, activity: params.activity, error });
  }
}

export type RepostRelayParams = {
  readonly originalPostId: string;
  readonly repostId: string;
  readonly actorId: string;
  /** L'éventail `friend_new_post` de la republication est parti : son entourage A l'a déjà apprise. */
  readonly reposterEntourageNotified: boolean;
};

/**
 * Republier (#14070) ou citer (#14072) le contenu d'un AUTRE : l'entourage de
 * l'auteur republié (B seul pour une republication, B ∩ C pour une citation),
 * qui doit pouvoir voir l'original ET la republication. Qui l'a déjà apprise par
 * `friend_new_post` (entourage A du republieur) n'est pas prévenu deux fois.
 */
export async function relayRepostToEntourage(deps: ActivityRelayDependencies, params: RepostRelayParams): Promise<void> {
  try {
    const [source, repost] = await Promise.all([readRelayedPost(deps, params.originalPostId), readRelayedPost(deps, params.repostId)]);
    if (!relayable(source) || !relayable(repost)) return;
    // Une republication SIMPLE n'est pas un contenu : on remonte à sa racine. Une citation en est un.
    const rootId = simpleRepostRootId(source);
    const original = rootId === null ? source : await readRelayedPost(deps, rootId);
    if (!relayable(original)) return;
    const originalPostId = rootId ?? params.originalPostId;
    if (repost.authorId !== params.actorId || original.authorId === params.actorId) return;
    const activity: RelayedActivity = repost.isQuote === true ? 'quote' : 'repost';

    const throttle = await relayThrottleOf(deps);
    const onceKey = relayOnceKey({ activity, actorId: params.actorId, postId: originalPostId });
    if ((await throttle.get(onceKey)) !== null) return;

    const [entourage, alreadyTold] = await Promise.all([
      entourageOf(deps, original, params.actorId, RELAYS[activity]),
      params.reposterEntourageNotified
        ? resolveEntourage(deps.prisma, { ownerId: params.actorId, key: 'circlePublicationRepost', excludeUserIds: [] })
        : Promise.resolve<Entourage>({ ids: [], truncated: false }),
    ]);
    const told = new Set(alreadyTold.ids);
    const seeOriginal = await admit(deps, original, entourage.ids.filter((id) => !told.has(id)));
    const seeSource = rootId === null ? seeOriginal : await admit(deps, source, seeOriginal);
    const recipients = await admit(deps, repost, seeSource);
    await deliver(deps, throttle, {
      activity,
      actorId: params.actorId,
      content: original,
      targetPostId: params.repostId,
      recipients,
      onceKey,
      metadata: { originalPostId, repostId: params.repostId },
    });
  } catch (error) {
    notificationLogger.error('Relais de republication abandonné : lecture illisible', { repostId: params.repostId, error });
  }
}
