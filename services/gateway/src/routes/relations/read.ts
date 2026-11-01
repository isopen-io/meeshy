import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  RELATION_FEATURE_MIN_LEVEL,
  RELATION_LABEL_LANGUAGES,
  RELATION_LEVEL_LABELS,
  RELATION_LEVEL_PRESENTATION,
} from '@meeshy/shared/utils/relation-levels';
import { RELATION_LEVELS } from '@meeshy/shared/types/relation';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { sendSuccess, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger';
import { listRelationLinks } from '../../services/relations/relationLinks';
import { thresholdsNow } from '../../services/relations/relationRequestGate';
import { errorResponses, relationLimiter, relationLinkSchema } from './shared';

const configView = () => ({
  levels: RELATION_LEVELS.map((level) => ({
    level,
    labelKey: RELATION_LEVEL_PRESENTATION[level].labelKey,
    icon: RELATION_LEVEL_PRESENTATION[level].icon,
    labels: Object.fromEntries(RELATION_LABEL_LANGUAGES.map((lang) => [lang, RELATION_LEVEL_LABELS[lang][level]])),
  })),
  thresholds: thresholdsNow(),
  features: RELATION_FEATURE_MIN_LEVEL,
});

const configSchema = {
  type: 'object',
  properties: {
    levels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string' },
          labelKey: { type: 'string' },
          icon: { type: 'string' },
          labels: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
    thresholds: { type: 'object', additionalProperties: true },
    features: { type: 'object', additionalProperties: { type: 'string' } },
  },
} as const;

/**
 * La LECTURE des cercles (#13933) : `GET /relations`, `/relations/config` ; `/relations/:userId` est servi par `level.ts` (#13998). Aucune route ne lisait un lien, son niveau ni sa
 * progression — les routes de demande n'exposent que l'état d'une DEMANDE.
 */
export function registerRelationReads(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:read:u', 120);

  fastify.get('/config', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'Circle levels, their labels in the seven languages, the thresholds and the feature matrix.',
      tags: ['relations'],
      summary: 'Circles config',
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, data: configSchema } }, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, configView()));

  fastify.get('/', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'My circles: every link of at least Acquaintance, with the effective level, what I grant, the progress and the eligibility.',
      tags: ['relations'],
      summary: 'My circles',
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: relationLinkSchema } } }, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return sendSuccess(reply, await listRelationLinks(fastify.prisma, { viewerId: request.user!.userId, now: new Date() }));
    } catch (error) {
      logError(fastify.log, 'List relations error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
