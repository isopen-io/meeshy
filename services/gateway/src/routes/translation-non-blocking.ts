import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError, logger } from '../utils/logger';

// ===== SCHEMAS DE VALIDATION =====
const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(1000).optional(),
  source_language: z.string().min(2).max(5).optional(),
  target_language: z.string().min(2).max(5),
  model_type: z.enum(['basic', 'medium', 'premium']).optional(),
  message_id: z.string().optional(),
  conversation_id: z.string().optional()
}).refine((data) => {
  return (data.text !== undefined && data.text.length > 0) || (data.message_id !== undefined);
}, {
  message: "Either 'text' or 'message_id' must be provided"
});

// ===== TYPES =====
interface TranslateRequest {
  text?: string;
  source_language?: string;
  target_language: string;
  model_type?: 'basic' | 'medium' | 'premium';
  message_id?: string;
  conversation_id?: string;
}

// ===== ROUTE NON-BLOQUANTE =====
export async function translationRoutes(fastify: FastifyInstance, options: any) {
  // Recuperer les services depuis l'instance fastify (comme dans translation.ts)
  const translationService = (fastify as any).translationService;
  const messagingService = (fastify as any).messagingService;

  if (!translationService) {
    throw new Error('TranslationService not provided to translation routes');
  }

  if (!messagingService) {
    throw new Error('MessagingService not provided to translation routes');
  }


  // ===== ROUTE PRINCIPALE NON-BLOQUANTE =====
  fastify.post<{ Body: TranslateRequest }>('/translate', async (request: FastifyRequest<{ Body: TranslateRequest }>, reply: FastifyReply) => {
    try {
      const validatedData = TranslateRequestSchema.parse(request.body);


      // ===== CAS 1: RETRADUCTION D'UN MESSAGE EXISTANT =====
      if (validatedData.message_id) {

        // Recuperer le message depuis la base de donnees
        const existingMessage = await fastify.prisma.message.findUnique({
          where: { id: validatedData.message_id },
          include: {
            conversation: { include: { members: true } }
          }
        });

        if (!existingMessage) {
          logger.warn(`[Translation] Message ${validatedData.message_id} not found`);
          return reply.status(404).send({
            success: false,
            error: 'Message not found',
            errorCode: 'MESSAGE_NOT_FOUND'
          });
        }


        // Preparer les donnees de traduction
        const messageData = {
          id: validatedData.message_id,
          conversationId: existingMessage.conversationId,
          content: validatedData.text || existingMessage.content,
          originalLanguage: validatedData.source_language || existingMessage.originalLanguage,
          targetLanguage: validatedData.target_language,
          modelType: validatedData.model_type || 'basic'
        };


        // DECLENCHEMENT NON-BLOQUANT - pas d'await !
        translationService.handleNewMessage(messageData).catch((error: any) => {
          logger.error(`[Translation] Async retranslation error: ${error.message}`);
        });

        // REPONSE IMMEDIATE - pas d'attente
        return reply.send({
          success: true,
          data: {
            message: 'Translation request submitted successfully',
            messageId: validatedData.message_id,
            targetLanguage: validatedData.target_language,
            status: 'processing'
          }
        });
      }

      // ===== CAS 2: NOUVEAU MESSAGE =====
      else {

        if (!validatedData.conversation_id) {
          return reply.status(400).send({
            success: false,
            error: 'conversation_id is required when message_id is not provided'
          });
        }

        // Resoudre l'ID de conversation reel
        let resolvedConversationId = validatedData.conversation_id;

        // Si ce n'est pas un ObjectId MongoDB, chercher par identifier
        if (!/^[0-9a-fA-F]{24}$/.test(validatedData.conversation_id)) {
          const conversation = await fastify.prisma.conversation.findFirst({
            where: { identifier: validatedData.conversation_id }
          });

          if (!conversation) {
            return reply.status(404).send({
              success: false,
              error: `Conversation with identifier '${validatedData.conversation_id}' not found`
            });
          }

          resolvedConversationId = conversation.id;
        }

        // Utiliser le MessagingService pour sauvegarder le message (meme pipeline que WebSocket)
        const messageRequest = {
          conversationId: resolvedConversationId,
          content: validatedData.text,
          originalLanguage: validatedData.source_language || 'auto',
          messageType: 'text',
          isAnonymous: false, // TODO: Detecter depuis l'auth
          anonymousDisplayName: undefined
        };


        // DECLENCHEMENT NON-BLOQUANT - pas d'await !
        messagingService.handleMessage(
          messageRequest,
          'system', // TODO: Recuperer l'ID utilisateur depuis l'auth
          true,
          undefined, // JWT token
          undefined  // Session token
        ).catch((error: any) => {
          logger.error(`[Translation] Async message processing error: ${error.message}`);
        });

        // REPONSE IMMEDIATE - pas d'attente
        return reply.send({
          success: true,
          data: {
            message: 'New message submitted for processing',
            conversationId: validatedData.conversation_id,
            targetLanguage: validatedData.target_language,
            status: 'processing'
          }
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError(logger, '[Translation] Request validation error:', error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          errorCode: 'VALIDATION_ERROR',
          details: error.errors
        });
      }

      return reply.status(500).send({
        success: false,
        error: errorMessage,
        errorCode: 'INTERNAL_ERROR'
      });
    }
  });

  // ===== ROUTE UTILITAIRE POUR RECUPERER LE STATUT =====
  fastify.get('/status/:messageId/:language', async (request: any, reply: FastifyReply) => {
    try {
      const { messageId, language } = request.params;

      const result = await translationService.getTranslation(messageId, language);

      if (result) {
        return reply.send({
          success: true,
          data: {
            status: 'completed',
            translation: result
          }
        });
      } else {
        return reply.send({
          success: true,
          data: {
            status: 'processing'
          }
        });
      }
    } catch (error) {
      logError(logger, '[Translation] Status retrieval error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get translation status',
        errorCode: 'STATUS_ERROR'
      });
    }
  });

  // ===== ROUTE POUR RECUPERER UNE CONVERSATION PAR IDENTIFIANT =====
  fastify.get<{ Params: { identifier: string } }>('/conversation/:identifier', async (request: FastifyRequest<{ Params: { identifier: string } }>, reply: FastifyReply) => {
    try {
      const { identifier } = request.params;


      // Chercher la conversation par identifiant
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { identifier: identifier },
        select: {
          id: true,
          identifier: true,
          title: true,
          type: true,
          createdAt: true,
          lastMessageAt: true,
          _count: {
            select: {
              messages: true,
              members: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: `Conversation with identifier '${identifier}' not found`,
          errorCode: 'CONVERSATION_NOT_FOUND'
        });
      }

      return reply.send({
        success: true,
        data: {
          id: conversation.id, // ObjectId MongoDB
          identifier: conversation.identifier,
          title: conversation.title,
          type: conversation.type,
          createdAt: conversation.createdAt,
          lastMessageAt: conversation.lastMessageAt,
          messageCount: conversation._count.messages,
          memberCount: conversation._count.members
        }
      });

    } catch (error) {
      logError(logger, '[Translation] Conversation retrieval error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        errorCode: 'INTERNAL_ERROR'
      });
    }
  });

}
