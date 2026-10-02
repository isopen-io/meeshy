/**
 * `GET /admin/audit-logs` — le journal d'audit lisible par la console (#8876, § 6.2).
 *
 * ## Pourquoi cette route existe
 *
 * `AdminAuditLog` est écrit par une douzaine de gestes, et l'administrateur n'en
 * avait AUCUNE lecture globale : « qui a fait quoi, à qui, pourquoi » n'était
 * lisible qu'en base. Le journal est la réponse à la question que pose toute
 * plateforme administrée par quelqu'un d'autre que son propriétaire.
 *
 * ## La porte
 *
 * `canViewAuditLogs` — BIGBOSS et AUDIT. **ADMIN est refusé par la matrice**, et
 * c'est voulu : un administrateur qui relirait le journal de ses propres gestes
 * pourrait y mesurer ce qui se voit. La garde est posée AU NIVEAU DE LA ROUTE,
 * jamais seulement dans le gestionnaire.
 *
 * ## Ce que la ligne sert, et ce qu'elle retient
 *
 * Une forme UNIQUE (voir `audit-logs-changes.ts`) : le motif seul de `metadata`,
 * les changements normalisés, secrets masqués. L'adresse IP et le navigateur ne
 * sont servis — et même LUS — qu'avec `canViewSensitiveData` : un `select` qui ne
 * demande pas la colonne est la seule garde qui ne se contourne pas.
 *
 * ## Les noms
 *
 * L'administrateur, le sujet et la cible sont nommés (un lot de comptes, une
 * requête par genre de cible) : `audit-logs-targets.ts`. Un lien de partage se
 * nomme par son `name`, jamais par sa clé de jointure.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { requirePermission } from '../../middleware/authorize';
import { validatePagination } from '../../utils/pagination';
import { sendInternalError, sendPaginatedSuccess } from '../../utils/response';
import { logError } from '../../utils/logger';
import { readAuditChanges, readAuditReason } from './audit-logs-changes';
import { resolveAuditTargets, targetKey } from './audit-logs-targets';
import { loadAdminPeople } from './oversight-people';
import {
  chaine,
  chaineNulle,
  dateServie,
  enveloppePaginee,
  personneSchema,
  reponsesEnErreur,
} from './oversight-schemas';
import { adminViewer } from './oversight-viewer';
import { namePreviewSchema } from './conversation-name-preview';

/** Les genres de cible que le journal nomme — la liste FERMÉE du filtre `entity`. */
const AUDIT_ENTITIES = [
  'User',
  'Conversation',
  'ConversationShareLink',
  'Community',
  'Report',
  'Post',
  'Broadcast',
  'TrackingLink',
  'FriendRequest',
  'AgentLlmConfig',
  'Agent',
] as const;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

type AuditQuery = {
  offset?: string;
  limit?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  adminId?: string;
  userId?: string;
  createdAfter?: string;
  createdBefore?: string;
  order?: 'asc' | 'desc';
};

const BASE_SELECT = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  userId: true,
  adminId: true,
  changes: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AdminAuditLogSelect;

const NETWORK_SELECT = { ipAddress: true, userAgent: true } satisfies Prisma.AdminAuditLogSelect;

const boundary = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function buildWhere(query: AuditQuery): Prisma.AdminAuditLogWhereInput {
  const after = boundary(query.createdAfter);
  const before = boundary(query.createdBefore);
  const actions = (query.action ?? '').split(',').filter((code) => code !== '');

  const clauses: Prisma.AdminAuditLogWhereInput[] = [
    ...(actions.length > 0 ? [{ action: { in: actions } }] : []),
    ...(query.entity ? [{ entity: query.entity }] : []),
    ...(query.entityId ? [{ entityId: query.entityId }] : []),
    ...(query.adminId ? [{ adminId: query.adminId }] : []),
    ...(query.userId ? [{ userId: query.userId }] : []),
    ...(after ? [{ createdAt: { gte: after } }] : []),
    ...(before ? [{ createdAt: { lte: before } }] : []),
  ];

  return clauses.length === 0 ? {} : { AND: clauses };
}

const targetSchema = {
  type: 'object',
  properties: { type: chaine, id: chaine, label: chaineNulle, secondary: chaineNulle, ...namePreviewSchema },
} as const;

const changeSchema = {
  type: 'object',
  properties: { field: chaine, before: chaineNulle, after: chaineNulle },
} as const;

const auditRowSchema = {
  type: 'object',
  properties: {
    id: chaine,
    action: chaine,
    entity: chaine,
    entityId: chaine,
    createdAt: dateServie,
    admin: personneSchema,
    subject: personneSchema,
    target: targetSchema,
    reason: chaineNulle,
    changes: { type: 'array', nullable: true, items: changeSchema },
    ipAddress: chaineNulle,
    userAgent: chaineNulle,
  },
} as const;

export function registerAuditLogRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/audit-logs',
    {
      onRequest: [fastify.authenticate, requirePermission('canViewAuditLogs')],
      schema: {
        description:
          "Le journal d'audit de l'administration, nommé et interprété. Permission canViewAuditLogs (BIGBOSS, AUDIT). " +
          "L'adresse IP et le navigateur ne sont servis qu'avec canViewSensitiveData. #8876.",
        tags: ['admin'],
        summary: 'List the admin audit log',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            offset: { type: 'string', description: 'Pagination offset' },
            limit: { type: 'string', description: `Pagination limit (défaut ${DEFAULT_LIMIT}, max ${MAX_LIMIT})` },
            action: {
              type: 'string',
              pattern: '^[A-Z0-9_]{2,64}(,[A-Z0-9_]{2,64}){0,19}$',
              description: "Codes d'action séparés par des virgules",
            },
            entity: { type: 'string', enum: [...AUDIT_ENTITIES], description: 'Genre de la cible' },
            entityId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', description: 'Identifiant de la cible' },
            adminId: { type: 'string', pattern: OBJECT_ID_PATTERN, description: "L'administrateur qui a agi" },
            userId: { type: 'string', pattern: OBJECT_ID_PATTERN, description: 'Le compte concerné (le sujet)' },
            createdAfter: { type: 'string', format: 'date-time' },
            createdBefore: { type: 'string', format: 'date-time' },
            order: { type: 'string', enum: ['asc', 'desc'], description: 'desc (défaut) ou asc' },
          },
        },
        response: { 200: enveloppePaginee(auditRowSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as AuditQuery;
        const viewer = adminViewer(request);
        const canSeeSensitive = viewer.can('canViewSensitiveData');
        const { offset, limit } = validatePagination(query.offset, query.limit, {
          defaultLimit: DEFAULT_LIMIT,
          maxLimit: MAX_LIMIT,
        });
        const where = buildWhere(query);
        const direction = query.order === 'asc' ? 'asc' : 'desc';
        const select: Prisma.AdminAuditLogSelect = canSeeSensitive
          ? { ...BASE_SELECT, ...NETWORK_SELECT }
          : BASE_SELECT;

        const [rows, total] = await Promise.all([
          fastify.prisma.adminAuditLog.findMany({
            where,
            select,
            orderBy: [{ createdAt: direction }, { id: direction }],
            skip: offset,
            take: limit,
          }),
          fastify.prisma.adminAuditLog.count({ where }),
        ]);

        const people = await loadAdminPeople(fastify.prisma, [
          ...rows.map((row) => row.adminId),
          ...rows.map((row) => row.userId),
          ...rows.filter((row) => row.entity === 'User').map((row) => row.entityId),
        ]);
        const targets = await resolveAuditTargets(fastify.prisma, rows, people, {
          canSeeConversationMembers: viewer.hasAdminRank,
        });

        const data = rows.map((row) => {
          const named = targets.get(targetKey(row.entity, row.entityId));
          return {
            id: row.id,
            action: row.action,
            entity: row.entity,
            entityId: row.entityId,
            createdAt: row.createdAt,
            admin: people.get(row.adminId) ?? null,
            subject: people.get(row.userId) ?? null,
            target: {
              type: row.entity,
              id: row.entityId,
              label: named?.label ?? null,
              secondary: named?.secondary ?? null,
              ...(named?.participants === undefined ? {} : { participants: named.participants, total: named.total }),
            },
            reason: readAuditReason(row.metadata),
            changes: readAuditChanges(row.changes, { canSeeContacts: canSeeSensitive }),
            ipAddress: canSeeSensitive ? (row.ipAddress ?? null) : null,
            userAgent: canSeeSensitive ? (row.userAgent ?? null) : null,
          };
        });

        return sendPaginatedSuccess(reply, data, {
          total,
          limit,
          offset,
          hasMore: offset + rows.length < total,
        });
      } catch (error) {
        logError(fastify.log, 'List admin audit logs error:', error);
        return sendInternalError(reply, "Erreur lors de la lecture du journal d'audit");
      }
    }
  );
}
