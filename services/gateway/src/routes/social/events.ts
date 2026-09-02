import { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { filterConsumablePostIds } from '../posts/postConsumptionGate';
import { buildViewerVisibilityFilter } from '../../services/posts/viewerAudience';
import { NOT_DELETED } from '../../services/posts/postIncludes';
import { EngagementSessionSchema, DOWNLOAD_SURFACES } from '../posts/types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { safeBroadcast } from '../../socketio/serverEmit';
import { sendSuccess, sendBadRequest, sendForbidden, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
export { SOCIAL_EVENTS_SUCCESSEUR, socialEventsDeprecation } from './deprecation';

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
 *    écriture — {@link filterConsumablePostIds} pour un compte,
 *    {@link filterPublicPostIds} pour un visiteur. Ce qui n'y survit pas est
 *    COMPTÉ (`rejected`), jamais écrit.
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
 * Le contrat de fil de l'alias `POST /posts/:postId/view`.
 *
 * Il vit ICI, avec la branche `view` du point d'ingestion dont il est la
 * PROJECTION historique, plutôt qu'au site de montage : c'est le même
 * événement, dit dans l'ancienne langue (`duration` au lieu de `durationMs`),
 * et les deux formes doivent bouger ensemble ou pas du tout.
 *
 * Annoté `FastifySchema` — et pas laissé à l'inférence. Un littéral exporté est
 * inféré au plus étroit, et le fournisseur de types de Fastify en dérive alors
 * les génériques de la route : `params` devient `{}` (le schéma JSON décrit des
 * propriétés, pas un type TypeScript), ce qui contredit le `Params: PostParams`
 * que le gestionnaire déclare. L'annotation dit ce que la valeur EST — un
 * schéma — plutôt que la forme exacte de son littéral.
 */
export const VIEW_ALIAS_SCHEMA: FastifySchema = {
    params: { type: 'object', required: ['postId'], properties: { postId: { type: 'string' } } },
    // `['object', 'null']` et non `'object'` : les clients appellent cette
    // route SANS corps (une vue n'a rien à dire de plus que son existence),
    // et Fastify remet alors `null`. Un schéma `object` nu refuserait ces
    // appels — la rigueur fermerait une porte qu'elle n'a pas à fermer.
    body: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            duration: {
              type: 'integer',
              minimum: 0,
              maximum: 300_000,
              description: 'Durée de consultation en millisecondes (plafond : 5 minutes)',
            },
          },
        },
      ],
    },
    // Le succès est DÉCLARÉ (#4531) : sans clé `response`, rien n'oblige la
    // charge servie à rester celle qu'on annonce, et le contrat de la route
    // n'existe que dans son handler. Une vue n'a qu'une chose à dire — elle
    // a été enregistrée.
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              viewed: { type: 'boolean', description: 'La vue a été enregistrée' },
            },
          },
        },
      },
      401: errorResponseSchema,
      500: errorResponseSchema,
    },
  };

/** Le plafond du lot — le critère 1 le pose à 200. */
export const SOCIAL_EVENTS_BATCH_CAP = 200;

/**
 * Plafond de `durationMs`, en millisecondes.
 *
 * Cinq minutes : la même borne que `PostService.recordView` applique déjà en
 * aval. Elle est REDITE ici parce qu'une borne d'aval n'est pas une borne — le
 * jour où un second consommateur lit ce champ, il hérite d'un entier libre.
 */
const DUREE_MAX_MS = 300_000;

/**
 * Surfaces qui peuvent produire une impression — le SITE UNIQUE de cette
 * énumération depuis que l'impression a rejoint ce point d'ingestion.
 *
 * Elle a déjà divergé une fois entre la route unitaire et son lot : iOS envoyait
 * `story` à chaque slide révélé, valeur absente des deux listes, donc 400
 * systématique et `impressionCount` figé à 0 sur toutes les stories malgré des
 * vues réelles. Toute nouvelle surface cliente s'ajoute ICI.
 */
export const IMPRESSION_SOURCES = [
  'feed',
  'profile',
  'search',
  'shared_link',
  'notification',
  'detail',
  'story',
  'status',
] as const;

const postId = z.string().regex(OBJECT_ID_REGEX);

const ViewEventSchema = z.object({
  type: z.literal('view'),
  postId,
  /**
   * `durationMs` et non `duration` : le nom dit son unité. L'ancienne route
   * lisait `duration` en `(request.body as any) ?? {}` — sans schéma, sans
   * borne, et sans que rien ne dise s'il s'agissait de secondes.
   */
  durationMs: z.number().int().min(0).max(DUREE_MAX_MS).optional(),
});

const ImpressionEventSchema = z.object({
  type: z.literal('impression'),
  postId,
  source: z.enum(IMPRESSION_SOURCES).default('feed'),
});

const DownloadEventSchema = z.object({
  type: z.literal('download'),
  postId,
  /// Bornes alignées sur `RecordDownloadsSchema` : un poste ne porte jamais 50
  /// médias, la borne est un garde-fou anti-abus, pas une limite produit.
  mediaIds: z.array(z.string()).min(1).max(50),
  surface: z.enum(DOWNLOAD_SURFACES).default('detail'),
});

/**
 * `dwell` REPREND `EngagementSessionSchema` au lieu de le redécrire.
 *
 * `POST /posts/engagement/batch` est la plus mûre des six portes — débit par
 * COMPTE, corps typé riche (dwell, watch, actions, échantillons) — et le
 * critère 1 demande de s'en inspirer, pas de la dégrader. L'extension n'ajoute
 * que le discriminant.
 */
const DwellEventSchema = EngagementSessionSchema.extend({ type: z.literal('dwell') });

export const SocialEventSchema = z.discriminatedUnion('type', [
  ViewEventSchema,
  ImpressionEventSchema,
  DownloadEventSchema,
  DwellEventSchema,
]);

export const SocialEventsBatchSchema = z.object({
  /**
   * PAS de `min(1)` : un lot VIDE est un succès à zéro enregistrement. Un
   * client qui n'a rien observé ne doit pas avoir à le vérifier avant
   * d'appeler — c'est le serveur qui sait répondre « rien à faire ».
   */
  events: z.array(SocialEventSchema).max(SOCIAL_EVENTS_BATCH_CAP).default([]),
});

export type SocialEvent = z.infer<typeof SocialEventSchema>;
export type SocialEventsBatch = z.infer<typeof SocialEventsBatchSchema>;

/**
 * QUI ingère. Les deux formes sont mutuellement exclusives et portent des
 * droits différents — un visiteur ne voit que le PUBLIC et ne peut produire
 * qu'une vue.
 */
export type SocialEventsActor =
  | { readonly kind: 'user'; readonly userId: string; readonly username: string }
  | { readonly kind: 'anonymous'; readonly sessionKey: string };

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

export type SocialEventsDeps = {
  readonly fastify: FastifyInstance;
  readonly prisma: PrismaClient;
  readonly postService: Pick<
    PostService,
    'recordView' | 'getPostById' | 'recordAnonymousOpen' | 'recordMediaDownloads' | 'recordEngagementBatch'
  >;
};

/**
 * Les ids PUBLICS parmi ceux demandés — l'audience d'un visiteur sans compte.
 *
 * Le filtre lui-même n'est PAS écrit ici : `buildViewerVisibilityFilter(prisma,
 * undefined)` est la source de vérité de « ce qu'un anonyme voit », la même que
 * `PostService.recordAnonymousOpen` consulte déjà. Une clause `visibility:
 * PUBLIC` recopiée ici serait une seconde loi qui dériverait de la première.
 *
 * Comme sa jumelle authentifiée, cette passe est UNE lecture bornée par les ids
 * DISTINCTS — jamais un `findFirst` par événement : deux cents allers-retours
 * séquentiels sur un chemin appelé à chaque défilement seraient une lenteur,
 * donc un bug.
 */
async function filterPublicPostIds(
  prisma: PrismaClient,
  postIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const distinctIds = [...new Set(postIds)];
  if (distinctIds.length === 0) return new Set<string>();

  const visibilityFilter = await buildViewerVisibilityFilter(prisma, undefined);
  const rows = await prisma.post.findMany({
    where: { id: { in: distinctIds }, deletedAt: NOT_DELETED, ...visibilityFilter },
    select: { id: true },
    // La borne est REDITE à la requête, alors que `distinctIds` est déjà plafonné
    // par le schéma du lot : une borne qui ne vit que chez l'appelant est une
    // convention, pas une borne — elle disparaît le jour où un second appelant
    // arrive avec sa propre idée du plafond.
    take: SOCIAL_EVENTS_BATCH_CAP,
  });
  return new Set(rows.map((row: { id: string }) => row.id));
}

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
  actor: SocialEventsActor,
): Promise<number> {
  if (events.length === 0) return 0;

  // Un visiteur sans compte n'a pas de `userId` : sa vue est un COMPTAGE
  // d'ouverture dédupliqué par jeton de session, jamais une ligne `PostView`.
  if (actor.kind === 'anonymous') {
    const comptes = await Promise.all(
      events.map((event) => deps.postService.recordAnonymousOpen(event.postId, actor.sessionKey)),
    );
    return comptes.filter(Boolean).length;
  }

  let recorded = 0;
  for (const event of events) {
    const isNewView = await deps.postService.recordView(event.postId, actor.userId, event.durationMs);
    recorded += 1;

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
  events: readonly Extract<SocialEvent, { type: 'impression' }>[],
  userId: string,
): Promise<number> {
  if (events.length === 0) return 0;

  await deps.prisma.postImpression.createMany({
    data: events.map((event) => ({ postId: event.postId, userId, source: event.source })),
  });

  const impressions = compterParId(events.map((event) => event.postId));
  // Ouvrir le Détail d'un post est à la fois une impression ET une ouverture
  // comptée immédiatement — chaque ouverture compte, sans seuil. Les autres
  // surfaces ne comptent qu'une impression.
  const ouvertures = compterParId(
    events.filter((event) => event.source === 'detail').map((event) => event.postId),
  );

  const racines = await resoudreRacinesDeRepost(deps.prisma, [...impressions.keys()]);
  const creditsRacine = compterParId(
    events.map((event) => racines.get(event.postId)).filter((id): id is string => id !== undefined),
  );

  await Promise.all([
    ...groupesParIncrement(impressions).map(([increment, ids]) =>
      deps.prisma.post.updateMany({ where: { id: { in: ids } }, data: { impressionCount: { increment } } })),
    ...groupesParIncrement(ouvertures).map(([increment, ids]) =>
      deps.prisma.post.updateMany({ where: { id: { in: ids } }, data: { postOpenCount: { increment } } })),
    ...groupesParIncrement(creditsRacine).map(([increment, ids]) =>
      deps.prisma.post.updateMany({
        where: { id: { in: ids }, deletedAt: NOT_DELETED },
        data: { impressionCount: { increment } },
      })),
  ]);

  return events.length;
}

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
): Promise<SocialEventsOutcome> {
  const vide: SocialEventsOutcome['legacy'] = { mediaRecorded: 0, anonymousCounted: false };
  if (events.length === 0) return { recorded: 0, rejected: 0, legacy: vide };

  const allowed = actor.kind === 'user'
    ? await filterConsumablePostIds(deps.prisma, events.map((e) => e.postId), actor.userId)
    : await filterPublicPostIds(deps.prisma, events.map((e) => e.postId));

  const admis = events.filter((event) => allowed.has(event.postId));
  const rejected = events.length - admis.length;
  if (admis.length === 0) return { recorded: 0, rejected, legacy: vide };

  const parType = <T extends SocialEvent['type']>(type: T) =>
    admis.filter((event): event is Extract<SocialEvent, { type: T }> => event.type === type);

  const vues = await applyViews(deps, parType('view'), actor);
  if (actor.kind === 'anonymous') {
    return { recorded: vues, rejected, legacy: { mediaRecorded: 0, anonymousCounted: vues > 0 } };
  }

  const [impressions, telechargements, sessions] = await Promise.all([
    applyImpressions(deps, parType('impression'), actor.userId),
    applyDownloads(deps, parType('download'), actor.userId),
    applyDwell(deps, parType('dwell'), actor.userId),
  ]);

  return {
    recorded: vues + impressions + telechargements.events + sessions,
    rejected,
    legacy: { mediaRecorded: telechargements.media, anonymousCounted: false },
  };
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
  events: readonly Extract<SocialEvent, { type: 'dwell' }>[],
  userId: string,
): Promise<number> {
  if (events.length === 0) return 0;
  const sessions = events.map(({ type: _type, ...session }) => session);
  return deps.postService.recordEngagementBatch(
    sessions as Parameters<PostService['recordEngagementBatch']>[0],
    userId,
  );
}

/**
 * La clé du seau de débit — exportée parce que c'est ELLE que le témoin du
 * critère 7.3 exerce, pas la fabrique qui l'enveloppe.
 *
 * ## Pourquoi elle ne contient PAS l'adresse
 *
 * L'ancienne clé de la vue anonyme était `posts:view:ip:${request.ip}` : UN
 * seau pour tout ce qu'une adresse observe, quel que soit le post. Deux
 * conséquences, toutes deux mauvaises — c'est une garde inefficace (un
 * visiteur qui martèle un post consomme le crédit de tous ses autres gestes)
 * et un déni de service mutuel entre visiteurs légitimes partageant une sortie
 * NAT. Le jeton de session est l'identité que le visiteur porte DÉJÀ ; le post
 * borne le seau à ce qu'il observe.
 *
 * > Note sur le critère 8, mesurée plutôt que reprise : `trustProxy:
 * > resolveTrustProxy()` est posé aux DEUX constructions de `server.ts`
 * > (`:213`, `:235`), avec un maillon de confiance par défaut. `request.ip`
 * > désigne donc l'appelant RÉEL, pas le conteneur Traefik — le repli IP est
 * > OPÉRANT, contrairement à ce que l'énoncé suppose. Il reste néanmoins le
 * > mauvais choix ICI, pour les deux raisons ci-dessus, qui ne tiennent pas à
 * > la confiance de proxy.
 *
 * ## Pourquoi le seau d'un COMPTE ne se scinde pas par post
 *
 * 30/min couvre le lot entier : une clé par `(compte, post)` rendrait le
 * plafond proportionnel au nombre de posts observés, c'est-à-dire non borné.
 */
export function socialEventsRateLimitKey(request: FastifyRequest): string {
  const userId = (request as UnifiedAuthRequest).authContext?.userId;
  if (userId) return `social:events:${userId}`;

  const sessionKey = sessionKeyOf(request);
  // `request.body` est parsé au moment où le limiteur s'exécute (`preHandler`,
  // cf. `GARDES_DE_CLE`) — jamais à `onRequest`, où il n'existe pas encore.
  const premier = premierPostId(request.body);
  return `social:events:${sessionKey ?? 'anonyme'}:${premier ?? 'lot'}`;
}

/**
 * Le premier `postId` du lot — la borne du seau anonyme.
 *
 * LE PREMIER, et non tous : une clé doit être UNE chaîne, et un visiteur
 * n'observe qu'un contenu à la fois (le web n'émet qu'un événement anonyme par
 * appel). Lu défensivement — ce corps n'a pas encore traversé le schéma.
 */
function premierPostId(body: unknown): string | undefined {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return undefined;
  const premier = (events[0] as { postId?: unknown })?.postId;
  return typeof premier === 'string' && OBJECT_ID_REGEX.test(premier) ? premier : undefined;
}

const sessionKeyOf = (request: FastifyRequest): string | undefined => {
  const brut = request.headers['x-session-token'];
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return typeof valeur === 'string' && valeur.length > 0 && valeur.length <= 128 ? valeur : undefined;
};

/**
 * Débits du critère 5 (compte) et du critère 4 (visiteur), sur la MÊME route.
 *
 * `max` est une FONCTION parce que les deux plafonds diffèrent et que la route
 * est unique : 30/min pour un compte, 10/min pour un visiteur. Les deux gardes
 * de `GARDES_DE_CLE` sont redites ici plutôt qu'importées d'une fabrique de
 * `middleware/rate-limiter` : ce limiteur porte une clé qui lit le CORPS, ce
 * qu'aucune des fabriques existantes ne fait.
 *
 *  - `hook: 'preHandler'` — `config.rateLimit` s'applique par défaut à
 *    `onRequest`, AVANT que l'authentification ne pose `authContext` et avant
 *    que le corps ne soit parsé : la clé y verrait `undefined` deux fois et
 *    retomberait systématiquement sur le repli.
 *  - `skipOnError: false` — le limiteur global pose `skipOnError: true`, valeur
 *    GLOBALE fusionnée par `Object.assign` dans toute config qui ne la
 *    redéclare pas. Un Redis indisponible ouvrirait ce seau en grand : la panne
 *    du gardien deviendrait l'absence de garde.
 */
export const socialEventsRateLimit = {
  max: (request: FastifyRequest) =>
    ((request as UnifiedAuthRequest).authContext?.userId ? 30 : 10),
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
 * Les types qu'un visiteur SANS COMPTE peut produire.
 *
 * Une vue, et rien d'autre. Un téléchargement, une impression et une session
 * d'engagement écrivent tous une ligne PORTANT UNE IDENTITÉ (`userId`) —
 * qu'un anonyme n'a pas. Refuser explicitement vaut mieux que les ignorer en
 * silence : un client qui les envoie a un défaut, et un `rejected` muet le lui
 * cacherait derrière un mot qui signifie « hors audience ».
 */
const TYPES_ANONYMES: ReadonlySet<SocialEvent['type']> = new Set(['view']);

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
      const parsed = SocialEventsBatchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid social events batch', { code: 'VALIDATION_ERROR' });
      }

      const acteur = resolveActor(request);
      if (!acteur) {
        return sendBadRequest(reply, 'Missing or invalid session key', { code: 'VALIDATION_ERROR' });
      }

      if (acteur.kind === 'anonymous'
        && parsed.data.events.some((event) => !TYPES_ANONYMES.has(event.type))) {
        return sendForbidden(reply, 'Authentication required for this event type', { code: 'FORBIDDEN' });
      }

      const { recorded, rejected } = await ingestSocialEvents(deps, parsed.data.events, acteur);
      return sendSuccess(reply, { recorded, rejected });
    } catch (error) {
      enhancedLogger.error('[POST /social/events]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}

/**
 * QUI appelle — un compte, un visiteur porteur d'un jeton de session, ou
 * personne (`undefined`).
 *
 * Un visiteur SANS jeton est refusé : sans lui, il n'a aucune identité de seau,
 * et son débit retomberait sur l'unique repli — exactement le seau partagé que
 * ce lot ferme.
 */
function resolveActor(request: FastifyRequest): SocialEventsActor | undefined {
  const registeredUser = (request as UnifiedAuthRequest).authContext?.registeredUser;
  if (registeredUser) {
    return { kind: 'user', userId: registeredUser.id, username: registeredUser.username ?? '' };
  }
  const sessionKey = sessionKeyOf(request);
  return sessionKey ? { kind: 'anonymous', sessionKey } : undefined;
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
