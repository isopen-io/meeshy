import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ANONYMOUS_V2_TYPES,
  isPostTargetKind,
  type SocialEventTargetRef,
} from '@meeshy/shared/types/social-events-v2';
import { filterConsumablePostIds } from '../../routes/posts/postConsumptionGate';
import { readServableToAnonymous } from '../../routes/posts/anonymousPostGate';
import type { V2EventRead } from '../../routes/social/eventsEnvelope';
import type { ParsedSocialEventsContext, SocialEventV2Parsed } from '../../routes/social/eventsV2Schemas';
import {
  CONTENT_EVENT_COLLECTION,
  compact,
  contentEventRetentionMs,
  ejsonDate,
  ejsonObjectId,
  eventKeyOf,
  insertDocuments,
  utcDayOf,
  type ExtendedJsonDocument,
} from './contentEvents';
import {
  isAttributable,
  keepsPrism,
  storedContextOf,
  storedListingOf,
  type AnalyticsStanding,
} from './eventPrivacy';
import { readSearchId } from './searchFingerprint';

/**
 * L'INGESTION des événements v2 (#10502–#10509) : audience, consentement,
 * rangement — en trois temps, comme les types de comptage.
 *
 *  1. l'AUDIENCE, en une passe par collection, AVANT toute écriture : un post
 *     (ou le post parent d'un commentaire, d'un lien, d'un sticker) que
 *     l'acteur ne peut pas lire est `rejected`, sans oracle d'existence ; une
 *     notification d'autrui aussi ; un anonyme qui envoie un type qu'il ne
 *     peut pas produire aussi ;
 *  2. le CONSENTEMENT (`eventPrivacy.ts`) décide de l'acteur et du contexte
 *     rangés ;
 *  3. le RANGEMENT : UN `insert` non ordonné dans `ContentEvent`. Un rejeu
 *     (même `eventId`) est compté `recorded` sans nouvelle ligne.
 *
 * AUCUN compteur de `Post` ne bouge ici : réagir, partager, enregistrer
 * restent comptés par leur route de MUTATION. La v2 les contextualise.
 */

export type V2Actor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'anonymous' };

/** `withheld` : acquittés SANS écriture parce que le compte a refusé l'analyse (comptés `ignored`). */
export type V2Outcome = { readonly recorded: number; readonly rejected: number; readonly withheld: number };

type V2Prisma = Pick<PrismaClient, '$runCommandRaw'> & {
  readonly postComment?: { readonly findMany: (args: unknown) => Promise<readonly { id: string; postId: string }[]> };
  readonly notification?: { readonly findMany: (args: unknown) => Promise<readonly { id: string }[]> };
};

const ANONYMOUS_TYPES: ReadonlySet<string> = new Set(ANONYMOUS_V2_TYPES);

/** Toutes les références qu'un événement désigne : cible, parent, cibles visibles d'une capture. */
const referencesOf = (event: SocialEventV2Parsed): readonly SocialEventTargetRef[] => [
  ...(event.target ? [event.target] : []),
  ...(event.target?.parent ? [event.target.parent] : []),
  ...('visibleTargets' in event && Array.isArray(event.visibleTargets) ? event.visibleTargets : []),
];

type Audience = {
  readonly posts: ReadonlySet<string>;
  readonly commentPost: ReadonlyMap<string, string>;
  readonly notifications: ReadonlySet<string>;
};

async function readAudience(prisma: V2Prisma, events: readonly SocialEventV2Parsed[], actor: V2Actor): Promise<Audience> {
  const refs = events.flatMap(referencesOf);
  const commentIds = [...new Set(refs.filter((ref) => ref.kind === 'comment').map((ref) => ref.id))];
  const notificationIds = [...new Set(refs.filter((ref) => ref.kind === 'notification').map((ref) => ref.id))];

  const [comments, notifications] = await Promise.all([
    commentIds.length > 0 && prisma.postComment
      ? prisma.postComment.findMany({ where: { id: { in: commentIds } }, select: { id: true, postId: true }, take: commentIds.length })
      : Promise.resolve([] as readonly { id: string; postId: string }[]),
    notificationIds.length > 0 && actor.kind === 'user' && prisma.notification
      ? prisma.notification.findMany({
        where: { id: { in: notificationIds }, userId: actor.userId },
        select: { id: true },
        take: notificationIds.length,
      })
      : Promise.resolve([] as readonly { id: string }[]),
  ]);
  const commentPost = new Map(comments.map((comment) => [comment.id, comment.postId]));

  const postIds = [...new Set([
    ...refs.filter((ref) => isPostTargetKind(ref.kind)).map((ref) => ref.id),
    ...commentPost.values(),
  ])];
  const posts = postIds.length === 0
    ? new Set<string>()
    : actor.kind === 'user'
      ? await filterConsumablePostIds(prisma as never, postIds, actor.userId)
      : new Set((await readServableToAnonymous(prisma as never, postIds)).keys());

  return { posts, commentPost, notifications: new Set(notifications.map((row) => row.id)) };
}

/** Une référence est LISIBLE par l'acteur. Les cibles sans contenu gardé (profil, hashtag, son, communauté, lien) passent. */
const mayReference = (ref: SocialEventTargetRef, audience: Audience): boolean => {
  if (isPostTargetKind(ref.kind)) return audience.posts.has(ref.id);
  if (ref.kind === 'comment') {
    const postId = audience.commentPost.get(ref.id);
    return postId !== undefined && audience.posts.has(postId);
  }
  if (ref.kind === 'notification') return audience.notifications.has(ref.id);
  return true;
};

const isAdmissible = (event: SocialEventV2Parsed, audience: Audience): boolean =>
  (event.target === undefined || mayReference(event.target, audience)) &&
  (event.target?.parent === undefined || mayReference(event.target.parent, audience));

/** Une capture ne nomme que ce que l'acteur peut lire : les autres cibles visibles sont retirées. */
const withAudiencedProps = (event: SocialEventV2Parsed, audience: Audience): SocialEventV2Parsed =>
  'visibleTargets' in event && Array.isArray(event.visibleTargets)
    ? { ...event, visibleTargets: event.visibleTargets.filter((ref) => mayReference(ref, audience)) }
    : event;

const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  'eventId', 'occurredAt', 'target', 'listing', 'prism', 'type', 'action', 'surface', 'searchId', 'listingSessionId',
  'impressionEventId', 'mutationId',
]);

/** Les propriétés propres au type — sans l'enveloppe, sans les identifiants qui relient. */
const propsOf = (event: SocialEventV2Parsed): Record<string, unknown> =>
  compact(Object.fromEntries(Object.entries(event).filter(([key]) => !ENVELOPE_KEYS.has(key))));

/**
 * Les identifiants qui RELIENT cet événement à une autre ligne portant un
 * compte — l'impression mesurée (sa clé est celle de `PostImpression.eventKey`)
 * et la mutation REST (une réaction, un commentaire). Rangés seulement si
 * l'événement est rattaché au compte : sur une ligne sans acteur, ils
 * reconstitueraient l'auteur par jointure (revue de conformité O1).
 */
const linksOf = (event: SocialEventV2Parsed, attributed: boolean): Record<string, unknown> => {
  if (!attributed) return {};
  return compact({
    impressionEventKey: 'impressionEventId' in event && typeof event.impressionEventId === 'string'
      ? eventKeyOf(event.impressionEventId)
      : undefined,
    mutationId: 'mutationId' in event && typeof event.mutationId === 'string' ? event.mutationId : undefined,
  });
};

/** Ce qu'un `searchId` laisse ranger : rien hors consentement (O3). */
const searchFieldsOf = (event: SocialEventV2Parsed, attributed: boolean): Record<string, unknown> => {
  if (!attributed || event.type !== 'discovery' || !('searchId' in event) || typeof event.searchId !== 'string') return {};
  const read = readSearchId(event.searchId);
  return read ? { searchNonce: read.nonce, queryFingerprint: read.fingerprint } : {};
};

const sampleRateOf = (event: SocialEventV2Parsed, context: ParsedSocialEventsContext): number =>
  context.sampling?.[event.type] ?? 1;

function documentOf(params: {
  readonly read: V2EventRead;
  readonly actor: V2Actor;
  readonly standing: AnalyticsStanding;
  readonly context: ParsedSocialEventsContext;
  readonly receivedAt: Date;
  readonly audience: Audience;
}): ExtendedJsonDocument {
  const event = withAudiencedProps(params.read.event, params.audience);
  const { derivedAt, clockSkewed } = params.read.clock;
  const attributed = params.actor.kind === 'user' && isAttributable(event.type, event.action, params.standing);
  const target = event.target;
  const parentOfComment = target?.kind === 'comment' ? params.audience.commentPost.get(target.id) : undefined;
  const parent = target?.parent ?? (parentOfComment ? { kind: 'post', id: parentOfComment } : undefined);
  const listingSessionId = 'listingSessionId' in event && typeof event.listingSessionId === 'string'
    ? event.listingSessionId
    : undefined;
  const listingInput = event.listing || listingSessionId
    ? { ...event.listing, ...(listingSessionId ? { listingSessionId } : {}) }
    : undefined;
  const effective: AnalyticsStanding = attributed ? 'granted' : params.standing === 'granted' ? 'not_granted' : params.standing;

  return compact({
    eventKey: event.eventId ? eventKeyOf(event.eventId) : undefined,
    type: event.type,
    action: event.action,
    day: utcDayOf(derivedAt),
    derivedAt: ejsonDate(derivedAt),
    occurredAt: event.occurredAt ? ejsonDate(new Date(event.occurredAt)) : undefined,
    receivedAt: ejsonDate(params.receivedAt),
    clockSkewed: clockSkewed ? true : undefined,
    actorKind: attributed ? 'user' : 'none',
    userId: attributed && params.actor.kind === 'user' ? ejsonObjectId(params.actor.userId) : undefined,
    ...storedContextOf(params.context, effective),
    targetKind: target?.kind,
    targetId: target?.id,
    parentKind: parent?.kind,
    parentId: parent?.id,
    surface: event.surface,
    listing: storedListingOf(listingInput, effective),
    prism: keepsPrism(params.standing) ? event.prism : undefined,
    props: { ...propsOf(event), ...linksOf(event, attributed), ...searchFieldsOf(event, attributed) },
    sampleRate: sampleRateOf(event, params.context),
    expiresAt: ejsonDate(new Date(params.receivedAt.getTime() + contentEventRetentionMs(event.type))),
  });
}

export async function ingestSocialEventsV2(
  prisma: V2Prisma,
  reads: readonly V2EventRead[],
  params: {
    readonly actor: V2Actor;
    readonly standing: AnalyticsStanding;
    readonly context: ParsedSocialEventsContext;
    readonly receivedAt: Date;
  },
): Promise<V2Outcome> {
  if (reads.length === 0) return { recorded: 0, rejected: 0, withheld: 0 };
  // Un compte qui a REFUSÉ l'analyse ne laisse AUCUNE ligne de comportement :
  // ni acteur, ni ligne sans acteur. Seuls les compteurs du comptage bougent.
  if (params.standing === 'denied') return { recorded: 0, rejected: 0, withheld: reads.length };

  const typed = params.actor.kind === 'anonymous'
    ? reads.filter((read) => ANONYMOUS_TYPES.has(read.event.type))
    : reads;
  const audience = await readAudience(prisma, typed.map((read) => read.event), params.actor);
  const admitted = typed.filter((read) => isAdmissible(read.event, audience));
  const rejected = reads.length - admitted.length;
  if (admitted.length === 0) return { recorded: 0, rejected, withheld: 0 };

  const documents = admitted.map((read) => documentOf({ ...params, read, audience }));
  const outcome = await insertDocuments(prisma, CONTENT_EVENT_COLLECTION, documents);
  return { recorded: outcome.inserted.size + outcome.duplicates.size, rejected, withheld: 0 };
}
