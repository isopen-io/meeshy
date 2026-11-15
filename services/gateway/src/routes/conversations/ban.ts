import { FastifyInstance } from 'fastify'
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess } from '../../utils/response'
import { bannirParticipant, leverBannissementDeParticipant } from './participant-ban-core'
import { repondreAuRefus } from './utils/participant-geste-reponse'

/**
 * **Les deux portes du bannissement** — `PATCH …/participants/:userId/ban` et
 * `…/unban`.
 *
 * Ce fichier ne porte plus que ce qui est propre à HTTP : les deux schémas
 * (params, charge servie, codes d'erreur), la préaffectation d'authentification
 * et la traduction du verdict en réponse. Tout ce qui DÉCIDE — planchers,
 * comparaison de rang, écriture, fermeture du lien d'entrée, éventails — vit
 * dans `participant-ban-core.ts` depuis #4713, appelable sans Fastify.
 *
 * `socketIOHandler` reste capturé à l'ENREGISTREMENT, comme avant l'extraction :
 * les deux gestionnaires lisaient cette const, jamais `fastify.socketIOHandler`
 * par requête, et remplacer l'un par l'autre changerait ce qu'observe une suite
 * qui repose la passerelle après avoir monté les routes.
 */
export function registerBanRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler

  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/conversations/:id/participants/:userId/ban',
    {
      schema: {
        description: 'Ban a participant from a conversation',
        tags: ['conversations'],
        summary: 'Ban participant',
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string', description: 'User ID — or Participant ID, la seule identite d\'un visiteur sans compte' },
          },
        },
        // La charge n'etait gouvernee par RIEN : sans bloc `response`, Fastify
        // serialise l'objet tel quel, donc tout champ ajoute un jour a l'objet
        // rendu part sur le fil sans qu'aucune declaration ne l'ait autorise.
        // C'est la meme famille de defaut que #4009 vue de l'autre bout : la
        // ou un champ non declare CASSE un decodeur strict, un champ non
        // declare ici en FABRIQUE un que personne n'a relu.
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  // `participantId` TOUJOURS, `userId` NUL sans compte : ce
                  // champ declare un `User.id`, et y recopier un
                  // `Participant.id` est ce que le CLAUDE.md interdit.
                  participantId: { type: 'string' },
                  userId: { type: 'string', nullable: true },
                  bannedAt: { type: 'string', format: 'date-time' },
                  // Nomme plutot que devine : l'ecran des liens doit pouvoir
                  // marquer CE lien ferme sans relire toute la liste.
                  closedShareLinkId: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const authRequest = request as UnifiedAuthRequest

      const verdict = await bannirParticipant({
        prisma,
        conversationIdentifier: request.params.id,
        targetKey: request.params.userId,
        currentUserId: authRequest.authContext.userId,
        platformRole: authRequest.authContext.registeredUser?.role,
        socketIO: socketIOHandler,
      })

      if (verdict.genre === 'refus') return repondreAuRefus(reply, verdict)

      return sendSuccess(reply, verdict.donnees)
    }
  )

  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/conversations/:id/participants/:userId/unban',
    {
      schema: {
        description: 'Unban a participant from a conversation',
        tags: ['conversations'],
        summary: 'Unban participant',
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string', description: 'User ID — or Participant ID, la seule identite d\'un visiteur sans compte' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  participantId: { type: 'string' },
                  userId: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const authRequest = request as UnifiedAuthRequest

      const verdict = await leverBannissementDeParticipant({
        prisma,
        conversationIdentifier: request.params.id,
        targetKey: request.params.userId,
        currentUserId: authRequest.authContext.userId,
        platformRole: authRequest.authContext.registeredUser?.role,
        socketIO: socketIOHandler,
      })

      if (verdict.genre === 'refus') return repondreAuRefus(reply, verdict)

      return sendSuccess(reply, verdict.donnees)
    }
  )
}
