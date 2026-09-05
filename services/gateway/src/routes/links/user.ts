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
import {
  parseFieldList,
  parseTokenSet,
  restrictFields,
  selectForFields,
  type ColumnPlan,
} from '../../utils/sparse-fieldset';
import { apiPath } from '@meeshy/shared/api/prefix';

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
  q?: string;
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

/** Les trois volets d'`?expand=`, et l'unique jeton d'`?include=`. */
type LinkExpansion = 'conversation' | 'creator' | 'policy';
const LINK_EXPANSIONS: readonly LinkExpansion[] = ['conversation', 'creator', 'policy'] as const;
const LINK_INCLUSIONS = ['summary'] as const;

/** Les dix clés du SOCLE — celles que `mapBaseLinkItem` compose, toujours servies. */
const CLES_SOCLE = [
  'id',
  'linkId',
  'identifier',
  'name',
  'isActive',
  'currentUses',
  'maxUses',
  'expiresAt',
  'createdAt',
  'conversationTitle',
] as const;

/** Les seize clés de POLICE — celles que `mapPolicyFields` compose sur `?expand=policy`. */
const CLES_POLICE = [
  'description',
  'maxConcurrentUsers',
  'currentConcurrentUsers',
  'maxUniqueSessions',
  'currentUniqueSessions',
  'allowAnonymousMessages',
  'allowAnonymousFiles',
  'allowAnonymousImages',
  'allowViewHistory',
  'requireAccount',
  'requireNickname',
  'requireEmail',
  'requireBirthday',
  'allowedCountries',
  'allowedLanguages',
  'allowedIpRanges',
] as const;

/**
 * Tout ce qu'un lien PEUT porter — le littéral que {@link linkPlan} projette.
 *
 * La requête posait auparavant un `include` : Prisma y charge TOUS les
 * scalaires de la table, et les deux jointures étaient inconditionnelles.
 * `creator` partait ainsi pour cent pour cent des appelants et n'était recopiée
 * que pour ceux qui la nomment — c'est-à-dire presque personne (#4356).
 */
const COLONNES_LIEN = {
  id: true,
  linkId: true,
  identifier: true,
  name: true,
  isActive: true,
  currentUses: true,
  maxUses: true,
  expiresAt: true,
  createdAt: true,
  description: true,
  maxConcurrentUsers: true,
  currentConcurrentUsers: true,
  maxUniqueSessions: true,
  currentUniqueSessions: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: true,
  allowAnonymousImages: true,
  allowViewHistory: true,
  requireAccount: true,
  requireNickname: true,
  requireEmail: true,
  requireBirthday: true,
  allowedCountries: true,
  allowedLanguages: true,
  allowedIpRanges: true,
  conversation: { select: { id: true, title: true, type: true, description: true } },
  creator: {
    select: { id: true, username: true, firstName: true, lastName: true, displayName: true, avatar: true },
  },
} as const;

/**
 * Ce que chaque clé SERVIE coûte en colonnes.
 *
 * `id` et `createdAt` sont ÉPINGLÉS pour des raisons qui ne sont pas de
 * projection : l'`id` est le CURSEUR de la page suivante
 * (`buildCursorPaginationMeta`), et `createdAt` porte le tri ET l'appel
 * inconditionnel `.toISOString()` de `mapBaseLinkItem`. Les retirer sur un
 * `?fields=` qui ne les nomme pas casserait la pagination, pas la charge utile.
 *
 * `conversationTitle` est la seule clé DÉRIVÉE : elle vient de la jointure, pas
 * d'une colonne du lien. Les seize clés de police et les huit autres du socle
 * se produisent elles-mêmes.
 */
const linkPlan: ColumnPlan<typeof COLONNES_LIEN> = {
  full: COLONNES_LIEN,
  pinned: ['id', 'createdAt'],
  columns: { conversationTitle: ['conversation'] },
};

/**
 * Ce que la requête doit CHARGER pour la page demandée.
 *
 * Le calcul suit exactement l'ordre du gestionnaire — socle, puis expansions,
 * puis `fields` — parce que sur cette route `fields` s'applique APRÈS `expand`
 * (contrat #4170) : un bloc qui ne survivra pas au filtre n'a aucune raison
 * d'être chargé. La liste rendue n'est JAMAIS `null` : sans paramètre, elle
 * vaut les dix clés du socle, et c'est précisément ce qui allège le chemin
 * nominal sans rien changer à ce qu'il sert.
 */
function clesServies(
  expand: ReadonlySet<LinkExpansion>,
  fields: ReadonlySet<string> | null
): ReadonlySet<string> {
  const servies = new Set<string>(CLES_SOCLE);
  if (expand.has('conversation')) servies.add('conversation');
  if (expand.has('creator')) servies.add('creator');
  if (expand.has('policy')) for (const cle of CLES_POLICE) servies.add(cle);
  if (fields === null) return servies;
  return new Set([...servies].filter((cle) => fields.has(cle)));
}

/**
 * Une ligne telle que la requête PROJETÉE la rend.
 *
 * Tout est optionnel sauf les deux colonnes épinglées : c'est la contrepartie
 * exacte de la réduction, et le typage le dit plutôt que de le taire. Les deux
 * mappeurs ci-dessous lisaient déjà chaque champ avec `?? null` ou `?.` — ce
 * qu'ils composent pour une colonne absente est ensuite retiré par le MÊME
 * `fields` qui l'a fait sauter du `select`.
 */
type LinkRow = {
  id: string;
  createdAt: Date;
  linkId?: string;
  identifier?: string;
  name?: string | null;
  isActive?: boolean;
  currentUses?: number;
  maxUses?: number | null;
  expiresAt?: Date | null;
  conversation?: { id?: string; title?: string | null; type?: string; description?: string | null } | null;
  creator?: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    avatar: string | null;
  } | null;
} & Partial<Record<(typeof CLES_POLICE)[number], unknown>>;

/**
 * Le mapping DE BASE — identique, champ pour champ, à ce que `GET /links`
 * rendait avant ce lot. iOS (`MyShareLink`, `ShareLinkModels.swift:216`) et
 * Android (`MyShareLink`, `ShareLink.kt:172`) le décodent tous deux
 * aujourd'hui via `?offset=&limit=` : y toucher casse deux clients qu'aucun
 * autre agent de ce lot ne peut mettre à jour. `expand`/`fields` n'ajoutent
 * ou ne retirent donc jamais rien à CE socle, ils l'augmentent ou le filtrent
 * par-dessus.
 */
function mapBaseLinkItem(l: LinkRow): LinkItem {
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
 * Toutes des colonnes SCALAIRES de `ConversationShareLink`. Elles étaient
 * chargées pour CHAQUE appelant — `findMany` posait un `include`, qui ramène
 * tous les scalaires de la table — et `?expand=policy` ne décidait que de ce
 * qui était RECOPIÉ. Depuis #4356 le volet décide aussi de ce qui est CHARGÉ :
 * seize colonnes que personne ne demandait ne quittent plus la base.
 * `conversation-links-section.tsx` (web) est le premier consommateur :
 * la popover de détails d'un lien y affiche permissions et restrictions, que
 * `GET /conversations/:conversationId/links` rendait déjà (avant #4170) mais
 * dont le schéma OpenAPI ne déclarait qu'un sous-ensemble étroit — servies
 * ici en entier, déclarées en entier (voir le schéma de réponse plus bas).
 */
function mapPolicyFields(l: LinkRow): LinkItem {
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
      description: 'List share links. Without conversationId: the authenticated user\'s own links, globally. With conversationId: the links of that conversation — a moderator sees all of them, a regular member only their own (unless ?mine=true forces the narrower view for everyone). ?q=text filters on name OR identifier (case-insensitive substring), composed with the scope above — it never widens what the route already serves. Supports offset pagination (legacy, still used by iOS/Android) and cursor pagination (?cursor=<linkId>, the forward-looking form — offset stays accepted for backward compatibility, it is not removed). ?expand=conversation,creator,policy adds the corresponding fields (policy = permissions/restrictions, already-loaded scalar columns, no extra query); ?include=summary adds real (never fabricated) aggregates in meta.summary, sparing a second call to the now-deprecated /links/stats. ?fields=a,b,c returns a sparse item.',
      tags: ['links'],
      summary: 'List share links (own, or scoped to a conversation)',
      querystring: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'Scope the listing to one conversation the caller is a member of' },
          mine: { type: 'string', enum: ['true', 'false'], description: 'With conversationId: force "my links only" even for a moderator' },
          q: { type: 'string', description: 'Case-insensitive substring filter on name OR identifier — composes with the scope above, never widens it' },
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
              description: 'La forme CIBLE de pagination. UNE SEULE des deux formes est servie par réponse (#4351) : `?cursor=` rend `cursorPagination` seul, `?offset=` (ou rien) rend `pagination` seul. `?offset=` reste accepté — Android le déclare (LinkApi.listMyLinks) — mais les deux objets ne cohabitent plus dans un même corps.',
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

      // #4962 — `q` se compose APRÈS le scope ci-dessus, une seule fois,
      // plutôt que d'être ajouté dans chacune des deux branches : la même
      // clause s'applique donc identiquement que l'appelant filtre par
      // conversation ou non, sans jumelle à tenir synchronisée. `name` et
      // `identifier` sont les deux colonnes qu'un lecteur reconnaît, déjà
      // chargées — aucune jointure supplémentaire. Un `q` ne retire jamais
      // le filtre d'appartenance déjà posé sur `where` : il s'AJOUTE en `AND`
      // implicite (clé `OR` à côté des clés déjà présentes), il ne le remplace
      // jamais.
      const q = typeof query.q === 'string' && query.q.trim().length > 0 ? query.q.trim() : null;
      if (q !== null) {
        where = {
          ...where,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { identifier: { contains: q, mode: 'insensitive' } },
          ],
        };
      }

      // Trois `new Set` écrits en ligne vivaient ici, avec trois bornes
      // légèrement différentes des trois autres analyseurs du dépôt. La
      // grammaire est désormais UNE (`utils/sparse-fieldset.ts`, #4356) ; ce
      // fichier ne garde que son VOCABULAIRE — et `expand`/`include` le
      // déclarent enfin, là où un `new Set` nu acceptait n'importe quoi.
      const expand = parseTokenSet(query.expand, LINK_EXPANSIONS);
      const includeSet = parseTokenSet(query.include, LINK_INCLUSIONS);
      const requestedFields = parseFieldList(query.fields);

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

      // La requête charge ce que la PAGE va servir, et rien d'autre (#4356).
      // Elle posait un `include` : Prisma y ramène tous les scalaires de la
      // table, et les deux jointures partaient sans condition — `creator` pour
      // cent pour cent des appelants, recopiée pour ceux qui la nomment.
      //
      // L'objection historique à un `include` conditionnel — « le type de
      // retour de `findMany` dépendrait d'une union que TypeScript ne peut pas
      // réduire au site d'appel » — tombe avec un `select` calculé et un type
      // de LIGNE déclaré (`LinkRow`) : le type est stable, et il dit la vérité
      // sur ce qui peut manquer, au lieu de promettre des colonnes que la
      // projection ne demande plus.
      const select = selectForFields(linkPlan, clesServies(expand, requestedFields));

      // #4351 / #4175 — le `count()` ne part QUE si la réponse va servir un
      // `total`. Il partait sur CHAQUE appel, curseur compris, pour alimenter
      // un champ que la pagination par curseur ne porte pas : un comptage de
      // toute la collection payé à chaque page pour être jeté. Un curseur
      // n'a pas besoin de savoir combien il reste — c'est même ce qui le rend
      // stable sous insertion.
      const [links, total, summary] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where: findManyWhere,
          orderBy: { createdAt: 'desc' },
          ...(usingCursor ? {} : { skip: offset }),
          take: limit,
          select,
        }),
        usingCursor
          ? Promise.resolve(null)
          : fastify.prisma.conversationShareLink.count({ where }),
        includeSet.has('summary') ? computeShareLinksSummary(fastify, where) : Promise.resolve(null),
      ]);

      const mapped: LinkItem[] = (links as unknown as LinkRow[]).map((l) => {
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
        // Aucune clé n'est ÉPINGLÉE à la sortie : `?fields=description` rend
        // `{description}` seul, comme avant #4356. L'épinglage du plan gouverne
        // ce qui est CHARGÉ (l'`id` du curseur, `createdAt`), jamais ce qui est
        // SERVI — les deux questions sont distinctes et le restent.
        return restrictFields(enriched, requestedFields);
      });

      // #4351 critère 3 — UNE seule forme de pagination PAR RÉPONSE.
      //
      // La réponse portait les deux objets, toujours, côte à côte : un
      // appelant ne pouvait pas savoir lequel faisait foi, et deux clients
      // pouvaient paginer la même adresse par deux mécanismes différents sans
      // que rien ne le signale. Ce que la fusion devait supprimer, ce n'est
      // pas le SUPPORT de l'offset — `?offset=` reste accepté, Android le
      // déclare (`LinkApi.listMyLinks`) — c'est la COHABITATION dans un même
      // corps.
      //
      // La forme servie suit donc celle qui a été DEMANDÉE : `?cursor=` rend
      // `cursorPagination` seul, `?offset=` (ou rien) rend `pagination` seul.
      // Retirer `pagination` inconditionnellement aurait tronqué en silence la
      // liste du web, qui lit `data.pagination?.hasMore` pour son bouton
      // « charger plus » (`apps/web/app/links/page.tsx`) — mesuré avant, et
      // c'est pourquoi le web migre vers le curseur dans le même lot.
      const pagination = usingCursor
        ? undefined
        : createPaginationMeta(total ?? 0, offset, limit, links.length);
      const cursorPagination = usingCursor
        ? buildCursorPaginationMeta(
            limit,
            links.length,
            links.length > 0 ? (links[links.length - 1] as { id: string }).id : null
          )
        : undefined;

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
        ...(pagination ? { pagination } : {}),
        ...(cursorPagination ? { cursorPagination } : {}),
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
    onRequest: [authRequired, depreciee({ depuis: '2026-08-29', successeur: apiPath('/links?include=summary') })],
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
