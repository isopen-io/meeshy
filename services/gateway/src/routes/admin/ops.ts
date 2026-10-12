/**
 * LES OPÉRATIONS SERVEUR DE L'ADMINISTRATION (#10384–#10386), montées sous
 * `/api/v1/admin/ops`.
 *
 * - `GET /host-metrics?since=` — mémoire, CPU, charge, swap et disque de l'hôte
 *   (la sonde `services/admin/host-metrics-probe.ts`), plus l'usage Docker que
 *   le runner publie. `canAccessAdmin` + rang d'administration (BIGBOSS, ADMIN).
 * - `GET /status` — le dernier passage de chaque opération, sa prochaine
 *   disponibilité, et la carte de la dernière sauvegarde (`etat.json`).
 * - `POST /:operation` — `backup` ou `image-prune`, BIGBOSS SEUL, après une
 *   confirmation qui NOMME l'opération. La passerelle ne fait que DÉPOSER la
 *   demande (`services/admin/ops-relay.ts`) : c'est le runner de l'hôte qui
 *   l'exécute, sur liste blanche. Chaque demande acceptée est journalisée
 *   (`TRIGGER_SERVER_OPERATION`, entité `Server`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hostMetricsQuerySchema,
  serverOperationRequestBodySchema,
  serverOperationSchema,
  type ServerOperation,
} from '@meeshy/shared/types/admin-ops';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireAdminRank, requirePermission, requireSovereign } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { backupCardOf, backupStatusFile, readBackupVerdict } from '../../services/admin/backup-status';
import { hostMetricsProbe, type HostMetricsProbe } from '../../services/admin/host-metrics-probe';
import { createOpsRelay, type OpsRelay } from '../../services/admin/ops-relay';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendError, sendSuccess } from '../../utils/response';
import {
  hostMetricsSnapshotResponseSchema,
  operationConflictResponseSchema,
  serverOperationAcceptedResponseSchema,
  serverOperationStatusResponseSchema,
} from './ops-schemas';
import { enveloppe, reponsesEnErreur } from './oversight-schemas';

const logger = enhancedLogger.child({ module: 'AdminOps' });

export type AdminOpsDeps = {
  readonly probe: HostMetricsProbe;
  readonly relay: OpsRelay;
  readonly now: () => Date;
  readonly backupStatusFile: string;
};

type Violation = { readonly path: string; readonly message: string };

const violationsOf = (issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey>; readonly message: string }>): Violation[] =>
  issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));

function actorOf(request: FastifyRequest): { readonly id: string; readonly username: string } | null {
  const user = (request as UnifiedAuthRequest).authContext?.registeredUser;
  if (!user?.id) return null;
  return { id: user.id, username: typeof user.username === 'string' && user.username ? user.username : user.id };
}

async function writeOperationAudit(
  request: FastifyRequest,
  entry: { readonly adminId: string; readonly operation: ServerOperation; readonly requestId: string; readonly environment: string; readonly reason?: string },
): Promise<void> {
  try {
    await (request.server as unknown as { prisma: { adminAuditLog: { create: (a: unknown) => Promise<unknown> } } }).prisma.adminAuditLog.create({
      data: {
        adminId: entry.adminId,
        userId: entry.adminId,
        action: 'TRIGGER_SERVER_OPERATION',
        entity: 'Server',
        entityId: entry.environment,
        metadata: JSON.stringify({
          operation: entry.operation,
          requestId: entry.requestId,
          environment: entry.environment,
          ...(entry.reason ? { reason: entry.reason } : {}),
        }),
        ipAddress: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
      },
    });
  } catch (error) {
    logger.warn('server operation audit write failed', { operation: entry.operation, requestId: entry.requestId, error });
  }
}

export function buildAdminOpsRoutes(deps: AdminOpsDeps) {
  return async function adminOpsPlugin(fastify: FastifyInstance): Promise<void> {
    const adminGate = [fastify.authenticate, requirePermission('canAccessAdmin'), requireAdminRank()];

    fastify.get(
      '/host-metrics',
      {
        onRequest: adminGate,
        schema: {
          description:
            "La mémoire, le CPU, la charge, le swap et le disque de l'hôte, échantillonnés toutes les 5 s et gardés une heure ; `since` ne rend que les points postérieurs. BIGBOSS et ADMIN. #10384.",
          tags: ['admin'],
          summary: 'Host metrics (admin)',
          security: [{ bearerAuth: [] }],
          response: { 200: enveloppe(hostMetricsSnapshotResponseSchema), ...reponsesEnErreur },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = hostMetricsQuerySchema.safeParse(request.query ?? {});
        if (!query.success) {
          return sendError(reply, 400, 'Paramètre since invalide', { code: 'VALIDATION_ERROR', violations: violationsOf(query.error.issues) });
        }
        const since = query.data.since ? new Date(query.data.since) : undefined;
        return sendSuccess(reply, await deps.probe.snapshot(since));
      },
    );

    fastify.get(
      '/status',
      {
        onRequest: adminGate,
        schema: {
          description:
            "Le dernier passage de chaque opération serveur, sa prochaine disponibilité, l'installation du relais et la carte de la dernière sauvegarde. BIGBOSS et ADMIN. #10385, #10386.",
          tags: ['admin'],
          summary: 'Server operations status (admin)',
          security: [{ bearerAuth: [] }],
          response: { 200: enveloppe(serverOperationStatusResponseSchema), ...reponsesEnErreur },
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const [status, verdict] = await Promise.all([deps.relay.status(), readBackupVerdict(deps.backupStatusFile)]);
        return sendSuccess(reply, { ...status, backup: backupCardOf(verdict, deps.now()) });
      },
    );

    fastify.post(
      '/:operation',
      {
        onRequest: [fastify.authenticate, requirePermission('canAccessAdmin'), requireSovereign()],
        schema: {
          description:
            "Déclenche une opération serveur (backup | image-prune) après une confirmation qui la nomme. BIGBOSS seul ; la demande est déposée pour le runner de l'hôte et journalisée. #10385, #10386.",
          tags: ['admin'],
          summary: 'Trigger a server operation (BIGBOSS)',
          security: [{ bearerAuth: [] }],
          params: { type: 'object', properties: { operation: { type: 'string' } }, required: ['operation'] },
          response: {
            202: enveloppe(serverOperationAcceptedResponseSchema),
            400: validationErrorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: operationConflictResponseSchema,
            500: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const operation = serverOperationSchema.safeParse((request.params as { operation?: string }).operation);
        if (!operation.success) return sendError(reply, 404, 'Opération inconnue', { code: 'UNKNOWN_OPERATION' });

        const body = serverOperationRequestBodySchema.safeParse(request.body ?? {});
        if (!body.success) {
          return sendError(reply, 400, 'Demande invalide', { code: 'VALIDATION_ERROR', violations: violationsOf(body.error.issues) });
        }
        if (body.data.confirm !== operation.data) {
          return sendError(reply, 400, "La confirmation ne nomme pas l'opération demandée", { code: 'CONFIRMATION_MISMATCH' });
        }

        const actor = actorOf(request);
        if (!actor) return sendError(reply, 401, 'Authentification requise');

        const result = await deps.relay.submit({ operation: operation.data, requestedBy: actor.username });
        if (result.kind === 'refused') {
          if (result.code === 'OPERATION_COOLDOWN') {
            return sendError(reply, 409, 'Opération trop récente', { code: result.code, details: { data: { availableAt: result.availableAt } } });
          }
          if (result.code === 'OPERATION_IN_PROGRESS') {
            return sendError(reply, 409, 'Opération déjà en cours', { code: result.code });
          }
          return sendError(reply, 503, "Le relais d'opérations n'est pas installé sur cet hôte", { code: result.code });
        }

        await writeOperationAudit(request, {
          adminId: actor.id,
          operation: operation.data,
          requestId: result.accepted.requestId,
          environment: deps.relay.settings.environment,
          reason: body.data.reason || undefined,
        });
        logger.info('server operation queued', {
          operation: operation.data,
          requestId: result.accepted.requestId,
          adminId: actor.id,
        });
        return sendSuccess(reply, result.accepted, { statusCode: 202 });
      },
    );
  };
}

/** Le plugin de production : la sonde unique du processus, démarrée au montage. */
export async function adminOpsRoutes(fastify: FastifyInstance): Promise<void> {
  const probe = hostMetricsProbe();
  probe.start();
  await buildAdminOpsRoutes({
    probe,
    relay: createOpsRelay({ env: process.env, now: () => new Date() }),
    now: () => new Date(),
    backupStatusFile: backupStatusFile(),
  })(fastify);
}
