import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { conversationParticipantSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendInternalError } from '../../utils/response';
import { viewerFromRequest } from '../users/presence-gate';
import { changerRangDeParticipant } from './participant-role-core';
import { repondreAuRefus } from './utils/participant-geste-reponse';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ConversationParticipantRoleRoute' });

/**
 * **Changer le rang de quelqu'un** — extrait de `participants.ts` le 2026-08-29.
 *
 * L'extraction n'est pas cosmétique : `participants.ts` pesait 1830 lignes, très
 * au-dessus du budget de 800-1100, et la directive est explicite — on EXTRAIT
 * avant d'ajouter. Ce geste-ci recevait deux gardes de plus (la comparaison de
 * rang, la résolution de clé partagée) ; les poser dans le monolithe l'aurait
 * encore alourdi de ce qu'il fallait précisément lui retirer.
 *
 * Ce que l'absence de comparaison de rang coûtait : **un administrateur
 * rétrogradait un autre administrateur**, et rien ne l'en empêchait. La seule
 * protection posée était celle du créateur (#4008) — une exception nommée là où
 * il fallait une LOI. Un admin pouvait donc, en deux requêtes, se débarrasser de
 * ses pairs : `role: 'member'` sur chacun, puis n'importe quoi. La hiérarchie
 * n'existait qu'à l'affichage.
 *
 * **#4713 — la loi ci-dessus n'est plus écrite ici.** Elle vit dans
 * `changerRangDeParticipant` (`participant-role-core.ts`), appelable sans
 * Fastify ; ce fichier ne garde que le schéma, l'authentification, la lecture
 * du viewer de présence sur la requête et la traduction du verdict en réponse.
 */
export function registerParticipantRoleRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: string };
  }>('/conversations/:id/participants/:userId/role', {
    schema: {
      description: 'Update participant role in a conversation - requires conversation admin AND a rank strictly above the target. The creator cannot be demoted.',
      tags: ['conversations', 'participants'],
      summary: 'Update participant role',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID — or Participant ID — of the participant whose role changes' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['admin', 'moderator', 'member'], description: 'New role for participant' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Rôle du participant modifié avec succès' },
                // Le handler sert aussi le couple qui NOMME la mutation ;
                // non déclarés, `userId` et `role` étaient retirés, et
                // l'appelant devait rouvrir `participant` pour savoir ce qui
                // venait de changer. L'événement Socket.IO jumeau
                // (`PARTICIPANT_ROLE_UPDATED`) porte les deux depuis toujours.
                userId: { type: 'string', description: 'The participant whose role changed' },
                // La SECONDE face de l'identité. Le segment d'URL accepte
                // désormais les deux clés ; sans ce champ, un appelant qui a
                // désigné sa cible par son `Participant.id` ne pouvait pas
                // rapprocher la réponse de la ligne qu'il affiche.
                participantId: { type: 'string', description: 'Participant row whose role changed' },
                role: { type: 'string', description: 'The role now in force' },
                participant: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      const verdict = await changerRangDeParticipant({
        prisma,
        conversationIdentifier: request.params.id,
        targetKey: request.params.userId,
        role: request.body.role,
        currentUserId: authRequest.authContext.userId,
        // Le viewer se lit sur la REQUÊTE — la seule chose que le noyau ne
        // peut pas faire lui-même sans connaître Fastify. La LOI de présence
        // qu'il alimente, elle, reste entièrement dans le noyau.
        viewer: viewerFromRequest(request),
        socketIO: fastify.socketIOHandler,
        notifications: fastify.notificationService,
      });

      if (verdict.genre === 'refus') return repondreAuRefus(reply, verdict);

      return sendSuccess(reply, verdict.donnees);
    } catch (error) {
      logger.error('Error updating participant role', error as Error);
      return sendInternalError(reply, 'Error updating participant role');
    }
  });
}
