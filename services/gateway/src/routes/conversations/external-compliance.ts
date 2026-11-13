/**
 * Les portes de CONFORMITÉ de l'interopérabilité WhatsApp (#17120, chantier
 * #17007) — derrière le drapeau `EXTERNAL_CONVERSATIONS`, éteint en production :
 *
 * - `GET /conversations/external/consent?network=whatsapp` : l'information en
 *   vigueur (version, ce qui part chez Meta, durée de conservation du numéro de
 *   l'ami) et le consentement du compte ;
 * - `PUT /conversations/external/consent` `{ network, noticeVersion, granted }` :
 *   le consentement, daté par le SERVEUR ; accorder sous une version périmée
 *   ⇒ 409 (la version citée gouverne l'ACCORD, jamais le RETRAIT : un retrait
 *   efface toujours la date et les adresses gardées, même venu d'un client pas
 *   encore mis à jour après un changement de version — #17425) ;
 * - `POST /conversations/:id/external/report` : signaler un contenu reçu de
 *   WhatsApp (`reportExternalContent`).
 *
 * Aucun schéma JSON de corps : sous AJV `removeAdditional`, un champ en trop
 * (une date posée par le client) serait RETIRÉ en silence ; le schéma Zod strict
 * le refuse. Aucun journal ne recopie un corps.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';
import { EXTERNAL_INTEROP_NOTICE_VERSION } from '@meeshy/shared/types/external-interop-compliance';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess, sendUnauthorized } from '../../utils/response';
import { externalNetworkSchema } from '../../services/external-peer/external-peer-contract';
import { externalConversationsEnabled } from '../../services/external-conversation/external-conversation-flag';
import { externalPeerRetentionDays } from '../../services/external-conversation/peer-retention';
import { readInteropConsent, recordInteropConsent, type InteropConsentDeps } from '../../services/external-conversation/interop-consent';
import {
  externalReportRequestSchema,
  reportExternalContent,
  type ExternalReportRow,
} from '../../services/external-conversation/report-external-content';
import { getReportService } from '../../services/admin/report.service';
import { assessReportPriority } from '../../services/reports/reportPriority';

export type ExternalComplianceRouteOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
  readonly createReport?: (row: ExternalReportRow) => Promise<{ readonly id: string }>;
};

const DISABLED_MESSAGE = 'Writing to a friend on another network is not available yet';

const consentQuerySchema = z.object({ network: externalNetworkSchema.default('whatsapp') });

const consentBodySchema = z
  .object({ network: externalNetworkSchema, noticeVersion: z.string().min(1).max(64), granted: z.boolean() })
  .strict();

const consentStatusSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    network: { type: 'string' },
    noticeVersion: { type: 'string' },
    disclosures: { type: 'array', items: { type: 'string' } },
    retentionDays: { type: 'integer' },
    consent: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: { grantedAt: { type: 'string', format: 'date-time' }, noticeVersion: { type: 'string' } },
    },
    current: { type: 'boolean' },
  },
} as const;

const consentResponseSchema = {
  type: 'object',
  properties: { success: { type: 'boolean' }, data: consentStatusSchema },
} as const;

const reportResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: { reportId: { type: 'string' }, peerBlocked: { type: 'boolean' }, orientation: { type: 'string' } },
    },
  },
} as const;

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  429: errorResponseSchema,
  500: errorResponseSchema,
} as const;

/**
 * Le débit PAR COMPTE des deux écritures (consentement, signalement), compté
 * après l'authentification et fermé si le compteur tombe — le même régime que
 * l'ouverture (`external.ts`) et que `POST /reports` (10 par heure).
 */
const writeRateLimit = (usage: string, max: number) => ({
  max,
  timeWindow: '1 hour',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) =>
    `external-conversation:${usage}:${(request as UnifiedAuthRequest).authContext?.registeredUser?.id ?? `ip:${request.ip}`}`,
  errorResponseBuilder: () => ({ success: false, error: 'Too many requests. Try again later.', statusCode: 429 }),
});

const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

const registeredUser = (request: FastifyRequest) => (request as UnifiedAuthRequest).authContext?.registeredUser ?? null;

const defaultCreateReport = (prisma: PrismaClient) => async (row: ExternalReportRow) => {
  const priority = await assessReportPriority(prisma, {
    reportedType: row.reportedType,
    reportedEntityId: row.reportedEntityId,
    reporterId: row.reporterId,
  });
  return getReportService(prisma).createReport({ ...row, ...priority });
};

export function registerExternalComplianceRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: preHandlerHookHandler,
  options: ExternalComplianceRouteOptions = {},
): void {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const createReport = options.createReport ?? defaultCreateReport(prisma);
  const consentDeps = (): InteropConsentDeps => ({ prisma, now, retentionDays: externalPeerRetentionDays(env) });

  /** Le drapeau puis le compte : rend l'identifiant, ou `null` une fois le refus envoyé. */
  const admit = (request: FastifyRequest, reply: FastifyReply): string | null => {
    if (!externalConversationsEnabled(env)) {
      sendForbidden(reply, DISABLED_MESSAGE, { code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED });
      return null;
    }
    const userId = registeredUser(request)?.id;
    if (!userId) {
      sendUnauthorized(reply, 'An account is required to write to a friend on another network', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      return null;
    }
    return userId;
  };

  fastify.get(
    '/conversations/external/consent',
    {
      preValidation: [requiredAuth],
      schema: {
        description: 'What is shared with the other network, and whether the caller consented under the notice in force',
        tags: ['conversations'],
        summary: 'Read the interoperability consent',
        response: { 200: consentResponseSchema, ...errorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = admit(request, reply);
      if (!userId) return;
      const query = consentQuerySchema.safeParse(request.query ?? {});
      if (!query.success) return sendBadRequest(reply, 'Unsupported network', { code: EXTERNAL_CONVERSATION_ERROR_CODES.INVALID });
      try {
        const status = await readInteropConsent(consentDeps(), { userId, network: query.data.network });
        if (!status) return sendNotFound(reply, 'USER_NOT_FOUND');
        return sendSuccess(reply, status);
      } catch (error) {
        logError(fastify.log, 'external consent read failed', errorName(error));
        return sendInternalError(reply);
      }
    },
  );

  fastify.put(
    '/conversations/external/consent',
    {
      preValidation: [requiredAuth],
      config: { rateLimit: writeRateLimit('consent', 20) },
      schema: {
        description: 'Give or withdraw the interoperability consent; the server dates it, the notice version must be the one in force',
        tags: ['conversations'],
        summary: 'Record the interoperability consent',
        response: { 200: consentResponseSchema, ...errorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = admit(request, reply);
      if (!userId) return;
      const body = consentBodySchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Expected a network, the notice version shown and a decision', { code: EXTERNAL_CONVERSATION_ERROR_CODES.INVALID });
      if (body.data.granted && body.data.noticeVersion !== EXTERNAL_INTEROP_NOTICE_VERSION) {
        return sendError(reply, 409, 'The notice changed: read it again before consenting', {
          code: EXTERNAL_CONVERSATION_ERROR_CODES.NOTICE_OUTDATED,
          details: { expectedNoticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION },
        });
      }
      try {
        return sendSuccess(reply, await recordInteropConsent(consentDeps(), { userId, network: body.data.network, granted: body.data.granted }));
      } catch (error) {
        logError(fastify.log, 'external consent write failed', errorName(error));
        return sendInternalError(reply);
      }
    },
  );

  fastify.post(
    '/conversations/:id/external/report',
    {
      preValidation: [requiredAuth],
      config: { rateLimit: writeRateLimit('report', 10) },
      schema: {
        description: 'Report content received from a friend on another network: local block, voluntary disclosure, no server-side analysis',
        tags: ['conversations', 'reports'],
        summary: 'Report external content',
        response: { 201: reportResponseSchema, ...errorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = admit(request, reply);
      if (!userId) return;
      const parsed = externalReportRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, 'Invalid report', { code: EXTERNAL_CONVERSATION_ERROR_CODES.INVALID });
      const conversationId = (request.params as { id?: string } | undefined)?.id ?? '';
      if (!/^[0-9a-f]{24}$/i.test(conversationId)) return sendNotFound(reply, 'Conversation not found');
      try {
        const outcome = await reportExternalContent(
          { prisma, createReport, now },
          { userId, username: registeredUser(request)?.username, conversationId, request: parsed.data },
        );
        if (outcome.kind === 'not-found') return sendNotFound(reply, 'Conversation not found');
        return sendSuccess(reply, outcome.acknowledgement, { statusCode: 201 });
      } catch (error) {
        logError(fastify.log, 'external report failed', errorName(error));
        return sendInternalError(reply);
      }
    },
  );
}
