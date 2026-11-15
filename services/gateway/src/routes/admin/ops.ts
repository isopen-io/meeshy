/**
 * LES OPÉRATIONS SERVEUR DE L'ADMINISTRATION (#10384–#10386), montées sous
 * `/api/v1/admin/ops`.
 *
 * - `GET /host-metrics?since=` — mémoire, CPU, charge, swap et disque de l'hôte
 *   (la sonde `services/admin/host-metrics-probe.ts`), plus l'usage Docker que
 *   le runner publie. `canAccessAdmin` + rang d'administration (BIGBOSS, ADMIN).
 * - `GET /status` — le dernier passage de chaque opération, sa prochaine
 *   disponibilité, et la carte de la dernière sauvegarde (`etat.json`).
 * - `GET /containers` — les conteneurs Docker de l'environnement (état, image
 *   et sa date, démarrage, consommation, réseaux, ports), tels que le runner les
 *   publie (`state/containers.json`). Rang d'administration (#11441).
 * - `POST /:operation` — `backup` ou `image-prune`, RANG D'ADMINISTRATION
 *   (BIGBOSS et ADMIN, demande porteur 2026-10-21, #11441), après une
 *   confirmation qui NOMME l'opération. Le nettoyage n'est permis que de 02:00 à
 *   06:00 heure de Paris (#11452, décision porteur 2026-10-24) : hors fenêtre,
 *   `409 OPERATION_OUTSIDE_WINDOW` et la prochaine ouverture, avant tout dépôt.
 *   La passerelle ne fait que DÉPOSER la
 *   demande (`services/admin/ops-relay.ts`) : c'est le runner de l'hôte qui
 *   l'exécute, sur liste blanche et sous délai. Chaque demande acceptée est
 *   journalisée AVANT son dépôt, et fail-closed : sans journal, rien n'est déposé
 *   (`TRIGGER_SERVER_OPERATION`, entité `Server`). Une tentative REFUSÉE l'est aussi
 *   (`SERVER_OPERATION_REFUSED`, avec son code — #10459 point 3) : rang insuffisant
 *   (pour un compte qui entre dans l'administration), confirmation fausse, délai,
 *   hors fenêtre, opération en cours, relais absent — une fois par acteur, opération et code toutes
 *   les dix minutes, pour qu'aucun compte ne transforme ses refus en écritures.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hostMetricsQuerySchema,
  serverOperationRequestBodySchema,
  serverOperationSchema,
  type ServerOperation,
} from '@meeshy/shared/types/admin-ops';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UserRoleEnum } from '@meeshy/shared/types';
import { requireAdminRank, requirePermission } from '../../middleware/authorize';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { backupCardOf, backupScheduleFromEnv, backupStatusFile, readBackupVerdict, type BackupSchedule } from '../../services/admin/backup-status';
import { hostMetricsProbe, type HostMetricsProbe } from '../../services/admin/host-metrics-probe';
import { createOpsRelay, type OpsRelay } from '../../services/admin/ops-relay';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendError, sendSuccess } from '../../utils/response';
import {
  containersViewResponseSchema,
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
  /** L'heure de sauvegarde de cet environnement (#10460) ; absente ⇒ minuit, celle de la production. */
  readonly backupSchedule?: BackupSchedule;
  /** La porte des refus journalisés (#11441) ; absente ⇒ une porte en mémoire, 10 min par clé. */
  readonly refusalGate?: RefusalGate;
};

/**
 * LA PORTE DES REFUS JOURNALISÉS (#11441, audit adversarial) — une tentative refusée laisse
 * sa trace, mais UNE par acteur, opération et code tous les dix minutes : sans elle, chaque
 * requête refusée (un 403 jusque-là gratuit) devenait une ligne `AdminAuditLog`, une
 * amplification d'écritures offerte à tout compte qui martèle la route. Bornée (2 000 clés) :
 * au-delà, la plus ancienne cède sa place.
 */
export type RefusalGate = { readonly admit: (key: string) => boolean };

export function memoryRefusalGate({ windowMs = 600_000, maxKeys = 2_000, now = () => Date.now() } = {}): RefusalGate {
  const seen = new Map<string, number>();
  return {
    admit: (key) => {
      const at = now();
      const last = seen.get(key);
      if (last !== undefined && at - last < windowMs) return false;
      seen.delete(key);
      seen.set(key, at);
      if (seen.size > maxKeys) {
        const oldest = seen.keys().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return true;
    },
  };
}

const USER_AGENT_MAX = 256;

type Violation = { readonly path: string; readonly message: string };

const violationsOf = (issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey>; readonly message: string }>): Violation[] =>
  issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));

function actorOf(request: FastifyRequest): { readonly id: string; readonly username: string } | null {
  const user = (request as UnifiedAuthRequest).authContext?.registeredUser;
  if (!user?.id) return null;
  return { id: user.id, username: typeof user.username === 'string' && user.username ? user.username : user.id };
}

type OperationAudit =
  | { readonly kind: 'queued'; readonly operation: ServerOperation; readonly requestId: string; readonly reason?: string | undefined }
  | { readonly kind: 'refused'; readonly operation: ServerOperation; readonly code: string };

async function writeOperationAudit(
  request: FastifyRequest,
  entry: { readonly adminId: string; readonly environment: string; readonly audit: OperationAudit },
): Promise<boolean> {
  const { audit } = entry;
  const queued = audit.kind === 'queued';
  try {
    await (request.server as unknown as { prisma: { adminAuditLog: { create: (a: unknown) => Promise<unknown> } } }).prisma.adminAuditLog.create({
      data: {
        adminId: entry.adminId,
        userId: entry.adminId,
        action: queued ? 'TRIGGER_SERVER_OPERATION' : 'SERVER_OPERATION_REFUSED',
        entity: 'Server',
        entityId: entry.environment,
        metadata: JSON.stringify(
          audit.kind === 'queued'
            ? { operation: audit.operation, requestId: audit.requestId, environment: entry.environment, ...(audit.reason ? { reason: audit.reason } : {}) }
            : { operation: audit.operation, environment: entry.environment, code: audit.code },
        ),
        ipAddress: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'].slice(0, USER_AGENT_MAX) : undefined,
      },
    });
    return true;
  } catch (error) {
    logger.warn('server operation audit write failed', { operation: audit.operation, kind: audit.kind, error });
    return false;
  }
}

export function buildAdminOpsRoutes(deps: AdminOpsDeps) {
  return async function adminOpsPlugin(fastify: FastifyInstance): Promise<void> {
    const adminGate = [fastify.authenticate, requirePermission('canAccessAdmin'), requireAdminRank()];
    const environment = deps.relay.settings.environment;

    const refusals = deps.refusalGate ?? memoryRefusalGate();

    /**
     * Journalise une tentative REFUSÉE — seulement quand il y a un acteur à nommer, une
     * opération connue, et que la porte l'admet (une par acteur, opération et code).
     */
    const auditRefusal = async ({ request, code }: { readonly request: FastifyRequest; readonly code: string }): Promise<void> => {
      const actor = actorOf(request);
      const operation = serverOperationSchema.safeParse((request.params as { operation?: string } | undefined)?.operation);
      if (!actor || !operation.success) return;
      if (!refusals.admit(`${actor.id}|${operation.data}|${code}`)) return;
      await writeOperationAudit(request, { adminId: actor.id, environment, audit: { kind: 'refused', operation: operation.data, code } });
    };

    /** Un 403 ne vaut trace que pour un compte qui ENTRE dans l'administration : un USER qui tape la route n'a rien tenté d'administrer. */
    const entersAdmin = (request: FastifyRequest): boolean => {
      const role = (request as UnifiedAuthRequest).authContext?.registeredUser?.role;
      return typeof role === 'string' && permissionsService.hasPermission(role as UserRoleEnum, 'canAccessAdmin');
    };

    /**
     * UN REFUS DE RANG SE JOURNALISE (#10459 point 3) — les gardes restent les gardes
     * PARTAGÉES (le manifeste des routes les lit pour classer la route), et c'est la
     * réponse 403 qu'elles ont envoyée qui laisse sa trace, une fois partie.
     */
    const auditForbidden = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (reply.statusCode === 403 && entersAdmin(request)) await auditRefusal({ request, code: 'FORBIDDEN' });
    };

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
            "Le dernier passage de chaque opération serveur, sa prochaine disponibilité (délai et fenêtre horaire, le plus tardif), sa fenêtre horaire, l'installation du relais et la carte de la dernière sauvegarde. BIGBOSS et ADMIN. #10385, #10386, #11452.",
          tags: ['admin'],
          summary: 'Server operations status (admin)',
          security: [{ bearerAuth: [] }],
          response: { 200: enveloppe(serverOperationStatusResponseSchema), ...reponsesEnErreur },
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const [status, verdict] = await Promise.all([deps.relay.status(), readBackupVerdict(deps.backupStatusFile)]);
        return sendSuccess(reply, { ...status, backup: backupCardOf(verdict, deps.now(), deps.backupSchedule) });
      },
    );

    fastify.get(
      '/containers',
      {
        onRequest: adminGate,
        schema: {
          description:
            "Les conteneurs Docker de l'environnement — nom, service, image et sa date, état, santé, démarrage, redémarrages, consommation, réseaux et ports — tels que le runner de l'hôte les publie chaque minute. Rien d'autre : ni variable d'environnement, ni label. BIGBOSS et ADMIN. #11441.",
          tags: ['admin'],
          summary: 'Environment containers (admin)',
          security: [{ bearerAuth: [] }],
          response: { 200: enveloppe(containersViewResponseSchema), ...reponsesEnErreur },
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, await deps.relay.containers()),
    );

    fastify.post(
      '/:operation',
      {
        onRequest: adminGate,
        onResponse: auditForbidden,
        schema: {
          description:
            "Déclenche une opération serveur (backup | image-prune) après une confirmation qui la nomme. Rang d'administration (BIGBOSS, ADMIN) ; image-prune n'est permise que de 02:00 à 06:00 heure de Paris (409 OPERATION_OUTSIDE_WINDOW sinon) ; la demande est déposée pour le runner de l'hôte, et chaque tentative, acceptée ou refusée, est journalisée. #10385, #10386, #11441, #11452.",
          tags: ['admin'],
          summary: 'Trigger a server operation (admin)',
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
          await auditRefusal({ request, code: 'CONFIRMATION_MISMATCH' });
          return sendError(reply, 400, "La confirmation ne nomme pas l'opération demandée", { code: 'CONFIRMATION_MISMATCH' });
        }

        const actor = actorOf(request);
        if (!actor) return sendError(reply, 401, 'Authentification requise');

        const result = await deps.relay.submit({
          operation: operation.data,
          requestedBy: actor.username,
          /* La trace PRÉCÈDE le dépôt, et le journal indisponible n'en dépose aucune (#10459 point 3). */
          beforeDeposit: (requestId) =>
            writeOperationAudit(request, {
              adminId: actor.id,
              environment,
              audit: { kind: 'queued', operation: operation.data, requestId, reason: body.data.reason || undefined },
            }),
        });
        if (result.kind === 'refused') {
          if (result.code === 'AUDIT_UNAVAILABLE') {
            return sendError(reply, 503, "Le journal d'administration est indisponible : l'opération n'a pas été demandée", { code: result.code });
          }
          await auditRefusal({ request, code: result.code });
          if (result.code === 'OPERATION_COOLDOWN') {
            return sendError(reply, 409, 'Opération trop récente', { code: result.code, details: { data: { availableAt: result.availableAt } } });
          }
          if (result.code === 'OPERATION_OUTSIDE_WINDOW') {
            return sendError(reply, 409, "Le nettoyage n'est permis que de 2 h à 6 h, heure de Paris", {
              code: result.code,
              details: { data: { availableAt: result.availableAt } },
            });
          }
          if (result.code === 'OPERATION_IN_PROGRESS') {
            return sendError(reply, 409, 'Opération déjà en cours', { code: result.code });
          }
          return sendError(reply, 503, "Le relais d'opérations n'est pas installé sur cet hôte", { code: result.code });
        }

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
    backupSchedule: backupScheduleFromEnv(),
  })(fastify);
}
