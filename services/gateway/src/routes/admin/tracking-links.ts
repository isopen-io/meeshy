/**
 * Les liens de suivi vus par l'administration (#8876, § 6.3) : la liste, la
 * fiche avec ses agrégats, et le geste d'activation.
 *
 * ## Pourquoi sous `/admin`
 *
 * `routes/tracking-links/` sert le PARTAGEUR (ses liens, ses clics). Un
 * administrateur répond à une autre question — « quelles campagnes tournent, qui
 * les a posées, que rapportent-elles » — sur les liens de TOUS. Les tenir sous
 * `/admin` évite d'élargir le motif du service worker (qui ne met jamais
 * `/admin` en cache) et range la porte avec les autres.
 *
 * ## Les portes
 *
 * Lecture : `canAccessAdmin` ET `canViewAnalytics` — BIGBOSS, ADMIN, AUDIT.
 * Écriture : la même lecture PLUS `requireAdminRank()` (BIGBOSS, ADMIN). AUDIT est
 * un rôle de LECTURE : qu'il voie les campagnes ne l'autorise pas à en fermer une.
 *
 * ## Ce qui part à côté
 *
 * Une ligne de clic porte une quarantaine de colonnes — l'IP du visiteur, son
 * user-agent, son empreinte d'appareil, sa télémétrie navigateur. La fiche en sert
 * DIX, nommées dans le `select`, et le schéma de réponse les nomme aussi : ce qui
 * n'est pas demandé ne peut pas partir. Les agrégats viennent de
 * `TrackingLinkService.getTrackingLinkStats` (une agrégation MongoDB, jamais une
 * ligne par clic).
 *
 * ## Noms
 *
 * Le créateur, la conversation et la cible sont nommés par lot — une requête par
 * genre, jamais une par ligne. Un lien externe n'a pas de cible (`null`) ; une
 * cible disparue est servie avec `label: null`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { requireAdminRank, requirePermission, withAudit } from '../../middleware/authorize';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { validatePagination } from '../../utils/pagination';
import { logError } from '../../utils/logger';
import { sendInternalError, sendNotFound, sendPaginatedSuccess, sendSuccess } from '../../utils/response';
import { distinctObjectIds, loadAdminPeople, personLabel, type AdminPersonRef } from './oversight-people';
import {
  booleen,
  chaine,
  chaineNulle,
  dateNulle,
  dateServie,
  enveloppe,
  enveloppePaginee,
  nombre,
  personneSchema,
  reponsesEnErreur,
} from './oversight-schemas';
import { adminViewer } from './oversight-viewer';

const TARGET_TYPES = ['POST', 'REEL', 'STORY', 'STATUS', 'CONVERSATION', 'PROFILE', 'EXTERNAL'] as const;
const POST_TARGET_TYPES: ReadonlySet<string> = new Set(['POST', 'REEL', 'STORY', 'STATUS']);
const SORT_KEYS = ['createdAt', 'totalClicks', 'uniqueClicks', 'lastClickedAt'] as const;
type SortKey = (typeof SORT_KEYS)[number];

const RECENT_CLICKS = 20;
const TOP_BUCKETS = 20;
const TOP_REFERRERS = 10;

type ListQuery = {
  offset?: string;
  limit?: string;
  search?: string;
  isActive?: 'true' | 'false';
  targetType?: (typeof TARGET_TYPES)[number];
  createdBy?: string;
  source?: string;
  campaign?: string;
  sort?: SortKey;
  order?: 'asc' | 'desc';
};

const ROW_SELECT = {
  id: true,
  token: true,
  name: true,
  campaign: true,
  source: true,
  medium: true,
  originalUrl: true,
  shortUrl: true,
  targetType: true,
  targetId: true,
  conversationId: true,
  createdBy: true,
  totalClicks: true,
  uniqueClicks: true,
  isActive: true,
  expiresAt: true,
  lastClickedAt: true,
  createdAt: true,
} satisfies Prisma.TrackingLinkSelect;

/** Les dix colonnes d'un clic que la console lit — jamais IP, user-agent, empreinte, participant. */
const CLICK_SELECT = {
  id: true,
  country: true,
  city: true,
  device: true,
  browser: true,
  os: true,
  referrer: true,
  socialSource: true,
  redirectStatus: true,
  clickedAt: true,
} satisfies Prisma.TrackingLinkClickSelect;

type LinkRow = Prisma.TrackingLinkGetPayload<{ select: typeof ROW_SELECT }>;

const clean = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
};

function buildWhere(query: ListQuery): Prisma.TrackingLinkWhereInput {
  const search = (query.search ?? '').trim();
  const clauses: Prisma.TrackingLinkWhereInput[] = [
    ...(search !== ''
      ? [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { token: { contains: search, mode: 'insensitive' as const } },
              { originalUrl: { contains: search, mode: 'insensitive' as const } },
              { campaign: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        ]
      : []),
    ...(query.isActive ? [{ isActive: query.isActive === 'true' }] : []),
    ...(query.targetType ? [{ targetType: query.targetType }] : []),
    ...(query.createdBy ? [{ createdBy: query.createdBy }] : []),
    ...(query.source ? [{ source: { equals: query.source, mode: 'insensitive' as const } }] : []),
    ...(query.campaign ? [{ campaign: { equals: query.campaign, mode: 'insensitive' as const } }] : []),
  ];
  return clauses.length === 0 ? {} : { AND: clauses };
}

const targetIds = (rows: readonly LinkRow[], predicate: (type: string) => boolean): string[] =>
  distinctObjectIds(rows.filter((row) => predicate(row.targetType)).map((row) => row.targetId));

type Named = {
  readonly people: ReadonlyMap<string, AdminPersonRef>;
  readonly postAuthors: ReadonlyMap<string, string>;
  readonly conversations: ReadonlyMap<string, string | null>;
};

/** Les noms de toute une page, en trois requêtes au plus — comptes, publications, conversations. */
async function loadNames(prisma: PrismaClient, rows: readonly LinkRow[]): Promise<Named> {
  const postIds = targetIds(rows, (type) => POST_TARGET_TYPES.has(type));
  const conversationIds = distinctObjectIds([
    ...targetIds(rows, (type) => type === 'CONVERSATION'),
    ...rows.map((row) => row.conversationId),
  ]);

  const [people, posts, conversations] = await Promise.all([
    loadAdminPeople(prisma, [...rows.map((row) => row.createdBy), ...targetIds(rows, (type) => type === 'PROFILE')]),
    postIds.length === 0
      ? Promise.resolve([])
      : prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, author: { select: { displayName: true, username: true } } },
          take: postIds.length,
        }),
    conversationIds.length === 0
      ? Promise.resolve([])
      : prisma.conversation.findMany({
          where: { id: { in: conversationIds } },
          select: { id: true, title: true },
          take: conversationIds.length,
        }),
  ]);

  return {
    people,
    postAuthors: new Map(posts.map((post) => [post.id, personLabel(post.author).label])),
    conversations: new Map(conversations.map((conversation) => [conversation.id, clean(conversation.title)])),
  };
}

const personName = (people: ReadonlyMap<string, AdminPersonRef>, id: string): string | null => {
  const person = people.get(id);
  return person ? personLabel(person).label : null;
};

function targetLabel(row: LinkRow & { targetId: string }, names: Named): string | null {
  if (POST_TARGET_TYPES.has(row.targetType)) return names.postAuthors.get(row.targetId) ?? null;
  if (row.targetType === 'CONVERSATION') return names.conversations.get(row.targetId) ?? null;
  if (row.targetType === 'PROFILE') return personName(names.people, row.targetId);
  return null;
}

function serveTarget(row: LinkRow, names: Named): { type: string; id: string; label: string | null } | null {
  if (row.targetType === 'EXTERNAL' || !row.targetId) return null;
  return { type: row.targetType, id: row.targetId, label: targetLabel({ ...row, targetId: row.targetId }, names) };
}

function serveRow(row: LinkRow, names: Named) {
  return {
    id: row.id,
    token: row.token,
    name: clean(row.name),
    campaign: clean(row.campaign),
    source: clean(row.source),
    medium: clean(row.medium),
    originalUrl: row.originalUrl,
    shortUrl: row.shortUrl,
    targetType: row.targetType,
    target: serveTarget(row, names),
    conversation: row.conversationId
      ? { id: row.conversationId, title: names.conversations.get(row.conversationId) ?? null }
      : null,
    creator: row.createdBy ? (names.people.get(row.createdBy) ?? null) : null,
    totalClicks: row.totalClicks,
    uniqueClicks: row.uniqueClicks,
    isActive: row.isActive,
    expiresAt: row.expiresAt,
    lastClickedAt: row.lastClickedAt,
    createdAt: row.createdAt,
  };
}

const byCountDesc = <T extends { count: number }>(left: T, right: T): number => right.count - left.count;

const toBuckets = (record: Record<string, number>, limit: number = TOP_BUCKETS) =>
  Object.entries(record)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => byCountDesc(left, right) || left.key.localeCompare(right.key))
    .slice(0, limit);

const rowSchema = {
  type: 'object',
  properties: {
    id: chaine,
    token: chaine,
    name: chaineNulle,
    campaign: chaineNulle,
    source: chaineNulle,
    medium: chaineNulle,
    originalUrl: chaine,
    shortUrl: chaine,
    targetType: chaine,
    target: {
      type: 'object',
      nullable: true,
      properties: { type: chaine, id: chaine, label: chaineNulle },
    },
    conversation: {
      type: 'object',
      nullable: true,
      properties: { id: chaine, title: chaineNulle },
    },
    creator: personneSchema,
    totalClicks: nombre,
    uniqueClicks: nombre,
    isActive: booleen,
    expiresAt: dateNulle,
    lastClickedAt: dateNulle,
    createdAt: dateServie,
  },
} as const;

const bucketsSchema = {
  type: 'array',
  items: { type: 'object', properties: { key: chaine, count: nombre } },
} as const;

const detailSchema = {
  type: 'object',
  properties: {
    ...rowSchema.properties,
    stats: {
      type: 'object',
      properties: {
        confirmedClicks: nombre,
        clicksByDate: { type: 'array', items: { type: 'object', properties: { date: chaine, count: nombre } } },
        byCountry: bucketsSchema,
        byDevice: bucketsSchema,
        byBrowser: bucketsSchema,
        byOs: bucketsSchema,
        bySocialSource: bucketsSchema,
        topReferrers: { type: 'array', items: { type: 'object', properties: { referrer: chaine, count: nombre } } },
        byRedirectStatus: bucketsSchema,
      },
    },
    recentClicks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: chaine,
          country: chaineNulle,
          city: chaineNulle,
          device: chaineNulle,
          browser: chaineNulle,
          os: chaineNulle,
          referrer: chaineNulle,
          socialSource: chaineNulle,
          redirectStatus: chaineNulle,
          clickedAt: dateServie,
        },
      },
    },
  },
} as const;

const linkParams = {
  type: 'object',
  required: ['linkId'],
  properties: { linkId: { type: 'string', pattern: OBJECT_ID_PATTERN } },
} as const;

export function registerTrackingLinkAdminRoutes(fastify: FastifyInstance): void {
  const service = new TrackingLinkService(fastify.prisma);
  const readGuards = [
    fastify.authenticate,
    requirePermission('canAccessAdmin'),
    requirePermission('canViewAnalytics'),
  ];

  fastify.get(
    '/tracking-links',
    {
      onRequest: readGuards,
      schema: {
        description:
          'Liste les liens de suivi de la plateforme, nommés (créateur, conversation, cible). canAccessAdmin + canViewAnalytics. #8876.',
        tags: ['admin'],
        summary: 'List tracking links (admin)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            offset: { type: 'string' },
            limit: { type: 'string' },
            search: { type: 'string', maxLength: 100, description: 'Nom, jeton, URL ou campagne' },
            isActive: { type: 'string', enum: ['true', 'false'] },
            targetType: { type: 'string', enum: [...TARGET_TYPES] },
            createdBy: { type: 'string', pattern: OBJECT_ID_PATTERN },
            source: { type: 'string', maxLength: 100 },
            campaign: { type: 'string', maxLength: 100 },
            sort: { type: 'string', enum: [...SORT_KEYS] },
            order: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
        response: { 200: enveloppePaginee(rowSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as ListQuery;
        const { offset, limit } = validatePagination(query.offset, query.limit);
        const where = buildWhere(query);
        const direction = query.order === 'asc' ? 'asc' : 'desc';
        const sort: SortKey = query.sort ?? 'createdAt';

        const [rows, total] = await Promise.all([
          fastify.prisma.trackingLink.findMany({
            where,
            select: ROW_SELECT,
            orderBy: [{ [sort]: direction }, { id: direction }],
            skip: offset,
            take: limit,
          }),
          fastify.prisma.trackingLink.count({ where }),
        ]);

        const names = await loadNames(fastify.prisma, rows);
        return sendPaginatedSuccess(
          reply,
          rows.map((row) => serveRow(row, names)),
          { total, limit, offset, hasMore: offset + rows.length < total }
        );
      } catch (error) {
        logError(fastify.log, 'List admin tracking links error:', error);
        return sendInternalError(reply, 'Erreur lors de la lecture des liens de suivi');
      }
    }
  );

  fastify.get(
    '/tracking-links/:linkId',
    {
      onRequest: readGuards,
      schema: {
        description:
          "La fiche d'un lien de suivi : la ligne nommée, ses agrégats de clics et ses vingt derniers clics — sans IP, user-agent ni empreinte. #8876.",
        tags: ['admin'],
        summary: 'Get one tracking link with its statistics (admin)',
        security: [{ bearerAuth: [] }],
        params: linkParams,
        response: { 200: enveloppe(detailSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { linkId } = request.params as { linkId: string };
        const row = await fastify.prisma.trackingLink.findUnique({ where: { id: linkId }, select: ROW_SELECT });
        if (!row) return sendNotFound(reply, 'Lien de suivi introuvable');

        const [names, stats, recentClicks, byRedirectStatus] = await Promise.all([
          loadNames(fastify.prisma, [row]),
          service.getTrackingLinkStats(row.token),
          fastify.prisma.trackingLinkClick.findMany({
            where: { trackingLinkId: row.id },
            select: CLICK_SELECT,
            orderBy: { clickedAt: 'desc' },
            take: RECENT_CLICKS,
          }),
          fastify.prisma.trackingLinkClick.groupBy({
            by: ['redirectStatus'],
            where: { trackingLinkId: row.id },
            _count: { _all: true },
          }),
        ]);

        return sendSuccess(reply, {
          ...serveRow(row, names),
          stats: {
            confirmedClicks: stats.confirmedClicks,
            clicksByDate: Object.entries(stats.clicksByDate)
              .map(([date, count]) => ({ date, count }))
              .sort((left, right) => left.date.localeCompare(right.date)),
            byCountry: toBuckets(stats.clicksByCountry),
            byDevice: toBuckets(stats.clicksByDevice),
            byBrowser: toBuckets(stats.clicksByBrowser),
            byOs: toBuckets(stats.clicksByOS),
            bySocialSource: toBuckets(stats.clicksBySocialSource),
            topReferrers: [...stats.topReferrers].sort(byCountDesc).slice(0, TOP_REFERRERS),
            byRedirectStatus: toBuckets(
              Object.fromEntries(byRedirectStatus.map((group) => [group.redirectStatus ?? 'pending', group._count._all]))
            ),
          },
          recentClicks,
        });
      } catch (error) {
        logError(fastify.log, 'Get admin tracking link error:', error);
        return sendInternalError(reply, 'Erreur lors de la lecture du lien de suivi');
      }
    }
  );

  fastify.patch(
    '/tracking-links/:linkId',
    {
      onRequest: [...readGuards, requireAdminRank()],
      schema: {
        description:
          "Active ou désactive un lien de suivi. Lecture (canAccessAdmin + canViewAnalytics) plus rang d'administration : AUDIT ne ferme pas un lien. Tracé dans AdminAuditLog. #8876.",
        tags: ['admin'],
        summary: 'Activate or deactivate a tracking link (admin)',
        security: [{ bearerAuth: [] }],
        params: linkParams,
        body: {
          type: 'object',
          required: ['isActive'],
          properties: {
            isActive: { type: 'boolean' },
            reason: { type: 'string', minLength: 3, maxLength: 500, description: 'Motif consigné dans le journal' },
          },
        },
        response: {
          200: enveloppe({ type: 'object', properties: { id: chaine, isActive: booleen } }),
          ...reponsesEnErreur,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { linkId } = request.params as { linkId: string };
        const { isActive, reason } = request.body as { isActive: boolean; reason?: string };

        const link = await fastify.prisma.trackingLink.findUnique({
          where: { id: linkId },
          select: { id: true, isActive: true, createdBy: true },
        });
        if (!link) return sendNotFound(reply, 'Lien de suivi introuvable');

        if (link.isActive === isActive) return sendSuccess(reply, { id: link.id, isActive });

        await fastify.prisma.trackingLink.update({ where: { id: link.id }, data: { isActive } });

        await withAudit(request, {
          action: isActive ? 'ADMIN_TRACKING_LINK_REACTIVATED' : 'ADMIN_TRACKING_LINK_DEACTIVATED',
          entity: 'TrackingLink',
          entityId: link.id,
          userId: link.createdBy ?? adminViewer(request).id,
          reason,
          changes: { isActive: { before: link.isActive, after: isActive } },
        });

        return sendSuccess(reply, { id: link.id, isActive });
      } catch (error) {
        logError(fastify.log, 'Update admin tracking link error:', error);
        return sendInternalError(reply, 'Erreur lors de la mise à jour du lien de suivi');
      }
    }
  );
}
