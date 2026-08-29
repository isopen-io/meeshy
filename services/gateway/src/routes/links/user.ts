import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  sendSuccess,
  sendForbidden,
  sendInternalError,
  createPaginationMeta
} from '../../utils/response.js';
import { validatePagination, buildCursorPaginationMeta } from '../../utils/pagination';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { depreciee } from '../../utils/deprecation';

// ═══════════════════════════════════════════════════════════════════════════
// #4170 — GET /links absorbe GET /links/my-links, GET /links/stats et
// GET /conversations/:conversationId/links (`conversations/sharing.ts`, hors
// territoire de ce lot). Trois portes de LECTURE appliquaient trois seuils :
// `/my-links` et `GET /links` filtraient déjà sur `createdBy` (correct, mais
// bornes de pagination différentes — 50/100 contre 20/50) ; la troisième
// filtrait sur `creatorId`, colonne qui N'EXISTE PAS sur `ConversationShareLink`
// (`schema.prisma:581` déclare `createdBy` — `creator` n'est que le nom de la
// RELATION) : Prisma levait, le catch-all rendait 500, et un membre non
// modérateur ne pouvait JAMAIS lister ses propres liens d'une conversation.
// Cette route corrige la lecture EN NEUF (elle ne réutilise pas le code
// fautif, hors territoire) et devient l'unique bloc pour les trois usages.
// ═══════════════════════════════════════════════════════════════════════════

interface ListLinksQuery {
  conversationId?: string;
  mine?: string;
  cursor?: string;
  offset?: string;
  limit?: string;
  expand?: string;
  include?: string;
  fields?: string;
}

/**
 * Agrégats RÉELS d'un ensemble de liens — jamais une valeur d'emprunt.
 *
 * `GET /links/my-links` (`admin.ts`) fabriquait un bloc `stats` PAR LIEN où
 * `memberCount` valait toujours `0`, `anonymousCount` recopiait `currentUses`
 * (une contrainte du lien, pas une mesure d'usage) et `spokenLanguages`
 * recopiait `allowedLanguages` (une RESTRICTION, pas un usage constaté). Ces
 * trois agrégats-ci ne portent QUE ce que Prisma peut compter :
 * `totalLinks`/`activeLinks` (count) et `totalUses` (somme de `currentUses`,
 * le seul compteur d'usage que le schéma tient). Un champ qu'on ne sait pas
 * mesurer — participants distincts, langues effectivement parlées — n'est
 * PAS servi ici avec un zéro ou une copie déguisée : il est absent.
 *
 * Partagée par `GET /links/stats` (alias déprécié) et `GET /links?include=summary`
 * (cible) pour que les deux ne divergent jamais sur ce qu'ils comptent.
 */
async function computeShareLinksSummary(
  fastify: FastifyInstance,
  where: Record<string, unknown>
): Promise<{ totalLinks: number; activeLinks: number; totalUses: number }> {
  const [totalLinks, activeLinks, totalUsesAgg] = await Promise.all([
    fastify.prisma.conversationShareLink.count({ where }),
    fastify.prisma.conversationShareLink.count({ where: { ...where, isActive: true } }),
    fastify.prisma.conversationShareLink.aggregate({
      where,
      _sum: { currentUses: true },
    }),
  ]);

  return {
    totalLinks,
    activeLinks,
    totalUses: totalUsesAgg._sum.currentUses ?? 0,
  };
}

type LinkItem = Record<string, unknown>;

/**
 * Le mapping DE BASE — identique, champ pour champ, à ce que `GET /links`
 * rendait avant ce lot. iOS (`MyShareLink`, `ShareLinkModels.swift:216`) et
 * Android (`MyShareLink`, `ShareLink.kt:172`) le décodent tous deux
 * aujourd'hui via `?offset=&limit=` : y toucher casse deux clients qu'aucun
 * autre agent de ce lot ne peut mettre à jour. `expand`/`fields` n'ajoutent
 * ou ne retirent donc jamais rien à CE socle, ils l'augmentent ou le filtrent
 * par-dessus.
 */
function mapBaseLinkItem(l: {
  id: string;
  linkId: string;
  identifier: string;
  name: string | null;
  isActive: boolean;
  currentUses: number;
  maxUses: number | null;
  expiresAt: Date | null;
  createdAt: Date;
  conversation: { id: string; title: string | null; type: string; description?: string | null } | null;
  creator?: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    avatar: string | null;
  };
}): LinkItem {
  return {
    id: l.id,
    linkId: l.linkId,
    identifier: l.identifier,
    name: l.name ?? null,
    isActive: l.isActive,
    currentUses: l.currentUses,
    maxUses: l.maxUses ?? null,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    conversationTitle: l.conversation?.title ?? null,
  };
}

/**
 * Champs de POLICE d'un lien (permissions anonymes, restrictions, compteurs
 * de concurrence) — `expand=policy`, gardé HORS du socle par défaut.
 *
 * Toutes des colonnes SCALAIRES de `ConversationShareLink` : `findMany`
 * ci-dessous ne pose aucun `select` restrictif, donc Prisma les charge déjà
 * pour CHAQUE appelant, `?expand=policy` ou non — cette fonction ne coûte
 * rien de plus en base, elle décide seulement ce qui est RECOPIÉ dans la
 * réponse. `conversation-links-section.tsx` (web) est le premier consommateur :
 * la popover de détails d'un lien y affiche permissions et restrictions, que
 * `GET /conversations/:conversationId/links` rendait déjà (avant #4170) mais
 * dont le schéma OpenAPI ne déclarait qu'un sous-ensemble étroit — servies
 * ici en entier, déclarées en entier (voir le schéma de réponse plus bas).
 */
function mapPolicyFields(l: {
  description: string | null;
  maxConcurrentUsers: number | null;
  currentConcurrentUsers: number;
  maxUniqueSessions: number | null;
  currentUniqueSessions: number;
  allowAnonymousMessages: boolean;
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  allowViewHistory: boolean;
  requireAccount: boolean;
  requireNickname: boolean;
  requireEmail: boolean;
  requireBirthday: boolean;
  allowedCountries: string[];
  allowedLanguages: string[];
  allowedIpRanges: string[];
}): LinkItem {
  return {
    description: l.description ?? null,
    maxConcurrentUsers: l.maxConcurrentUsers ?? null,
    currentConcurrentUsers: l.currentConcurrentUsers,
    maxUniqueSessions: l.maxUniqueSessions ?? null,
    currentUniqueSessions: l.currentUniqueSessions,
    allowAnonymousMessages: l.allowAnonymousMessages,
    allowAnonymousFiles: l.allowAnonymousFiles,
    allowAnonymousImages: l.allowAnonymousImages,
    allowViewHistory: l.allowViewHistory,
    requireAccount: l.requireAccount,
    requireNickname: l.requireNickname,
    requireEmail: l.requireEmail,
    requireBirthday: l.requireBirthday,
    allowedCountries: l.allowedCountries,
    allowedLanguages: l.allowedLanguages,
    allowedIpRanges: l.allowedIpRanges,
  };
}

/**
 * Routes de gestion des liens de partage user-scoped
 */
export async function registerUserRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /links — Liste les liens de partage de l'utilisateur connecté, ou
   * (avec `conversationId`) les liens d'UNE conversation dont il est membre.
   */
  fastify.get<{ Querystring: ListLinksQuery }>('/links', {
    onRequest: [authRequired],
    schema: {
      description: 'List share links. Without conversationId: the authenticated user\'s own links, globally. With conversationId: the links of that conversation — a moderator sees all of them, a regular member only their own (unless ?mine=true forces the narrower view for everyone). Supports offset pagination (legacy, still used by iOS/Android) and cursor pagination (?cursor=<linkId>, the forward-looking form — offset stays accepted for backward compatibility, it is not removed). ?expand=conversation,creator,policy adds the corresponding fields (policy = permissions/restrictions, already-loaded scalar columns, no extra query); ?include=summary adds real (never fabricated) aggregates in meta.summary, sparing a second call to the now-deprecated /links/stats. ?fields=a,b,c returns a sparse item.',
      tags: ['links'],
      summary: 'List share links (own, or scoped to a conversation)',
      querystring: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'Scope the listing to one conversation the caller is a member of' },
          mine: { type: 'string', enum: ['true', 'false'], description: 'With conversationId: force "my links only" even for a moderator' },
          cursor: { type: 'string', description: 'Opaque keyset cursor — the `id` of the last item of the previous page' },
          offset: { type: 'number', minimum: 0, default: 0, description: 'Legacy offset pagination (kept for iOS/Android backward compatibility)' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50, description: 'Maximum number of links to return' },
          expand: { type: 'string', description: 'Comma-separated: conversation,creator,policy' },
          include: { type: 'string', description: 'Comma-separated: summary' },
          fields: { type: 'string', description: 'Comma-separated sparse fieldset on each item' }
        }
      },
      response: {
        200: {
          description: 'Share links retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  linkId: { type: 'string' },
                  identifier: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  currentUses: { type: 'number' },
                  maxUses: { type: 'number', nullable: true },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  conversationTitle: { type: 'string', nullable: true },
                  conversation: {
                    type: 'object',
                    nullable: true,
                    description: 'Present only when ?expand includes "conversation"',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string', nullable: true },
                      type: { type: 'string' },
                      description: { type: 'string', nullable: true }
                    }
                  },
                  creator: {
                    type: 'object',
                    nullable: true,
                    description: 'Present only when ?expand includes "creator"',
                    properties: {
                      id: { type: 'string' },
                      username: { type: 'string' },
                      firstName: { type: 'string', nullable: true },
                      lastName: { type: 'string', nullable: true },
                      displayName: { type: 'string', nullable: true },
                      avatar: { type: 'string', nullable: true }
                    }
                  },
                  // Présents uniquement avec ?expand=policy — un troisième
                  // volet, en plus des deux nommés au critère 1 de #4170
                  // (conversation,creator) : ce sont des colonnes scalaires
                  // du lien lui-même, déjà chargées pour tout appelant
                  // (aucun `select` ne les exclut), jamais une jointure
                  // supplémentaire. `conversation-links-section.tsx` (web)
                  // en a besoin pour sa popover de détails.
                  description: { type: 'string', nullable: true },
                  maxConcurrentUsers: { type: 'number', nullable: true },
                  currentConcurrentUsers: { type: 'number' },
                  maxUniqueSessions: { type: 'number', nullable: true },
                  currentUniqueSessions: { type: 'number' },
                  allowAnonymousMessages: { type: 'boolean' },
                  allowAnonymousFiles: { type: 'boolean' },
                  allowAnonymousImages: { type: 'boolean' },
                  allowViewHistory: { type: 'boolean' },
                  requireAccount: { type: 'boolean' },
                  requireNickname: { type: 'boolean' },
                  requireEmail: { type: 'boolean' },
                  requireBirthday: { type: 'boolean' },
                  allowedCountries: { type: 'array', items: { type: 'string' } },
                  allowedLanguages: { type: 'array', items: { type: 'string' } },
                  allowedIpRanges: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                offset: { type: 'number' },
                limit: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            },
            cursorPagination: {
              type: 'object',
              description: 'La forme CIBLE de pagination — offset reste accepté (ci-dessus) tant que iOS/Android ne l\'ont pas adopté (packages/MeeshySDK et apps/android hors territoire de ce lot).',
              properties: {
                limit: { type: 'number' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true }
              }
            },
            meta: {
              type: 'object',
              description: 'Absent quand rien n\'a été calculé — jamais un objet vide.',
              properties: {
                viewerIsModerator: {
                  type: 'boolean',
                  description: 'Présent uniquement avec ?conversationId : le lecteur voit-il TOUS les liens de la conversation ?'
                },
                summary: {
                  type: 'object',
                  description: 'Présent uniquement avec ?include=summary. Agrégats RÉELS (#4170 critère 3) — aucun champ non mesurable.',
                  properties: {
                    totalLinks: { type: 'number' },
                    activeLinks: { type: 'number' },
                    totalUses: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        403: {
          description: 'Registered user required, or not a member of the requested conversation',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const platformRole = request.authContext.registeredUser?.role;
      // `UnifiedAuthRequest.query` est `unknown` — le générique `Querystring`
      // posé sur `fastify.get<{Querystring: ListLinksQuery}>` ci-dessus est le
      // contrat RÉEL (Fastify + AJV le valident à l'entrée) ; cette assertion
      // ne fait que le faire connaître au type large et partagé de la requête
      // authentifiée, unique au site d'appel — même idiome que
      // `(request.query as any).offset` qu'elle remplace, en évitant `any`.
      const query = request.query as ListLinksQuery;

      // SSOT guard: `?limit`/`?offset` are plain strings, so a malformed value
      // would otherwise reach Prisma as `take: NaN`/negative → HTTP 500.
      const { limit, offset } = validatePagination(query.offset, query.limit, { defaultLimit: 50, maxLimit: 100 });

      const conversationId = typeof query.conversationId === 'string' && query.conversationId.length > 0
        ? query.conversationId
        : null;

      let viewerIsModerator: boolean | undefined;
      let where: Record<string, unknown> = { createdBy: userId };

      if (conversationId !== null) {
        // Un membre non-modérateur reçoit 200 et SES PROPRES liens — jamais un
        // 500. `creatorId` (la colonne inexistante que la porte fautive lisait)
        // n'apparaît nulle part ici : la colonne réelle est `createdBy`.
        const membership = await fastify.prisma.participant.findFirst({
          where: { conversationId, userId, isActive: true },
          select: { role: true }
        });

        if (!membership) {
          return sendForbidden(reply, 'Vous devez être membre de cette conversation pour voir ses liens de partage');
        }

        viewerIsModerator = actorHasMinimumRole(
          { conversationRole: membership.role, platformRole },
          MemberRole.MODERATOR,
        );

        const forceMineOnly = query.mine === 'true' || !viewerIsModerator;
        where = forceMineOnly ? { conversationId, createdBy: userId } : { conversationId };
      }

      const expand = new Set(
        typeof query.expand === 'string' ? query.expand.split(',').map(s => s.trim()).filter(Boolean) : []
      );
      const includeSet = new Set(
        typeof query.include === 'string' ? query.include.split(',').map(s => s.trim()).filter(Boolean) : []
      );
      const requestedFields = typeof query.fields === 'string'
        ? new Set(query.fields.split(',').map(s => s.trim()).filter(Boolean))
        : null;

      // Curseur keyset : opaque pour l'appelant, c'est l'`id` du dernier lien
      // de la page précédente. Recherché SANS le `where` courant — un curseur
      // reste valable même si le lecteur change de filtre entre deux pages,
      // et une date de création n'est pas une donnée sensible à protéger par
      // le filtre. `skip`/`cursor` Prisma natifs, jamais un décalage recalculé
      // à la main (même idiome que `conversations/core.ts` pour `beforeCursor`).
      let cursorCreatedAt: Date | null = null;
      if (typeof query.cursor === 'string' && query.cursor.length > 0) {
        const cursorRow = await fastify.prisma.conversationShareLink.findFirst({
          where: { id: query.cursor },
          select: { createdAt: true }
        });
        cursorCreatedAt = cursorRow?.createdAt ?? null;
      }
      const usingCursor = cursorCreatedAt !== null;
      const findManyWhere = usingCursor ? { ...where, createdAt: { lt: cursorCreatedAt } } : where;

      // `conversation` (pour `conversationTitle`, toujours servi) et `creator`
      // sont chargés SANS CONDITION — deux jointures indexées bon marché — et
      // `expand` décide seulement de ce qui est RECOPIÉ dans la réponse, pas de
      // ce qui est chargé. Conditionner le `include` Prisma lui-même sur un
      // booléen d'exécution rend le type de retour de `findMany` dépendant
      // d'une union que TypeScript ne peut pas réduire au site d'appel — cette
      // forme-ci reste un unique type stable, sans assertion.
      const [links, total, summary] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where: findManyWhere,
          orderBy: { createdAt: 'desc' },
          ...(usingCursor ? {} : { skip: offset }),
          take: limit,
          include: {
            conversation: { select: { id: true, title: true, type: true, description: true } },
            creator: {
              select: { id: true, username: true, firstName: true, lastName: true, displayName: true, avatar: true }
            }
          },
        }),
        fastify.prisma.conversationShareLink.count({ where }),
        includeSet.has('summary') ? computeShareLinksSummary(fastify, where) : Promise.resolve(null),
      ]);

      const mapped: LinkItem[] = links.map((l) => {
        const enriched: LinkItem = { ...mapBaseLinkItem(l) };
        if (expand.has('conversation') && l.conversation) {
          enriched.conversation = {
            id: l.conversation.id,
            title: l.conversation.title,
            type: l.conversation.type,
            description: l.conversation.description ?? null,
          };
        }
        if (expand.has('creator')) {
          enriched.creator = l.creator;
        }
        if (expand.has('policy')) {
          Object.assign(enriched, mapPolicyFields(l));
        }
        if (!requestedFields || requestedFields.size === 0) return enriched;
        return Object.fromEntries(
          Object.entries(enriched).filter(([key]) => requestedFields.has(key))
        );
      });

      const pagination = createPaginationMeta(total, offset, limit, links.length);
      const cursorPagination = buildCursorPaginationMeta(
        limit,
        links.length,
        links.length > 0 ? (links[links.length - 1] as { id: string }).id : null
      );

      const meta: Record<string, unknown> = {};
      if (viewerIsModerator !== undefined) meta.viewerIsModerator = viewerIsModerator;
      if (summary !== null) meta.summary = summary;

      // `sendPaginatedSuccess`/`sendSuccess` typent `meta` sur `ResponseMeta`
      // (`packages/shared/types/api-responses.ts`), un contrat FERMÉ qui ne
      // connaît ni `viewerIsModerator` ni `summary` — l'élargir est un
      // carrefour hors territoire de ce lot. La réponse est composée à la
      // main, comme `conversations/core.ts` le fait déjà pour la même raison
      // (son commentaire : « response includes top-level pagination and
      // cursorPagination fields… migration to sendSuccess requires a
      // coordinated client update »). Le schéma JSON ci-dessus, pas ce
      // commentaire, gouverne ce qui part réellement sur le fil.
      return reply.send({
        success: true,
        data: mapped,
        pagination,
        cursorPagination,
        ...(Object.keys(meta).length > 0 && { meta }),
      });
    } catch (error) {
      logError(fastify.log, 'List share links error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  /**
   * GET /links/stats — Statistiques agrégées des liens de partage de l'utilisateur
   *
   * #4170 — ALIAS DÉPRÉCIÉ. `GET /links?include=summary` absorbe cet appel et
   * rend le MÊME calcul (`computeShareLinksSummary`, ci-dessus) sans second
   * aller-retour. Gardée VIVANTE, comportement et forme INCHANGÉS : iOS
   * (`ShareLinkService.fetchMyStats` → `MyShareLinkStats`) ET Android
   * (`LinkApi.fetchMyStats` → `MyShareLinkStats`) l'appellent tous les deux
   * aujourd'hui — ni l'un ni l'autre n'est dans le territoire de ce lot, donc
   * aucun des deux ne migre ici. Le retrait suit le compteur de #4275.
   */
  fastify.get('/links/stats', {
    onRequest: [authRequired, depreciee({ depuis: '2026-08-29', successeur: '/api/v1/links?include=summary' })],
    schema: {
      description: 'Get aggregated statistics for all share links created by the authenticated user. Returns total link counts, active link counts, and total usage.',
      tags: ['links'],
      summary: 'Get user share link stats',
      response: {
        200: {
          description: 'Statistics retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                totalLinks: { type: 'number', description: 'Total number of share links created by user' },
                activeLinks: { type: 'number', description: 'Number of currently active links' },
                totalUses: { type: 'number', description: 'Sum of all uses across user links' }
              }
            }
          }
        },
        403: {
          description: 'Registered user required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const summary = await computeShareLinksSummary(fastify, { createdBy: userId });

      return sendSuccess(reply, summary);
    } catch (error) {
      logError(fastify.log, 'Get user share link stats error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
