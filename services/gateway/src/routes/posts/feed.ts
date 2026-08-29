import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import type { CursorPaginationMeta, ResponseMeta } from '@meeshy/shared/types';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostFeedService } from '../../services/PostFeedService';
import { FeedQuerySchema, UserParams, CommunityParams } from './types';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendInternalError } from '../../utils/response';
import { validatePagination } from '../../utils/pagination';
import { getCacheStore } from '../../services/CacheStore';
import { wireReaderFromRequest, type WireReader } from '../../services/posts/storyEffectsV3';
import { viewerFromRequest } from '../users/presence-gate';
import { depreciee, type AdresseDepreciee } from '../../utils/deprecation';

/**
 * Le fil social — DOUZE routes qui lisent la même ligne `Post`, distinguée
 * par son `type` (issue #4149).
 *
 * `GET /social/posts?scope=…` remplace HUIT des neuf routes que ce fichier
 * montait (home, stories, stories.mine, reels, statuses [+ discover via
 * `audience=public`], author, community, bookmarks) par UNE route validée
 * par union discriminée Zod — un scope hors énumération, ou un paramètre de
 * scope malformé, rend 400 au lieu d'une page vide qui se lit comme
 * « pas de contenu ».
 *
 * `hashtag`, `nearby` et `sound` (les trois listes restantes du domaine)
 * vivent dans `hashtag.ts` / `nearby.ts` / `sounds.ts`, hors du territoire de
 * ce lot — leur fusion est un suivi distinct (voir le rapport de clôture).
 *
 * ## Pourquoi les neuf ANCIENNES routes restent montées
 *
 * iOS, web et Android les appellent AUJOURD'HUI (critères 9/10) — aucune
 * bascule client n'est dans ce chantier, et Android n'a même pas
 * d'inventaire pour prouver un trafic nul. Elles deviennent des ALIAS
 * DÉPRÉCIÉS : même chemin et même forme de réponse qu'avant (aucun client
 * cassé), `Deprecation`/`Link` posés par le helper unique
 * `utils/deprecation.ts` (RFC 9745 + RFC 5829 — jamais un en-tête composé à
 * la main), et la LECTURE elle-même déléguée aux mêmes fonctions `charger*`
 * que la route cible : « une fusion qui recopie un handler recrée le
 * doublon qu'elle prétend fermer » (critère 6). Pas de `Sunset` : la règle de
 * retrait de ce domaine (`docs/product/api-simplification/social.md` § Ordre
 * des étapes, point 7) est un COMPTEUR d'usage résiduel, jamais un
 * calendrier — en poser un serait un mensonge que `utils/deprecation.ts`
 * refuse par construction (`retraitLe` n'est dérivé que d'une règle écrite
 * et chiffrée, ce qui n'est pas le cas ici).
 *
 * ## Le défaut que la fusion corrige au passage
 *
 * SEPT des neuf handlers (`home`, `reels`, `statuses`, `statuses/discover`,
 * `author`, `community`, `bookmarks`) avalaient une query invalide — un repli
 * ternaire sur l'échec du `safeParse`, servant un objet de pagination par
 * défaut à la place d'un rejet — et servaient silencieusement une première
 * page. Sur les réels en particulier,
 * un `?seed=` vide (ou un `limit` non numérique, qui fait échouer le MÊME
 * parse) basculait sans le dire « à partir de ce réel » vers « Pour toi ».
 * Les DEUX surfaces (alias ET route cible) valident désormais strictement et
 * rendent 400 — c'était l'ALIAS, pas une route neuve, qui portait le risque
 * (critère 8 : « c'est l'alias qui porte encore le safeParse permissif si la
 * délégation est incomplète »). `stories`/`stories.mine` restent
 * INCHANGÉES : leur tolérance sur `updatedSince`/`projection`/`limit`
 * (`validatePagination`) est un choix assumé, documenté sur place — pas le
 * même défaut, et `utils/pagination.ts` est hors du territoire de ce lot.
 *
 * ## Ce que `packages/shared/types/api-responses.ts` ne déclare pas ENCORE
 *
 * `pagination.form` et `meta.deletedIds`/`deletedIdsTruncated`
 * (généralisation de `deletedStoryIds`, jusqu'ici propre aux stories)
 * n'existent pas sur `CursorPaginationMeta`/`ResponseMeta` — cette édition
 * est HORS TERRITOIRE de ce lot (déclarée à l'intégrateur, cf. rapport de
 * clôture). `CursorPaginationAvecForme` et `MetaAvecTombstonesGeneralises`,
 * juste en dessous, élargissent LOCALEMENT par intersection — aucun `any`,
 * aucune assertion de type, juste une forme plus large que celle déclarée
 * aujourd'hui. Ces deux lignes disparaissent sans changer le comportement le
 * jour où le type partagé porte nativement ces champs.
 */
type CursorPaginationAvecForme = CursorPaginationMeta & {
  /** `keyset` sur les huit scopes servis ici — `offset` est réservé à
   * `scope=nearby`, hors territoire de ce lot (un tri par distance n'a pas
   * de frontière keyset naturelle : propriété du scope, pas exception
   * cachée — critère 4). */
  readonly form: 'keyset';
};

type MetaAvecTombstonesGeneralises = ResponseMeta & {
  readonly deletedIds: string[];
  readonly deletedIdsTruncated: boolean;
};

/** Résultat commun aux huit lecteurs `charger*` — la forme que `PostFeedService`
 * rend déjà partout, `deletedIds`/`deletedIdsTruncated` en plus (stories
 * seules les peuplent ; les autres scopes servent `[]`/`false`, cf.
 * `envoyerFeedUnifie`). */
type ScopedFeedResult = {
  items: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
  deletedIds?: string[];
  deletedIdsTruncated?: boolean;
};

/**
 * Enveloppe UNIQUE de `GET /social/posts` — huit scopes, une seule sortie.
 * `Cache-Control` est posé sans condition de scope : les neuf alias
 * divergeaient déjà sans raison écrite (statuses seul n'en portait aucun) ;
 * la route neuve n'a aucune compatibilité à préserver et n'a pas de raison
 * de reconduire cet oubli.
 */
function envoyerFeedUnifie(reply: FastifyReply, resultat: ScopedFeedResult, limit: number): void {
  reply.header('Cache-Control', 'private, no-cache');
  const pagination: CursorPaginationAvecForme = {
    limit,
    hasMore: resultat.hasMore,
    nextCursor: resultat.nextCursor,
    form: 'keyset',
  };
  const meta: MetaAvecTombstonesGeneralises = {
    deletedIds: resultat.deletedIds ?? [],
    deletedIdsTruncated: resultat.deletedIdsTruncated ?? false,
  };
  sendSuccess(reply, resultat.items, { pagination, meta });
}

/** Même tolérance que l'alias historique de `/posts/feed/stories` (G1) :
 * un timestamp invalide n'est pas une erreur de requête, c'est une absence
 * de delta — le client retombe sur un fetch complet. */
function dateOptionnelleSiValide(valeur: string | undefined): Date | undefined {
  if (!valeur) return undefined;
  const parsed = new Date(valeur);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const LimiteSchema = z.coerce.number().int().min(1).max(50).default(20);

/**
 * `.min(1)` sur `seed` : un `?seed=` VIDE n'est pas une absence, c'est une
 * désignation malformée. Le laisser passer basculait silencieusement
 * « à partir de ce réel » vers « Pour toi » (critère 8, exemple nommé).
 * Partagé par l'alias ET la route cible — une seule règle, deux surfaces.
 */
const SeedSchema = z.string().min(1).optional();

/**
 * `GET /social/posts?scope=…` — union discriminée sur `scope` : une valeur
 * hors énumération rend 400 par construction (critère 1). `updatedSince`
 * n'est déclaré QUE sur `stories` : seule `PostFeedService.getStories`
 * supporte le delta-sync aujourd'hui — le généraliser aux sept autres scopes
 * est un changement de service, hors du territoire de ce lot (cf. rapport de
 * clôture). Un client qui l'envoie ailleurs le voit silencieusement ignoré
 * (Zod strippe les clés non déclarées) plutôt que rejeté : un paramètre
 * FUTUR n'est pas une requête invalide aujourd'hui.
 *
 * `projection` et `audience` sont volontairement LENIENTS (chaîne libre,
 * post-traitée) : ce sont des bascules d'AFFICHAGE à une seule valeur
 * reconnue, pas des identifiants — une valeur inconnue retombe sur le défaut
 * (corps complet / audience personnalisée), exactement comme l'alias
 * historique de `?projection=` (rétro-compatible, feed.ts:64 avant ce lot).
 * `authorId`/`communityId` sont eux des IDENTIFIANTS requis : absents ou
 * vides, ils rendent 400 — la distinction est délibérée, pas un oubli.
 */
const SocialPostsQuerySchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('home'), cursor: z.string().optional(), limit: LimiteSchema }),
  z.object({
    scope: z.literal('stories'),
    cursor: z.string().optional(),
    limit: LimiteSchema,
    updatedSince: z.string().optional(),
    projection: z.string().optional(),
  }),
  z.object({ scope: z.literal('stories.mine'), cursor: z.string().optional(), limit: LimiteSchema }),
  z.object({ scope: z.literal('reels'), cursor: z.string().optional(), limit: LimiteSchema, seed: SeedSchema }),
  z.object({
    scope: z.literal('statuses'),
    cursor: z.string().optional(),
    limit: LimiteSchema,
    audience: z.string().optional(),
  }),
  z.object({
    scope: z.literal('author'),
    cursor: z.string().optional(),
    limit: LimiteSchema,
    authorId: z.string().min(1),
  }),
  z.object({
    scope: z.literal('community'),
    cursor: z.string().optional(),
    limit: LimiteSchema,
    communityId: z.string().min(1),
  }),
  z.object({ scope: z.literal('bookmarks'), cursor: z.string().optional(), limit: LimiteSchema }),
]);

/** Même validation de `seed` que la route cible (`SeedSchema`) — DEUX
 * surfaces, UNE règle. Sans ce partage, un correctif de l'une dérive
 * silencieusement de l'autre (c'est exactement le défaut que ce lot ferme). */
const ReelsAliasQuerySchema = FeedQuerySchema.extend({ seed: SeedSchema });

const SOCIAL_POSTS_DEPUIS = '2026-08-29';

function successeurSocialPosts(scope: string, extra?: string): string {
  return `/api/v1/social/posts?scope=${scope}${extra ? `&${extra}` : ''}`;
}

/**
 * La TABLE DE CORRESPONDANCE (critère 6) : chaque ancienne adresse pointe
 * vers son unique successeur sur `/social/posts`. `author`/`community`
 * portent un identifiant de CHEMIN (`:userId`/`:communityId`) que le
 * successeur ne peut résoudre qu'à la requête — d'où la forme fonction,
 * exactement le cas que `utils/deprecation.ts` documente.
 */
const SUCCESSEURS_SOCIAL_POSTS: Record<string, AdresseDepreciee> = {
  home: { depuis: SOCIAL_POSTS_DEPUIS, successeur: successeurSocialPosts('home') },
  stories: { depuis: SOCIAL_POSTS_DEPUIS, successeur: successeurSocialPosts('stories') },
  storiesMine: { depuis: SOCIAL_POSTS_DEPUIS, successeur: successeurSocialPosts('stories.mine') },
  reels: { depuis: SOCIAL_POSTS_DEPUIS, successeur: successeurSocialPosts('reels') },
  statuses: { depuis: SOCIAL_POSTS_DEPUIS, successeur: successeurSocialPosts('statuses') },
  statusesDiscover: {
    depuis: SOCIAL_POSTS_DEPUIS,
    successeur: successeurSocialPosts('statuses', 'audience=public'),
  },
  author: {
    depuis: SOCIAL_POSTS_DEPUIS,
    successeur: (request) => successeurSocialPosts('author', `authorId=${(request.params as UserParams).userId}`),
  },
  community: {
    depuis: SOCIAL_POSTS_DEPUIS,
    successeur: (request) =>
      successeurSocialPosts('community', `communityId=${(request.params as CommunityParams).communityId}`),
  },
  bookmarks: { depuis: SOCIAL_POSTS_DEPUIS, successeur: successeurSocialPosts('bookmarks') },
};

export function registerFeedRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  optionalAuth: any
) {
  const feedService = new PostFeedService(prisma, getCacheStore());

  // ============================================================
  // NOYAU PARTAGÉ — un lecteur par scope, appelé par l'ALIAS et par
  // `GET /social/posts`. C'est ici, et nulle part ailleurs, que ce fichier
  // parle à `PostFeedService` : dupliquer un appel à la place d'appeler ces
  // fonctions recrée le doublon que ce lot ferme (critère 6).
  // ============================================================

  async function chargerHome(
    userId: string,
    params: { cursor?: string; limit: number },
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getFeed(userId, params.cursor, params.limit, reader);
  }

  async function chargerStories(
    userId: string,
    params: { cursor?: string; limit: number; updatedSince?: Date; projection?: 'tray' },
    viewerRole: GlobalUserRoleType | undefined,
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getStories(userId, { ...params, viewerRole, reader });
  }

  async function chargerStoriesMine(
    userId: string,
    params: { cursor?: string; limit: number },
    viewerRole: GlobalUserRoleType | undefined,
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getStories(userId, { ...params, archiveOfAuthor: true, viewerRole, reader });
  }

  async function chargerReels(
    userId: string,
    params: { cursor?: string; limit: number; seed?: string },
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getReels(userId, {
      seedReelId: params.seed,
      cursor: params.cursor,
      limit: params.limit,
      reader,
    });
  }

  async function chargerStatuses(
    userId: string,
    params: { cursor?: string; limit: number },
    audience: 'public' | undefined,
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return audience === 'public'
      ? feedService.getDiscoverStatuses(userId, params.cursor, params.limit, reader)
      : feedService.getStatuses(userId, params.cursor, params.limit, reader);
  }

  async function chargerAuthor(
    targetUserId: string,
    viewerUserId: string | undefined,
    params: { cursor?: string; limit: number },
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getUserPosts(targetUserId, viewerUserId, params.cursor, params.limit, reader);
  }

  async function chargerCommunity(
    communityId: string,
    viewerUserId: string | undefined,
    params: { cursor?: string; limit: number },
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getCommunityFeed(communityId, viewerUserId, params.cursor, params.limit, reader);
  }

  async function chargerBookmarks(
    userId: string,
    params: { cursor?: string; limit: number },
    reader: WireReader,
  ): Promise<ScopedFeedResult> {
    return feedService.getBookmarks(userId, params.cursor, params.limit, reader);
  }

  // ============================================================
  // ALIAS DÉPRÉCIÉS — neuf adresses historiques, montées à l'identique
  // (même chemin, même forme de réponse) pour ne casser aucun client déjà
  // installé. Chacune annonce son sursis (`onRequest: depreciee(…)`, avant
  // toute garde d'authentification — un appelant REFUSÉ doit apprendre par
  // quoi migrer autant qu'un appelant servi) et délègue sa lecture au noyau
  // partagé ci-dessus.
  // ============================================================

  // ALIAS déprécié de GET /social/posts?scope=home (#4149).
  fastify.get('/posts/feed', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.home),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const resultat = await chargerHome(
        authContext.registeredUser.id,
        { cursor, limit },
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // ALIAS déprécié de GET /social/posts?scope=stories (#4149). Parsing
  // inchangé (G1/G1b/G1c) — seule la lecture passe désormais par le noyau.
  fastify.get('/posts/feed/stories', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.stories),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      // G1 delta-sync : `?updatedSince=<ISO8601>` (même convention que
      // GET /conversations?updatedSince) — timestamp invalide ignoré (full).
      const rawSince = (request.query as Record<string, unknown> | undefined)?.updatedSince;
      const updatedSince = dateOptionnelleSiValide(typeof rawSince === 'string' ? rawSince : undefined);

      // G1(b) projection légère : `?projection=tray` — whitelist stricte,
      // toute autre valeur retombe sur le plein corps (rétro-compatible).
      const rawProjection = (request.query as Record<string, unknown> | undefined)?.projection;
      const projection = rawProjection === 'tray' ? ('tray' as const) : undefined;

      // G1(c) pagination cursor — mêmes conventions que /posts/feed. Sans
      // paramètres, première page de 50 = plafond historique ; `data` reste
      // le tableau de stories (les clients existants décodent inchangé),
      // hasMore/nextCursor voyagent dans `pagination`.
      const rawCursor = (request.query as Record<string, unknown> | undefined)?.cursor;
      const cursor = typeof rawCursor === 'string' && rawCursor.length > 0 ? rawCursor : undefined;
      // SSOT `validatePagination` (cursor route: limit only) — NaN→default,
      // below-1→floor, over-50→cap. Consolidates the hand-rolled clamp.
      const rawLimit = (request.query as Record<string, unknown> | undefined)?.limit;
      const { limit } = validatePagination(undefined, typeof rawLimit === 'string' ? rawLimit : undefined, { defaultLimit: 50, maxLimit: 50 });

      const resultat = await chargerStories(
        authContext.registeredUser.id,
        { updatedSince, projection, cursor, limit },
        // Rôle RÉEL du viewer (2026-08-25) : le gate de présence auteur en a
        // besoin pour appliquer le bypass ADMIN/BIGBOSS au fil de stories.
        viewerFromRequest(request)?.role,
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
        // `deletedStoryIds` — tombstones du delta-sync : les stories disparues
        // (supprimées par leur auteur, ou périmées puis balayées) depuis
        // `updatedSince`. Le merge delta côté client étant additif, c'est le
        // SEUL canal qui lui permet de purger son cache quand il a manqué
        // l'event socket `story:deleted` — app fermée ou hors-ligne. Toujours
        // présent (tableau vide sur un fetch complet, qui écrase déjà tout).
        //
        // `deletedStoryIdsTruncated` — la liste ci-dessus est plafonnée et n'a
        // aucun curseur de reprise. Quand elle déborde, le client ne peut pas
        // paginer les disparitions manquantes : son seul recours est un fetch
        // complet, dont le remplacement du tray purge les fantômes. Sans ce
        // drapeau le plafond se lit comme une couverture complète.
        meta: {
          deletedStoryIds: resultat.deletedIds,
          deletedStoryIdsTruncated: resultat.deletedIdsTruncated,
        },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/stories] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/stories/mine — Archive COMPLÈTE des stories de l'appelant
  // (« Mes stories » : en cours ET passées), paginée keyset. Les stories ne
  // sont plus jamais détruites (cf. ephemeralPosts.SWEPT_POST_TYPES) : cette
  // route est le chemin d'accès à l'historique illimité, distinct du tray qui
  // borne l'archive auteur à 7 j pour ne pas noyer les stories des amis.
  // ALIAS déprécié de GET /social/posts?scope=stories.mine (#4149).
  fastify.get('/posts/stories/mine', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.storiesMine),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const rawCursor = (request.query as Record<string, unknown> | undefined)?.cursor;
      const cursor = typeof rawCursor === 'string' && rawCursor.length > 0 ? rawCursor : undefined;
      // SSOT `validatePagination` (cursor route: limit only) — NaN→default,
      // below-1→floor, over-50→cap. Consolidates the hand-rolled clamp.
      const rawLimit = (request.query as Record<string, unknown> | undefined)?.limit;
      const { limit } = validatePagination(undefined, typeof rawLimit === 'string' ? rawLimit : undefined, { defaultLimit: 20, maxLimit: 50 });

      const resultat = await chargerStoriesMine(
        authContext.registeredUser.id,
        { cursor, limit },
        viewerFromRequest(request)?.role,
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/stories/mine] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/reels — Vertical full-screen reel thread.
  // `?seed=<reelId>` (réel touché dans le Feed) → thread d'affinité ; sans seed
  // → onglet « Pour toi ».
  // ALIAS déprécié de GET /social/posts?scope=reels (#4149). `seed` valide
  // désormais strictement (`ReelsAliasQuerySchema`, `.min(1)`) : un
  // `?seed=` vide basculait en silence vers « Pour toi » (critère 1/8).
  fastify.get('/posts/feed/reels', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.reels),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = ReelsAliasQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit, seed } = query.data;

      const resultat = await chargerReels(
        authContext.registeredUser.id,
        { cursor, limit, seed },
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/reels] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/statuses — Active statuses/moods
  // ALIAS déprécié de GET /social/posts?scope=statuses (#4149).
  fastify.get('/posts/feed/statuses', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.statuses),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const resultat = await chargerStatuses(
        authContext.registeredUser.id,
        { cursor, limit },
        undefined,
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/statuses] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/feed/statuses/discover — Public statuses (platform-wide)
  // ALIAS déprécié de GET /social/posts?scope=statuses&audience=public (#4149).
  fastify.get('/posts/feed/statuses/discover', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.statusesDiscover),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const resultat = await chargerStatuses(
        authContext.registeredUser.id,
        { cursor, limit },
        'public',
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/feed/statuses/discover] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/user/:userId — User profile posts
  // ALIAS déprécié de GET /social/posts?scope=author (#4149).
  fastify.get('/posts/user/:userId', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.author),
    preValidation: [optionalAuth],
  }, async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { userId } = request.params;

      const query = FeedQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const resultat = await chargerAuthor(
        userId,
        viewerUserId,
        { cursor, limit },
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/user/:userId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/community/:communityId — Community feed
  // ALIAS déprécié de GET /social/posts?scope=community (#4149).
  fastify.get('/posts/community/:communityId', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.community),
    preValidation: [optionalAuth],
  }, async (request: FastifyRequest<{ Params: CommunityParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { communityId } = request.params;

      const query = FeedQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const resultat = await chargerCommunity(
        communityId,
        viewerUserId,
        { cursor, limit },
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/community/:communityId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/bookmarks — User's bookmarked posts
  // ALIAS déprécié de GET /social/posts?scope=bookmarks (#4149).
  fastify.get('/posts/bookmarks', {
    onRequest: depreciee(SUCCESSEURS_SOCIAL_POSTS.bookmarks),
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const query = FeedQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const resultat = await chargerBookmarks(
        authContext.registeredUser.id,
        { cursor, limit },
        wireReaderFromRequest(request as UnifiedAuthRequest),
      );

      reply.header('Cache-Control', 'private, no-cache');

      return sendSuccess(reply, resultat.items, {
        pagination: { limit, hasMore: resultat.hasMore, nextCursor: resultat.nextCursor },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/bookmarks] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // ============================================================
  // GET /social/posts?scope=… — la route CIBLE (#4149, critère 1).
  // ============================================================
  fastify.get('/social/posts', {
    preValidation: [optionalAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = SocialPostsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const q = query.data;
      const reader = wireReaderFromRequest(request as UnifiedAuthRequest);
      const authContext = (request as UnifiedAuthRequest).authContext;
      const registeredUserId = authContext?.registeredUser?.id;

      // `author`/`community` héritent de l'auth OPTIONNELLE de leurs alias
      // (`/posts/user/:userId`, `/posts/community/:communityId`) : un profil
      // ou une communauté PUBLICS restent lisibles sans compte. Le contrôle
      // d'accès réel (audience FRIENDS/COMMUNITY/ONLY) reste posé par
      // `PostFeedService` lui-même — inchangé, cf. son `buildVisibilityFilter`.
      if (q.scope === 'author') {
        const resultat = await chargerAuthor(q.authorId, registeredUserId, { cursor: q.cursor, limit: q.limit }, reader);
        return envoyerFeedUnifie(reply, resultat, q.limit);
      }
      if (q.scope === 'community') {
        const resultat = await chargerCommunity(q.communityId, registeredUserId, { cursor: q.cursor, limit: q.limit }, reader);
        return envoyerFeedUnifie(reply, resultat, q.limit);
      }

      // Les six scopes restants exigent un compte enregistré — même garde
      // que les six alias historiques qu'ils remplacent (fail-closed : un
      // scope qui ÉLARGIT l'audience ne doit jamais élargir ce que le
      // lecteur a le droit de voir).
      if (!registeredUserId) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }
      const viewerId = registeredUserId;
      const viewerRole = viewerFromRequest(request)?.role;

      switch (q.scope) {
        case 'home': {
          const resultat = await chargerHome(viewerId, { cursor: q.cursor, limit: q.limit }, reader);
          return envoyerFeedUnifie(reply, resultat, q.limit);
        }
        case 'stories': {
          const resultat = await chargerStories(
            viewerId,
            {
              cursor: q.cursor,
              limit: q.limit,
              updatedSince: dateOptionnelleSiValide(q.updatedSince),
              projection: q.projection === 'tray' ? ('tray' as const) : undefined,
            },
            viewerRole,
            reader,
          );
          return envoyerFeedUnifie(reply, resultat, q.limit);
        }
        case 'stories.mine': {
          const resultat = await chargerStoriesMine(viewerId, { cursor: q.cursor, limit: q.limit }, viewerRole, reader);
          return envoyerFeedUnifie(reply, resultat, q.limit);
        }
        case 'reels': {
          const resultat = await chargerReels(viewerId, { cursor: q.cursor, limit: q.limit, seed: q.seed }, reader);
          return envoyerFeedUnifie(reply, resultat, q.limit);
        }
        case 'statuses': {
          const resultat = await chargerStatuses(
            viewerId,
            { cursor: q.cursor, limit: q.limit },
            q.audience === 'public' ? 'public' : undefined,
            reader,
          );
          return envoyerFeedUnifie(reply, resultat, q.limit);
        }
        case 'bookmarks': {
          const resultat = await chargerBookmarks(viewerId, { cursor: q.cursor, limit: q.limit }, reader);
          return envoyerFeedUnifie(reply, resultat, q.limit);
        }
      }
    } catch (error) {
      fastify.log.error(`[GET /social/posts] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
