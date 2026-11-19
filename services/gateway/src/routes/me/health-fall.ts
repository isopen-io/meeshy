import type { FastifyInstance } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { fallConsentUpdateSchema, fallReportSchema } from '@meeshy/shared/types/fall-detection';
import { fallRelayDepsOf } from '../../services/fallDetection/fallDeps';
import { refreshFallAudience, reportFall, respondFall } from '../../services/fallDetection/fallRelay';
import { readFallConsentSettings, writeFallConsent } from '../../services/fallDetection/fallSettings';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendError, sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, relationLimiter } from '../relations/shared';

const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const consentSchema = {
  type: 'object',
  properties: { consentedAt: { type: 'string', nullable: true }, consentVersion: { type: 'string', nullable: true }, currentVersion: { type: 'string' } },
} as const;
const fallErrors = { ...errorResponses, 403: errorResponseSchema } as const;

const REFUSAL = {
  'too-old': { status: 400, error: 'Chute trop ancienne', code: 'FALL_REPORT_TOO_OLD' },
  'in-future': { status: 400, error: 'Chute dans le futur', code: 'FALL_REPORT_IN_FUTURE' },
  'consent-required': { status: 403, error: 'Accord requis', code: 'FALL_CONSENT_REQUIRED' },
} as const;

/**
 * La CHUTE DÉTECTÉE côté ÉMETTEUR (#18748, SAN-01) : le rapport de l'iPhone (un instant, aucune
 * autre donnée de santé), « Je vais bien », et l'ACCORD EXPLICITE — jamais actif par défaut, refusé
 * sous 15 ans déclarés. Le retrait de l'accord ferme la collecte et efface l'épisode chez les Sangs.
 * Aucun journal ne porte l'instant d'une chute.
 */
export default async function healthFallMeRoutes(fastify: FastifyInstance): Promise<void> {
  const reports = relationLimiter(fastify, 'me:fall:r', 20);
  const settingsLimiter = relationLimiter(fastify, 'me:fall:s', 30);
  const relayOf = () => fallRelayDepsOf({ prisma: fastify.prisma, io: relationIoOf(fastify) });

  fastify.post('/health/fall', {
    onRequest: [fastify.authenticate],
    preHandler: [reports.middleware()],
    schema: {
      description: 'My iPhone reports a fall detected by the watch — an instant, nothing else. Requires my explicit consent. Never a conversation message.',
      tags: ['me'],
      summary: 'Fall report',
      response: { 200: envelope({ type: 'object', properties: { recorded: { type: 'boolean' } } }), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = fallReportSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Rapport illisible');
    try {
      const outcome = await reportFall(relayOf(), { userId: request.user!.userId, detectedAt: parsed.data.detectedAt });
      if (outcome.kind === 'recorded' || outcome.kind === 'deduplicated') return sendSuccess(reply, { recorded: outcome.kind === 'recorded' });
      const refusal = REFUSAL[outcome.kind];
      return sendError(reply, refusal.status, refusal.error, { code: refusal.code });
    } catch (error) {
      logError(fastify.log, 'Fall report error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.post('/health/fall/ok', {
    onRequest: [fastify.authenticate],
    preHandler: [reports.middleware()],
    schema: {
      description: '« I am OK » — ends the current fall alert and tells my Blood links who received it.',
      tags: ['me'],
      summary: 'Fall alert answered',
      response: { 200: envelope({ type: 'object', properties: { cleared: { type: 'boolean' } } }), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, { cleared: await respondFall(relayOf(), request.user!.userId) });
    } catch (error) {
      logError(fastify.log, 'Fall answer error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.get('/health/fall/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'My explicit consent to fall alerts, and the version of the consent text currently in force.',
      tags: ['me'],
      summary: 'My fall alert consent',
      response: { 200: envelope(consentSchema), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      return sendSuccess(reply, await readFallConsentSettings(fastify.prisma, request.user!.userId));
    } catch (error) {
      logError(fastify.log, 'Fall settings read error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put('/health/fall/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [settingsLimiter.middleware()],
    schema: {
      description: 'Give my explicit consent to fall alerts (current text version), or withdraw it — which stops collection and clears any alert.',
      tags: ['me'],
      summary: 'Update my fall alert consent',
      response: { 200: envelope(consentSchema), ...fallErrors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const parsed = fallConsentUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Réglage illisible');
    try {
      const userId = request.user!.userId;
      const written = await writeFallConsent(fastify.prisma, { userId, update: parsed.data, now: new Date() });
      if (written.kind === 'minor') return sendError(reply, 403, 'Accord réservé aux 15 ans et plus', { code: 'FALL_CONSENT_MINOR' });
      if (written.kind === 'stale-version') return sendError(reply, 400, 'Texte d’accord périmé', { code: 'FALL_CONSENT_VERSION_STALE' });
      if (!parsed.data.consented) await refreshFallAudience(relayOf(), userId).catch((error: unknown) => logError(fastify.log, 'Fall alert not cleared after consent withdrawal:', error));
      return sendSuccess(reply, written.settings);
    } catch (error) {
      logError(fastify.log, 'Fall settings write error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
