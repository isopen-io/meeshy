import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { jetonRecherche } from '../../utils/search-tokens';
import { callerRateKey } from '../../utils/client-rate-key';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { validatePagination } from '../../utils/pagination';
import {
  mayOrderByRawPresence,
  servedOnlineFirst,
  viewerFromRequest,
} from '../users/presence-gate';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { contactLookupScope, blockedIdsOfViewer } from '../../services/ContactDirectoryService';

const logger = enhancedLogger.child({ module: 'DirectoryPeople' });

const LIMITE_DEFAUT = 20;
const LIMITE_MAX = 50;

/**
 * Le budget de LIGNES, distinct du débit par minute.
 *
 * C'est lui qui sépare une recherche d'une moisson : trente requêtes par minute
 * suffisent largement à un humain qui tape, et permettraient pourtant de
 * rapatrier l'annuaire entier en une journée. Un usage nominal — une centaine
 * de recherches par jour à vingt résultats — passe très en dessous des deux
 * mille lignes.
 */
export const BUDGET_LIGNES_PAR_JOUR = 2000;
const FENETRE_BUDGET_SECONDES = 24 * 60 * 60;

/** Ce qui part par défaut : quatre champs, et rien d'autre. */
const PROJECTION_MINIMALE = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

/**
 * `GET /directory/people` — chercher une personne, par les NOMS seulement (S2).
 *
 * ## Ce qui change par rapport à `GET /users/search`
 *
 * **L'index précède la route.** L'ancienne faisait un `contains` NON ancré,
 * insensible à la casse, sur cinq colonnes dont trois n'étaient indexées par
 * rien : chaque frappe balayait la collection entière. Celle-ci interroge
 * `searchTokens`, un tableau multikey, par une regex ANCRÉE — servie par
 * parcours d'index.
 *
 * **L'e-mail n'est ni dans le `where`, ni dans le `select`, ni dans le schéma.**
 * Joindre quelqu'un par son adresse a sa propre porte (#4160), authentifiée et
 * bornée. Chercher par fragment de nom n'a pas à y toucher.
 *
 * **La présence ne part que sur demande** (`?expand=presence`), et toujours par
 * la loi du champ : `resolveForTargets` + `applyPresenceVisibilityAsOffline`.
 * L'ordre obéit à la même loi — trier « en ligne d'abord » en base puis masquer
 * `isOnline` à la sortie laisserait lire la présence dans la POSITION.
 *
 * **Curseur, plus d'`offset`** : le `count()` complet disparaît, et `hasMore`
 * est DÉCLARÉ au schéma. Il ne l'était pas — `fast-json-stringify` le retirait
 * donc en silence, et le client ne pouvait pas savoir s'il restait une page.
 */
export async function directoryPeopleRoutes(fastify: FastifyInstance) {
  const parAppelant = createCustomRateLimiter(
    {
      max: 30,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:people:u',
      message: 'Trop de recherches. Veuillez patienter une minute.',
      keyGenerator: callerRateKey,
    },
    fastify.redis ?? undefined
  );

  fastify.get('/people', {
    onRequest: [fastify.authenticate],
    preHandler: [parAppelant.middleware()],
    schema: {
      description:
        'Search people by name prefix. Never by email or phone — those have their own authenticated door (#4160).',
      tags: ['directory'],
      summary: 'Search people',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 2, description: 'Prefix (>= 2 chars) of any word of a name' },
          cursor: { type: 'string', description: 'Username of the last row of the previous page' },
          limit: { type: 'string', default: String(LIMITE_DEFAUT) },
          expand: { type: 'string', description: 'Comma-separated: presence' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  displayName: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true },
                  isOnline: { type: 'boolean', nullable: true },
                  lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                // DÉCLARÉ, et c'est le correctif : il était produit et retiré
                // par le sérialiseur, donc le client ne pouvait pas savoir
                // s'il restait une page.
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true },
                limit: { type: 'number' },
              },
            },
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { q, cursor, limit, expand } = request.query as {
      q: string;
      cursor?: string;
      limit?: string;
      expand?: string;
    };

    const jeton = jetonRecherche(q ?? '');
    if (!jeton) {
      return sendBadRequest(reply, 'Le terme de recherche doit contenir au moins une lettre ou un chiffre');
    }

    // Le décodage passe par le SITE UNIQUE (`validatePagination`) et jamais par
    // un `Number()` en ligne : un `limit` non numérique produirait `NaN`, donc
    // un `take: NaN`, donc un 500 sur une entrée entièrement contrôlée par
    // l'appelant. Un cliquet du dépôt garde cette règle.
    const { limit: taille } = validatePagination('0', limit, {
      defaultLimit: LIMITE_DEFAUT,
      maxLimit: LIMITE_MAX,
    });
    const viewerId = (request as unknown as { user?: { userId?: string } }).user?.userId ?? '';

    try {
      const depasse = await budgetDepasse(fastify, viewerId, taille);
      if (depasse) {
        return reply.code(429).send({
          success: false,
          error: 'Budget de recherche quotidien atteint. Il se réinitialise dans les prochaines heures.',
          message: 'Budget de recherche quotidien atteint.',
          code: 'SEARCH_BUDGET_EXCEEDED',
        });
      }

      const avecPresence = (expand ?? '').split(',').map((s) => s.trim()).includes('presence');
      const presenceViewer = viewerFromRequest(request);

      const lignes = await fastify.prisma.user.findMany({
        where: {
          ...contactLookupScope({
            viewerId,
            blockedByViewer: await blockedIdsOfViewer(fastify.prisma, viewerId),
          }),
          // ÉGALITÉ EXACTE sur un élément du tableau — pas une regex.
          //
          // Les préfixes sont stockés à l'écriture (`searchTokensFor`), si bien
          // que « jea » est un jeton à part entière. La recherche est donc un
          // `has`, servi par parcours du multikey, et exprimable dans l'API
          // TYPÉE de Prisma — qui n'offre aucune regex sur une liste scalaire,
          // et aurait imposé un `findRaw` écrit à la main.
          searchTokens: { has: jeton },
        },
        select: avecPresence
          ? { ...PROJECTION_MINIMALE, isOnline: true, lastActiveAt: true }
          : PROJECTION_MINIMALE,
        orderBy: { username: 'asc' },
        ...(cursor ? { cursor: { username: cursor }, skip: 1 } : {}),
        take: taille + 1,
      });

      const hasMore = lignes.length > taille;
      const page = hasMore ? lignes.slice(0, taille) : lignes;

      const servi = avecPresence ? await gaterPresence(fastify, presenceViewer, page) : page;

      return sendSuccess(reply, servi, {
        pagination: {
          hasMore,
          nextCursor: hasMore ? (page[page.length - 1] as { username: string }).username : null,
          limit: taille,
        },
      } as never);
    } catch (error) {
      logger.error('Erreur de recherche de personnes', error as Error);
      return sendInternalError(reply, 'Erreur lors de la recherche');
    }
  });

  /** Consomme le budget de lignes, et dit si l'appelant l'a épuisé. */
  async function budgetDepasse(
    instance: FastifyInstance,
    viewerId: string,
    lignesDemandees: number
  ): Promise<boolean> {
    const redis = instance.redis;
    // Sans Redis (test, exécution directe), le budget ne s'applique pas : c'est
    // le limiteur par minute qui borne. Dit ici plutôt que subi en silence.
    if (!redis || !viewerId) return false;

    const cle = `dir:people:rows:u:${viewerId}`;
    const total = await redis.incrby(cle, lignesDemandees);
    if (total === lignesDemandees) await redis.expire(cle, FENETRE_BUDGET_SECONDES);
    return total > BUDGET_LIGNES_PAR_JOUR;
  }

  async function gaterPresence(
    instance: FastifyInstance,
    presenceViewer: unknown,
    page: Array<{ id: string }>
  ) {
    const carte = await getPresenceVisibilityService(instance.prisma).resolveForTargets(
      presenceViewer as never,
      page.map((u) => u.id)
    );
    return page
      .map((u) => applyPresenceVisibilityAsOffline(u as never, carte.get(u.id)))
      .sort(servedOnlineFirst as never);
  }

  void mayOrderByRawPresence;
}
