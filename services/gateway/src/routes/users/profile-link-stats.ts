/**
 * `GET /users/me/profile-link/stats` — les visites de MON lien de profil (#19206, chantier #18857) :
 * « 1 719 visites ce mois · 57 aujourd'hui » sur le billet « Mon lien », et le widget iOS.
 *
 * Le propriétaire seul, et par construction : la route ne prend aucun identifiant, elle lit les
 * lignes du compte authentifié. Un lecteur sans compte Meeshy (invité d'un lien de conversation)
 * reçoit le 404 générique (#10205), sans qu'aucune ligne soit lue. La réponse ne se garde dans
 * aucun cache (`private, no-store`) : elle change à chaque visite et ne regarde que son lecteur.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { profileLinkVisitStatsJsonSchema } from '@meeshy/shared/utils/profile-link-visits';
import { readProfileLinkVisitStats } from '../../services/profile-link-visits/profileLinkVisits';
import { sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { profileViewerId } from './profile-block-gate';

const logger = enhancedLogger.child({ module: 'ProfileLinkStats' });

export async function profileLinkStatsRoutes(fastify: FastifyInstance) {
  fastify.get('/users/me/profile-link/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      tags: ['users'],
      summary: 'Visits of my profile link',
      description:
        'Visits of the authenticated user profile (opened by /@username, /u/:username or /directory/people/:handle by someone else, preview robots excluded): today and this month (UTC), and a 30-day daily series. Owner only, never cached.',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: profileLinkVisitStatsJsonSchema } },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'private, no-store');
    const ownerId = profileViewerId(request);
    if (!ownerId) return sendNotFound(reply, 'Not found');
    try {
      return sendSuccess(reply, await readProfileLinkVisitStats(fastify.prisma, ownerId, new Date()));
    } catch (error) {
      logger.error('Lecture des visites du lien de profil', error as Error);
      return sendInternalError(reply, 'Erreur lors de la lecture des visites');
    }
  });
}
