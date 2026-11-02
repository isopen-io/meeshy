import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger';
import { cooldownEnd, lowerGrant } from '../../services/relations/userRelationWriter';
import { loadRelationLink } from '../../services/relations/relationLinks';
import { thresholdsNow } from '../../services/relations/relationRequestGate';
import { forgetFriends } from '../../services/relations/relationCaches';
import { asseoirLienHerite, retirerDemandesAuDessus } from '../directory/friend-request-withdraw';
import { errorResponses, otherUserOf, relationLimiter, relationLinkSchema, sendCoded, userIdParams } from './shared';

/** Les niveaux qu'un accord peut prendre : Communauté est calculée et Atome réservé, aucun ne s'accorde. */
const GRANTABLE: readonly string[] = RELATION_LEVELS.filter((level) => level !== 'COMMUNITY');

const corpsNiveau = z.object({ level: z.unknown() });

/**
 * BAISSER ou SORTIR (#13933) : `POST /relations/:userId/level { level }`. Je baisse MON
 * accord — jamais celui de l'autre —, vers un niveau plus bas que celui que j'accorde.
 *
 * SILENCIEUX (RG-07) : ni notification, ni événement, vers personne. L'autre n'en
 * apprend rien ; il se voit seulement retenir de redemander une montée pendant 30 jours
 * (RG-08), et ne l'apprend qu'en essayant. Monter par cette porte est refusé : une
 * montée est une demande, qui veut l'accord de l'autre.
 */
export function registerRelationLower(fastify: FastifyInstance): void {
  const writes = relationLimiter(fastify, 'rel:level:u', 30);

  fastify.post<{ Params: { userId: string } }>('/:userId/level', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, writes.middleware()],
    schema: {
      description: 'Lower my grant towards one person, or leave their circle (PUBLIC). Silent: nobody is notified.',
      tags: ['relations'],
      summary: 'Lower or leave a circle',
      params: userIdParams,
      body: { type: 'object', required: ['level'], properties: { level: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, data: relationLinkSchema } }, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      const viewerId = request.user!.userId;

      const { level } = corpsNiveau.parse(request.body);
      if (typeof level !== 'string' || !GRANTABLE.includes(level)) {
        return sendCoded(reply, 400, 'Niveau illisible', 'RELATION_LEVEL_INVALID');
      }

      const now = new Date();
      await asseoirLienHerite(fastify.prisma, viewerId, otherId, now);
      const outcome = await lowerGrant(fastify.prisma, {
        actorId: viewerId, otherId, level: level as RelationLevel, at: now, cooldownUntil: cooldownEnd(now, thresholdsNow().cooldownDays),
      });
      if (outcome === 'not-a-drop') return sendCoded(reply, 400, 'Une montée se demande', 'RELATION_NOT_A_DROP');

      // Rejouée sans condition : une baisse écrite dont le retrait aurait échoué se solde au rejeu.
      await retirerDemandesAuDessus(fastify.prisma, viewerId, otherId);
      if (outcome === 'lowered') await forgetFriends(fastify, [viewerId, otherId]);
      return sendSuccess(reply, await loadRelationLink(fastify.prisma, { viewerId, otherId, now }));
    } catch (error) {
      if (error instanceof z.ZodError) return sendBadRequest(reply, 'Donnees invalides');
      logError(fastify.log, 'Lower relation error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
