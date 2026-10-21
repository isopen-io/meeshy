import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { consumablePostAuthors } from '../posts/postConsumptionGate';
import { readServableToAnonymous } from '../posts/anonymousPostGate';
import {
  creditAnonymousImpressions,
  creditAnonymousOpens,
  creditAnonymousViews,
  type ServableMap,
} from '../../services/posts/anonymousReach';
import { creditOpens } from '../../services/posts/contentOpens';
import {
  admitAnonymousEvents,
  anonymousReaderKeyOf,
  resolveAnonymousReader,
  ANONYMOUS_READER_BUDGET,
} from './anonymousReader';
import { incrementPostCounters } from '../../services/posts/postCounters';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { safeBroadcast } from '../../socketio/serverEmit';
import { sendSuccess, sendBadRequest, sendForbidden, sendInternalError, sendError } from '../../utils/response';
import {
  SOCIAL_EVENTS_SCHEMA_VERSION,
  SOCIAL_EVENTS_VERSION_HEADER,
} from '@meeshy/shared/types/social-events-v2';
import { readSocialEventsBody, type EventClock } from './eventsEnvelope';
import type { ParsedSocialEventsContext } from './eventsV2Schemas';
import { acceptedEventTypes, socialEventsV2Settings } from '../../services/social/contentEvents';
import { claimCountingReceipts, releaseCountingReceipts, type CountingReceipts } from '../../services/social/countingReplays';
import { readAnalyticsStanding, type AnalyticsStanding } from '../../services/social/eventPrivacy';
import { impressionRowOf, insertKeyedImpressions, removeKeyedImpressions } from '../../services/social/impressionRows';
import { ingestSocialEventsV2 } from '../../services/social/socialEventsV2';
import {
  authorImpressionsOnce,
  consumeImpliedImpressions,
  impressionsCarriedByViews,
} from '../../services/social/viewImpressions';
export { SOCIAL_EVENTS_SUCCESSEUR, socialEventsDeprecation } from './deprecation';
import {
  SOCIAL_EVENTS_BATCH_CAP,
  type SocialEvent,
} from './eventsSchemas';
export {
  VIEW_ALIAS_SCHEMA,
  SOCIAL_EVENTS_BATCH_CAP,
  IMPRESSION_SOURCES,
  SocialEventSchema,
  SocialEventsBatchSchema,
  type SocialEvent,
  type SocialEventsBatch,
} from './eventsSchemas';

/**
 * `POST /social/events` — le point d'ingestion UNIQUE de la télémétrie de
 * lecture (#4150).
 *
 * ## Ce que six portes coûtaient
 *
 * Six adresses disaient « ce contenu a été vu » — `POST /posts/:id/view`,
 * `/impression`, `/impressions/batch`, `/engagement/batch`, `/downloads` et
 * `/anonymous-view` — pour trois sémantiques, quatre schémas de corps et
 * quatre qualités de service. Elles n'étaient pas seulement redondantes :
 * elles étaient les moins gardées du module, et chacune l'était DIFFÉREMMENT,
 * ce qui est la forme la plus coûteuse du doublon — un correctif posé sur
 * l'une ne se propage à aucune autre.
 *
 * ## Les trois propriétés que cette porte tient, et qu'aucune des six ne
 * tenait ensemble
 *
 * 1. **L'audience filtre DANS la requête**, en UNE passe, AVANT la moindre
 *    écriture — {@link consumablePostAuthors} pour un compte,
 *    {@link readServableToAnonymous} pour un visiteur (la garde de LECTURE
 *    anonyme, #10483 : on ne compte jamais ce qu'un anonyme ne peut pas lire).
 *    Ce qui n'y survit pas est COMPTÉ (`rejected`), jamais écrit.
 * 2. **Aucun oracle d'existence.** Un post inexistant, un post supprimé, un
 *    post hors audience et un identifiant malformé sortent tous par la même
 *    porte : ils ne sont pas dans l'ensemble admis, et la réponse ne dit rien
 *    de plus que le décompte. La route unitaire d'impression portait
 *    exactement ce défaut — `update` levait P2025 (500) sur un id inconnu là
 *    où `updateMany` ne levait pas, donc la FORME de la réponse révélait
 *    l'existence du post à qui n'avait aucun droit dessus.
 * 3. **Aucun `(request.body as any)`.** Le corps est une union DISCRIMINÉE sur
 *    `type` : ajouter une branche est un acte de type, pas un `if` de plus, et
 *    `durationMs` est borné à la FRONTIÈRE — une borne posée chez l'appelé ne
 *    vaut que pour CET appelé.
 *
 * ## Pourquoi les effets restent attachés à leur TYPE
 *
 * Fusionner six portes en une ne doit pas fusionner leurs EFFETS. Un `view`
 * marque les notifications du post comme lues à sa première occurrence et
 * diffuse `story:viewed` à l'auteur ; une `impression` ne fait ni l'un ni
 * l'autre. Le dépôt a déjà payé qu'« un double PARTIEL perd en silence tout ce
 * que l'original gagne » : {@link applyViews} porte les deux effets, et son
 * témoin les mesure UN PAR UN.
 *
 * ## Ce que cette porte NE fait PAS
 *
 * Elle ne retire aucune des six adresses (critère 10 : le client Kotlin n'a pas
 * été inventorié) et ne bascule aucun client (critère 9). Les six restent
 * montées, DÉLÉGUANT à `ingestSocialEvents` — sans réimplémentation parallèle —
 * et annoncent leur sursis par les trois en-têtes du site unique
 * (`utils/deprecation.ts`).
 */


/**
 * QUI ingère. Les deux formes sont mutuellement exclusives et portent des
 * droits différents — un visiteur ne compte que ce qu'il peut lire, et ne
 * produit que des vues et des impressions. Il est désigné par sa CLÉ DE
 * LECTEUR (`readerKeyOf`, HMAC), jamais par la valeur de X-Session-Token.
 */
/**
 * Les types dont la MESURE rangée dépend du statut d'analyse du compte (#10501,
 * #10772, #10785) : la mesure d'une impression (une vue peut porter la sienne),
 * la trace d'une session de lecture. Le lecteur, lui, est rangé quel que soit le statut.
 */
const STANDING_TYPES: ReadonlySet<SocialEvent['type']> = new Set(['impression', 'view', 'dwell', 'dwell-start']);

export type SocialEventsActor =
  | { readonly kind: 'user'; readonly userId: string; readonly username: string }
  | { readonly kind: 'anonymous'; readonly readerKey: string };

/**
 * Le contrat de la porte : ce qui a été écrit, ce qui a été écarté.
 *
 * `legacy` n'est LU par personne sur `POST /social/events` — il n'existe que
 * pour les six alias, qui servent encore leur forme historique (`{ recorded: N
 * médias }` pour les téléchargements, `{ counted: bool }` pour la vue anonyme).
 * Les faire répondre autrement casserait les clients que le critère 9 confie à
 * leurs propres lots.
 */
export type SocialEventsOutcome = {
  readonly recorded: number;
  readonly rejected: number;
  readonly legacy: {
    readonly mediaRecorded: number;
    readonly anonymousCounted: boolean;
  };
};

/**
 * Ce que la porte v2 sait du lot en plus des événements (#10500) : le
 * contexte, la situation de consentement, l'heure corrigée de chaque
 * événement. Les six alias n'en passent aucun — un ancien chemin compte
 * exactement comme avant.
 */
export type SocialEventsIngestOptions = {
  readonly context?: ParsedSocialEventsContext;
  readonly standing?: AnalyticsStanding;
  readonly clocks?: ReadonlyMap<SocialEvent, EventClock>;
  readonly receivedAt?: Date;
};

export type SocialEventsDeps = {
  readonly fastify: FastifyInstance;
  readonly prisma: PrismaClient;
  readonly postService: Pick<
    PostService,
    'recordView' | 'getPostById' | 'recordMediaDownloads' | 'recordEngagementBatch'
  >;
};

/**
 * Les VUES admises, avec leurs DEUX effets de bord.
 *
 * Ils sont ici, et pas dans un `map` anonyme du répartiteur, parce que c'est
 * eux que la fusion risquait de perdre : ils ne se déduisent d'aucun champ du
 * lot, ils sont attachés au TYPE `view` et à lui seul.
 */
async function applyViews(
  deps: SocialEventsDeps,
  events: readonly Extract<SocialEvent, { type: 'view' }>[],
  actor: Extract<SocialEventsActor, { kind: 'user' }>,
  counted: (events: readonly SocialEvent[]) => void = () => undefined,
  alreadyShown: ReadonlySet<string> = new Set(),
): Promise<number> {
  if (events.length === 0) return 0;

  let recorded = 0;
  for (const event of events) {
    const isNewView = await deps.postService.recordView(event.postId, actor.userId, event.durationMs, {
      surface: event.surface,
      provenance: event.provenance,
      origin: event.origin,
      impliesImpression: !event.impression && !alreadyShown.has(event.postId),
    });
    recorded += 1;
    counted([event]);

    // Contenu consommé (première vue réelle) → les notifications liées à ce
    // post ne doivent plus apparaître comme non lues. Borné à la PREMIÈRE vue
    // pour ne pas rejouer la requête à chaque impression répétée du feed.
    // Fire-and-forget : ne bloque pas la réponse, émet `notification:counts`.
    if (isNewView) {
      deps.fastify.notificationService
        ?.markPostNotificationsAsRead(actor.userId, event.postId)
        .catch((err: unknown) =>
          enhancedLogger.warn('[POST /social/events]: mark post notifications as read failed', { err }));
    }

    await broadcastStoryViewed(deps, event.postId, actor);
  }
  return recorded;
}

/**
 * Diffuse `story:viewed` à l'auteur — l'enrichissement OPTIONNEL de la vue.
 *
 * Sous `try/catch` : `getPostById` est la lecture LOURDE du détail (réactions,
 * favoris, comptage de reposts, résolution de référence), appelée ici pour
 * TROIS champs. La vue vient d'être enregistrée DURABLEMENT — un échec de cet
 * enrichissement ne doit jamais faire échouer la réponse, sans quoi le client
 * verrait un 500 permanent pour une vue pourtant déjà comptée.
 */
async function broadcastStoryViewed(
  deps: SocialEventsDeps,
  targetId: string,
  actor: Extract<SocialEventsActor, { kind: 'user' }>,
): Promise<void> {
  const socialEvents = deps.fastify.socialEvents;
  if (!socialEvents) return;

  try {
    // Le viewer est PASSÉ : sans lui, `getPostById` applique le filtre
    // PUBLIC-seul et rend `null` pour une story FRIENDS (le cas courant) — la
    // diffusion ne partait alors jamais alors que la vue, elle, était bien
    // enregistrée. Ces deux-là ne peuvent plus diverger.
    const post = await deps.postService.getPostById(targetId, actor.userId);
    if (!post || post.type !== 'STORY' || post.authorId === actor.userId) return;

    safeBroadcast('story:viewed', () => {
      socialEvents.broadcastStoryViewed({
        storyId: targetId,
        viewerId: actor.userId,
        viewerUsername: actor.username,
        viewCount: post.viewCount,
      }, post.authorId);
    });
  } catch (err) {
    enhancedLogger.warn(
      '[POST /social/events]: story-viewed broadcast enrichment failed — view already recorded, not surfacing as an error',
      { err },
    );
  }
}

/**
 * Les IMPRESSIONS admises — une ligne d'historique par OCCURRENCE, et le
 * compteur qui va avec.
 *
 * Le même post peut légitimement revenir plusieurs fois dans un lot
 * (aller-retour de défilement). `createMany` insère bien une ligne par
 * occurrence, mais `updateMany({ id: { in: [...] } })` n'incrémente chaque post
 * qu'UNE fois — le `in` est dédupliqué côté base. On regroupe donc par nombre
 * d'occurrences : un `updateMany` par valeur d'incrément distincte (en pratique
 * 1 à 3), et non un par post.
 */
async function applyImpressions(
  deps: SocialEventsDeps,
  all: readonly Extract<SocialEvent, { type: 'impression' }>[],
  userId: string,
  options: SocialEventsIngestOptions,
  ownPostIds: ReadonlySet<string>,
): Promise<number> {
  if (all.length === 0) return 0;

  // #11037 — l'auteur ne compte qu'une fois par contenu, et n'ouvre rien.
  const counted = await authorImpressionsOnce(deps.prisma, userId, all, ownPostIds);

  const receivedAt = options.receivedAt ?? new Date();
  const rowOf = (event: Extract<SocialEvent, { type: 'impression' }>) => impressionRowOf({
    event,
    userId,
    standing: options.standing ?? 'not_granted',
    context: options.context ?? {},
    derivedAt: event.occurredAt ? options.clocks?.get(event)?.derivedAt : undefined,
    receivedAt,
  });

  // Une impression qui porte un `eventId` s'écrit par l'`insert` brut : sa
  // ligne porte la clé, et un doublon (rejeu) ne crédite aucun compteur.
  const plain = counted.filter((event) => !event.eventId);
  const keyed = counted.filter((event) => event.eventId);
  if (plain.length > 0) await deps.prisma.postImpression.createMany({ data: plain.map(rowOf) });
  const keyedRows = keyed.map(rowOf);
  const { inserted } = await insertKeyedImpressions(deps.prisma, keyedRows);
  const events = [...plain, ...keyed.filter((_, index) => inserted.has(index))];
  const written = keyedRows.filter((_, index) => inserted.has(index));

  // #10732 — une vraie impression prend la place de celle qu'une vue sans clé avait déduite.
  const remplacees = await consumeImpliedImpressions(deps.prisma, userId, events.map((event) => event.postId));
  const impressions = new Map([...compterParId(events.map((event) => event.postId))]
    .map(([id, n]) => [id, n - (remplacees.get(id) ?? 0)] as const)
    .filter(([, n]) => n > 0));
  const ouvertures = compterParId(events
    .filter((event) => isDetailOpen(event) && !ownPostIds.has(event.postId))
    .map((event) => event.postId));

  const racines = await resoudreRacinesDeRepost(deps.prisma, [...impressions.keys()]);
  const creditsRacine = compterParId(
    events.map((event) => racines.get(event.postId)).filter((id): id is string => id !== undefined),
  );

  // La ligne à clé est écrite AVANT ses compteurs : si eux échouent, elle est
  // retirée, sinon le renvoi du client serait un doublon et rien ne compterait.
  await Promise.all([
    ...groupesParIncrement(impressions).map(([increment, ids]) =>
      incrementPostCounters(deps.prisma, ids, { impressionCount: { increment } })),
    ...groupesParIncrement(ouvertures).map(([increment, ids]) =>
      incrementPostCounters(deps.prisma, ids, { postOpenCount: { increment } })),
    ...groupesParIncrement(creditsRacine).map(([increment, ids]) =>
      incrementPostCounters(deps.prisma, ids, { impressionCount: { increment } }, { liveOnly: true })),
  ]).catch(async (error: unknown) => {
    await removeKeyedImpressions(deps.prisma, written);
    throw error;
  });

  return all.length;
}

/**
 * Les ENGAGEMENTS D'OUVERTURE admis (#10483) — `openCountByOrigin` par origine,
 * aucune vue. L'auteur qui tape son propre contenu n'est pas compté : la même
 * règle que la vue.
 */
async function applyOpens(
  deps: SocialEventsDeps,
  events: readonly Extract<SocialEvent, { type: 'open' }>[],
  userId: string,
): Promise<number> {
  if (events.length === 0) return 0;
  const auteurs = await deps.prisma.post.findMany({
    where: { id: { in: [...new Set(events.map((event) => event.postId))] } },
    select: { id: true, authorId: true },
    take: SOCIAL_EVENTS_BATCH_CAP,
  });
  const siens = new Set(auteurs.filter((post: { authorId: string }) => post.authorId === userId)
    .map((post: { id: string }) => post.id));
  const comptees = events.filter((event) => !siens.has(event.postId));
  await creditOpens(deps.prisma, comptees.map((event) => ({ postId: event.postId, origin: event.origin })));
  return comptees.length;
}

/**
 * Les sources qui OUVRENT le détail d'un post : l'ouvrir depuis le fil
 * (`detail`), depuis une notification ou depuis un lien partagé est la même
 * ouverture — le client dit seulement d'où il venait (#10483).
 */
const DETAIL_OPEN_SOURCES: ReadonlySet<string> = new Set(['detail', 'notification', 'shared_link']);

/**
 * Ouvrir le Détail d'un post est à la fois une impression ET une ouverture,
 * comptée immédiatement — chaque ouverture compte, sans seuil. Une source de
 * détail rendue dans un AUTRE écran n'ouvre rien : une citation dans une bulle
 * (`shared_link` + `citation`) est un listage. Sans écran déclaré (ancien
 * client), la source fait foi.
 */
const isDetailOpen = (event: Extract<SocialEvent, { type: 'impression' }>): boolean =>
  DETAIL_OPEN_SOURCES.has(event.source) && (event.surface === undefined || event.surface === 'detail');

/**
 * La RACINE de chaque repost du lot, en UNE requête — jamais une par post.
 *
 * Un repost doit créditer son original du même `impressionCount` en plus de son
 * propre compteur. Le crédit de la racine est INCONDITIONNEL : elle n'est
 * atteignable que par un repost, et reposter exige déjà de voir la racine.
 */
async function resoudreRacinesDeRepost(
  prisma: PrismaClient,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();
  const reposts = await prisma.post.findMany({
    where: { id: { in: [...ids] }, repostOfId: { not: null } },
    select: { id: true, repostOfId: true, originalRepostOfId: true },
    take: SOCIAL_EVENTS_BATCH_CAP,
  });

  type Ligne = { id: string; repostOfId: string | null; originalRepostOfId: string | null };
  return new Map(
    reposts
      .map((p: Ligne) => [p.id, p.originalRepostOfId ?? p.repostOfId] as const)
      .filter((entree): entree is readonly [string, string] =>
        entree[1] !== null && entree[1] !== entree[0]),
  );
}

const compterParId = (ids: readonly string[]): ReadonlyMap<string, number> =>
  ids.reduce<Map<string, number>>((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map());

const groupesParIncrement = (
  comptes: ReadonlyMap<string, number>,
): readonly (readonly [number, string[]])[] =>
  [...[...comptes].reduce<Map<number, string[]>>(
    (acc, [id, n]) => acc.set(n, [...(acc.get(n) ?? []), id]),
    new Map(),
  )];

/**
 * Ingère un lot d'événements de télémétrie — le CŒUR que la porte canonique et
 * les six alias partagent.
 *
 * L'ordre des trois temps porte tout le sens :
 *  1. l'AUDIENCE, en une passe, avant toute écriture ;
 *  2. la PARTITION — ce qui est admis, ce qui est compté comme rejeté ;
 *  3. les EFFETS, groupés par TYPE, chacun avec ce qui lui est propre.
 */
export async function ingestSocialEvents(
  deps: SocialEventsDeps,
  events: readonly SocialEvent[],
  actor: SocialEventsActor,
  options: SocialEventsIngestOptions = {},
): Promise<SocialEventsOutcome> {
  const vide: SocialEventsOutcome['legacy'] = { mediaRecorded: 0, anonymousCounted: false };
  if (events.length === 0) return { recorded: 0, rejected: 0, legacy: vide };

  if (actor.kind === 'anonymous') return ingestAnonymous(deps, events, actor, options);

  const authors = await consumablePostAuthors(deps.prisma, events.map((e) => e.postId), actor.userId);
  const allowed = new Set(authors.keys());
  const ownPostIds = new Set([...authors].filter(([, authorId]) => authorId === actor.userId).map(([id]) => id));

  const audiences = events.filter((event) => allowed.has(event.postId));
  const rejected = events.length - audiences.length;
  if (audiences.length === 0) return { recorded: 0, rejected, legacy: vide };

  const recus = await rejeuxDe(deps, audiences, ['view', 'open'], options);
  const rejoues = recus.replays;
  const admis = audiences.filter((event) => !rejoues.has(event));

  const parType = <T extends SocialEvent['type']>(type: T) =>
    admis.filter((event): event is Extract<SocialEvent, { type: T }> => event.type === type);

  // #10772, #10785 — la MESURE qu'une ligne de lecture garde dépend du statut d'analyse
  // que la PASSERELLE établit (le client fait foi pour refuser, elle pour
  // accorder). Les alias historiques ne le passent pas : il se lit ici.
  const standing = options.standing ?? (admis.some((event) => STANDING_TYPES.has(event.type))
    ? await readAnalyticsStanding(deps.prisma as never, actor.userId, options.context?.consent)
    : 'not_granted');
  const situated = { ...options, standing };

  return orReleaseReceipts(deps, recus, async (counted) => {
    // #10732 — une vue implique son impression : sous sa clé si elle la porte
    // (écrite avec les impressions ci-dessous), déduite par `recordView` sinon —
    // jamais pour un post dont le lot porte déjà l'impression.
    const montres = new Set(parType('impression').map((event) => event.postId));
    const vues = await applyViews(deps, parType('view'), actor, counted, montres);

    const [ouvertures, impressions, telechargements, sessions] = await Promise.all([
      applyOpens(deps, parType('open'), actor.userId).then((n) => { counted(parType('open')); return n; }),
      applyImpressions(deps, [...parType('impression'), ...impressionsCarriedByViews(parType('view'))], actor.userId, situated, ownPostIds),
      applyDownloads(deps, parType('download'), actor.userId),
      applyDwell(deps, [...parType('dwell'), ...parType('dwell-start')], actor.userId, standing),
    ]);

    return {
      recorded: vues + ouvertures + impressions + telechargements.events + sessions + rejoues.size,
      rejected,
      legacy: { mediaRecorded: telechargements.media, anonymousCounted: false },
    };
  });
}

/**
 * Le comptage ne perd rien (#10553) : si un effet échoue après l'écriture des
 * reçus, ils sont RENDUS avant que l'erreur ne remonte — le renvoi du client,
 * au même `eventId`, comptera. Seuls les reçus des événements dont l'effet
 * n'est PAS parti sont rendus : ce qui a compté ne recompte pas.
 */
async function orReleaseReceipts<T>(
  deps: SocialEventsDeps,
  recus: CountingReceipts<SocialEvent>,
  effects: (counted: (events: readonly SocialEvent[]) => void) => Promise<T>,
): Promise<T> {
  const settled = new Set<SocialEvent>();
  try {
    return await effects((events) => events.forEach((event) => settled.add(event)));
  } catch (error) {
    const lost = [...recus.claimed].flatMap(([event, key]) => (settled.has(event) ? [] : [key]));
    await releaseCountingReceipts(deps.prisma, lost);
    throw error;
  }
}

/**
 * Les REJEUX d'un lot (#10500) : les événements des `types` donnés qui portent
 * un `eventId` déjà reçu. Leurs reçus s'écrivent en UNE commande, AVANT tout
 * effet ; un rejeu est compté `recorded` sans rien recompter.
 */
async function rejeuxDe(
  deps: SocialEventsDeps,
  events: readonly SocialEvent[],
  types: readonly SocialEvent['type'][],
  options: SocialEventsIngestOptions,
): Promise<CountingReceipts<SocialEvent>> {
  const receivedAt = options.receivedAt ?? new Date();
  const candidats = events.flatMap((event) => types.includes(event.type) && event.eventId
    ? [{ item: event, eventId: event.eventId, type: event.type }]
    : []);
  return claimCountingReceipts(deps.prisma, candidats, receivedAt);
}

/**
 * Le lot d'un lecteur SANS compte (#10483) — même ordre en trois temps.
 *
 *  1. l'AUDIENCE : `readServableToAnonymous`, la garde de LECTURE anonyme, en
 *     une passe ; elle rend aussi la racine de chaque repost ;
 *  2. la PARTITION, comme pour un compte ;
 *  3. les EFFETS : chaque vue et chaque impression comptent (règle du porteur
 *     2026-10-13), la première vue d'un lecteur monte en plus les vues
 *     uniques — sans aucune ligne portant une identité (`anonymousReach.ts`).
 *
 * `recorded` dit ce qui a été ÉCRIT : les vues et les impressions comptées.
 */
async function ingestAnonymous(
  deps: SocialEventsDeps,
  events: readonly SocialEvent[],
  actor: Extract<SocialEventsActor, { kind: 'anonymous' }>,
  options: SocialEventsIngestOptions,
): Promise<SocialEventsOutcome> {
  const servable: ServableMap = await readServableToAnonymous(
    deps.prisma as never,
    events.map((event) => event.postId),
  );
  const audiences = events.filter((event) => servable.has(event.postId));
  const rejected = events.length - audiences.length;
  const vide: SocialEventsOutcome['legacy'] = { mediaRecorded: 0, anonymousCounted: false };
  if (audiences.length === 0) return { recorded: 0, rejected, legacy: vide };

  const recus = await rejeuxDe(deps, audiences, ['view', 'open', 'impression'], options);
  const rejoues = recus.replays;
  const admis = audiences.filter((event) => !rejoues.has(event));

  const ofType = (type: SocialEvent['type']) => admis.filter((event) => event.type === type);

  return orReleaseReceipts(deps, recus, async (counted) => {
  const vues = await creditAnonymousViews(deps.prisma, {
    readerKey: actor.readerKey,
    views: admis.flatMap((event) => event.type === 'view'
      ? [{
        postId: event.postId,
        durationMs: event.durationMs,
        surface: event.surface,
        provenance: event.provenance,
        origin: event.origin,
      }]
      : []),
    servable,
  });
  counted(ofType('view'));
  const ouvertures = await creditAnonymousOpens(deps.prisma, {
    opens: admis.flatMap((event) => event.type === 'open' ? [{ postId: event.postId, origin: event.origin }] : []),
    servable,
  });
  counted(ofType('open'));
  const impressions = await creditAnonymousImpressions(deps.prisma, {
    postIds: admis.flatMap((event) => event.type === 'impression' ? [event.postId] : []),
    servable,
  });
  counted(ofType('impression'));

  return {
    recorded: vues + ouvertures + impressions + rejoues.size,
    rejected,
    legacy: { mediaRecorded: 0, anonymousCounted: vues > 0 },
  };
  });
}

/**
 * Les TÉLÉCHARGEMENTS admis.
 *
 * `recorded` compte les ÉVÉNEMENTS (le contrat de cette porte), `media` compte
 * les fichiers — c'est ce second nombre que l'alias `POST /posts/:id/downloads`
 * sert encore, et les confondre changerait sa réponse sous ses clients.
 */
async function applyDownloads(
  deps: SocialEventsDeps,
  events: readonly Extract<SocialEvent, { type: 'download' }>[],
  userId: string,
): Promise<{ readonly events: number; readonly media: number }> {
  if (events.length === 0) return { events: 0, media: 0 };

  const resultats = await Promise.all(events.map((event) =>
    deps.postService.recordMediaDownloads(event.postId, userId, {
      mediaIds: event.mediaIds,
      surface: event.surface,
    })));

  const servis = resultats.filter((r): r is { recorded: number } => r !== null);
  return {
    events: servis.length,
    media: servis.reduce((total, r) => total + r.recorded, 0),
  };
}

/**
 * Les SESSIONS d'engagement admises — en UN appel de lot.
 *
 * `recordEngagementBatch` est idempotent sur `sessionId` (upsert) : rejouer un
 * ACK perdu est un no-op. L'identité vient du contexte d'authentification, pas
 * du `userId` que le client déclare.
 */
async function applyDwell(
  deps: SocialEventsDeps,
  events: readonly Extract<SocialEvent, { type: 'dwell' | 'dwell-start' }>[],
  userId: string,
  standing: AnalyticsStanding,
): Promise<number> {
  if (events.length === 0) return 0;
  const sessions = events.map(({ type: _type, ...session }) => session);
  return deps.postService.recordEngagementBatch(
    sessions as Parameters<PostService['recordEngagementBatch']>[0],
    userId,
    standing,
  );
}

/**
 * La clé du seau de débit — exportée parce que c'est ELLE que le témoin du
 * critère 7.3 exerce, pas la fabrique qui l'enveloppe.
 *
 * - Un COMPTE : son id. 30/min couvre le lot entier — une clé par `(compte,
 *   post)` rendrait le plafond proportionnel au nombre de posts observés.
 * - Un ANONYME (#10483) : sa CLÉ DE LECTEUR (`readerKeyOf`), jamais la valeur
 *   brute du jeton ni l'adresse. Les budgets en ÉVÉNEMENTS (par lecteur, et
 *   un plafond élevé par empreinte d'adresse) sont à part
 *   ({@link admitAnonymousEvents}).
 *
 * La clé se lit sur `registeredUser`, jamais sur `authContext.userId` : le
 * contexte NON authentifié du middleware porte `userId: 'anonymous'`, et tous
 * les visiteurs partageaient ainsi UN seau de 30/min.
 */
export function socialEventsRateLimitKey(request: FastifyRequest): string {
  const userId = (request as UnifiedAuthRequest).authContext?.registeredUser?.id;
  if (userId) return `social:events:${userId}`;
  const readerKey = anonymousReaderKeyOf(request);
  return readerKey ? `social:events:reader:${readerKey}` : 'social:events:anonyme';
}

/**
 * Le débit d'un COMPTE sur la porte unique (#10483). Les six anciennes portes
 * avaient chacune leur seau ; iOS et le web y versent désormais TOUT (impressions
 * de chaque liste, vues, ouvertures, sessions de lecture) : 30/min faisait perdre
 * les événements « tirés et oubliés » (ouverture de détail, vue d'une humeur)
 * dès qu'un fil défilait vite.
 */
export const ACCOUNT_SOCIAL_EVENTS_BUDGET = 120;

/**
 * Le débit d'un lecteur anonyme en REQUÊTES : la somme de ses deux seaux
 * d'événements (comptage et v2), pour que soixante lots de défilement ne
 * ferment pas la porte à la vue qui suit.
 */
export const ANONYMOUS_REQUEST_BUDGET = 2 * ANONYMOUS_READER_BUDGET;

/**
 * Débits du compte (ACCOUNT_SOCIAL_EVENTS_BUDGET/min) et du lecteur anonyme (ANONYMOUS_REQUEST_BUDGET/min par clé de lecteur),
 * sur la MÊME route ; `max` est une FONCTION pour cela.
 *
 *  - `hook: 'preHandler'` — `config.rateLimit` s'applique par défaut à
 *    `onRequest`, AVANT que l'authentification ne pose `authContext` : la clé
 *    y verrait `undefined` et retomberait systématiquement sur le repli.
 *  - `skipOnError: false` — le limiteur global pose `skipOnError: true`, valeur
 *    GLOBALE fusionnée par `Object.assign` dans toute config qui ne la
 *    redéclare pas. Un Redis indisponible ouvrirait ce seau en grand : la panne
 *    du gardien deviendrait l'absence de garde.
 */
export const socialEventsRateLimit = {
  max: (request: FastifyRequest) =>
    ((request as UnifiedAuthRequest).authContext?.registeredUser ? ACCOUNT_SOCIAL_EVENTS_BUDGET : ANONYMOUS_REQUEST_BUDGET),
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: socialEventsRateLimitKey,
  errorResponseBuilder: () => ({
    success: false,
    error: 'Trop d’événements sociaux. Veuillez patienter.',
    statusCode: 429,
  }),
};

/**
 * Les types qu'un visiteur SANS COMPTE peut produire : une vue et une
 * impression (#10483), qui ne laissent que sa clé de lecteur et des compteurs.
 * Un téléchargement et une session d'engagement écrivent une ligne PORTANT UNE
 * IDENTITÉ (`userId`) — qu'un anonyme n'a pas. Refuser explicitement vaut mieux
 * que les ignorer en silence : un client qui les envoie a un défaut, et un
 * `rejected` muet le lui cacherait derrière un mot qui signifie « hors
 * audience ».
 */
export const TYPES_ANONYMES: ReadonlySet<SocialEvent['type']> = new Set(['view', 'open', 'impression']);

/** La réponse d'un lecteur anonyme qui a épuisé son débit. */
export const refuseAnonymousBudget = (reply: FastifyReply) =>
  sendError(reply, 429, 'Trop d’événements sociaux. Veuillez patienter.', { code: 'RATE_LIMITED' });

/**
 * Monte `POST /social/events` sur `fastify`.
 *
 * L'authentification est INJECTÉE plutôt que construite ici : la porte est
 * OPTIONNELLEMENT authentifiée (critère 4 — « la variante anonyme est la même
 * route »), et ses témoins doivent pouvoir exercer les deux acteurs sans
 * fabriquer de jeton. {@link socialEventsRoutes} en est le montage réel.
 */
export function registerSocialEventRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: unknown,
  postService: SocialEventsDeps['postService'] = new PostService(prisma, new MediaService()),
): void {
  const deps: SocialEventsDeps = { fastify, prisma, postService };

  fastify.post('/social/events', {
    preValidation: [optionalAuth as never],
    config: { rateLimit: socialEventsRateLimit },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const receivedAt = new Date();
      const lot = readSocialEventsBody(request.body, receivedAt);
      if (!lot.ok) {
        return sendBadRequest(reply, 'Invalid social events batch', { code: 'VALIDATION_ERROR' });
      }

      const acteur = await resolveActor(prisma, request);
      if (!acteur) {
        return sendBadRequest(reply, 'Missing or invalid session key', { code: 'VALIDATION_ERROR' });
      }

      if (acteur.kind === 'anonymous' && lot.counting.some(({ event }) => !TYPES_ANONYMES.has(event.type))) {
        return sendForbidden(reply, 'Authentication required for this event type', { code: 'FORBIDDEN' });
      }

      // L'interrupteur d'urgence : tous les types v2 deviennent `ignored`, sans écriture.
      const settings = socialEventsV2Settings();
      const v2 = settings.enabled ? lot.v2 : [];
      const ignored = lot.ignored + lot.v2.length - v2.length;
      const total = lot.counting.length + v2.length;

      // Deux seaux (`AnonymousBudgetScope`) : le défilement d'un visiteur ne fait jamais refuser ses vues.
      const [comptageAdmis, v2Quota] = acteur.kind === 'anonymous'
        ? await Promise.all([
          admitAnonymousEvents(fastify, request, acteur, lot.counting.length, 'counting'),
          admitAnonymousEvents(fastify, request, acteur, v2.length, 'v2'),
        ])
        : [lot.counting.length, v2.length];
      const admis = comptageAdmis + v2Quota;
      if (admis === 0 && total > 0) return refuseAnonymousBudget(reply);

      const comptage = lot.counting.slice(0, comptageAdmis);
      const v2Admis = v2.slice(0, v2Quota);
      // Le consentement ne se lit que si une écriture en dépend (une impression,
      // une vue qui en déduit une, une session de lecture, un événement v2).
      const consentCompte = v2Admis.length > 0 || comptage.some(({ event }) => STANDING_TYPES.has(event.type));
      const standing: AnalyticsStanding | undefined = acteur.kind === 'anonymous'
        ? 'anonymous'
        : consentCompte
          ? await readAnalyticsStanding(prisma as never, acteur.userId, lot.context.consent)
          : undefined;

      const comptes = await ingestSocialEvents(deps, comptage.map(({ event }) => event), acteur, {
        context: lot.context,
        standing,
        receivedAt,
        clocks: new Map(comptage.map(({ event, clock }) => [event, clock])),
      });
      const v2Comptes = await ingestSocialEventsV2(prisma as never, v2Admis, {
        actor: acteur.kind === 'user' ? { kind: 'user', userId: acteur.userId } : { kind: 'anonymous' },
        standing: standing ?? 'not_granted',
        context: lot.context,
        receivedAt,
      });

      reply.header(SOCIAL_EVENTS_VERSION_HEADER, String(SOCIAL_EVENTS_SCHEMA_VERSION));
      return sendSuccess(reply, {
        recorded: comptes.recorded + v2Comptes.recorded,
        rejected: comptes.rejected + v2Comptes.rejected + total - admis,
        ignored: ignored + v2Comptes.withheld,
        accepts: acceptedEventTypes(settings),
        sampling: settings.sampling,
      });
    } catch (error) {
      enhancedLogger.error('[POST /social/events]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}

/**
 * QUI appelle — un compte, un lecteur anonyme (invité de lien ou visiteur
 * porteur d'une clé visiteur), ou personne (`undefined`).
 *
 * Un visiteur SANS jeton est refusé : sans lui, il n'a aucune identité de seau,
 * et son débit retomberait sur l'unique repli — exactement le seau partagé que
 * ce lot ferme.
 */
export async function resolveActor(
  prisma: PrismaClient,
  request: FastifyRequest,
): Promise<SocialEventsActor | undefined> {
  const registeredUser = (request as UnifiedAuthRequest).authContext?.registeredUser;
  if (registeredUser) {
    return { kind: 'user', userId: registeredUser.id, username: registeredUser.username ?? '' };
  }
  return resolveAnonymousReader(prisma as never, request);
}

/**
 * Le montage réel — l'entrée de `ROUTE_TABLE_AFTER_POSTS`.
 *
 * `allowAnonymous: true` et `requireAuth: false` : cette porte sert les deux
 * acteurs, et c'est `resolveActor` qui tranche ensuite ce que chacun peut
 * produire.
 */
export async function socialEventsRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  const optionalAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: false,
    allowAnonymous: true,
  });
  registerSocialEventRoutes(fastify, prisma, optionalAuth);
}
