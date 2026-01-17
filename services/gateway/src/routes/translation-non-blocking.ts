import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError, logger } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

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

// =============================================================================
// OpenAPI Schemas
// =============================================================================

/**
 * OpenAPI schema for non-blocking translation request body
 */
const translateRequestSchema = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      minLength: 1,
      maxLength: 1000,
      description: 'Text to translate. Required if message_id is not provided.',
      example: 'Hello, how are you?'
    },
    source_language: {
      type: 'string',
      minLength: 2,
      maxLength: 5,
      description: 'Source language code (ISO 639-1). Optional, can be auto-detected.',
      example: 'en'
    },
    target_language: {
      type: 'string',
      minLength: 2,
      maxLength: 5,
      description: 'Target language code (ISO 639-1). Required.',
      example: 'fr'
    },
    model_type: {
      type: 'string',
      enum: ['basic', 'medium', 'premium'],
      description: 'Translation model type. Optional, defaults to "basic".',
      example: 'medium'
    },
    message_id: {
      type: 'string',
      description: 'ID of an existing message to retranslate. Either text or message_id must be provided.',
      example: 'msg_123abc'
    },
    conversation_id: {
      type: 'string',
      description: 'ID of the conversation or identifier. Required when message_id is not provided.',
      example: 'conv_456def'
    }
  },
  required: ['target_language']
} as const;

/**
 * OpenAPI schema for non-blocking translation success response
 */
const translationNonBlockingResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Status message',
          example: 'Translation request submitted successfully'
        },
        messageId: {
          type: 'string',
          description: 'ID of the message being translated',
          example: 'msg_123abc'
        },
        conversationId: {
          type: 'string',
          description: 'ID of the conversation',
          example: 'conv_456def'
        },
        targetLanguage: {
          type: 'string',
          description: 'Target language code',
          example: 'fr'
        },
        status: {
          type: 'string',
          description: 'Processing status',
          example: 'processing',
          enum: ['processing']
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for translation status response
 */
const translationStatusResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Translation status',
          example: 'completed',
          enum: ['processing', 'completed']
        },
        translation: {
          type: 'object',
          description: 'Translation result if completed',
          properties: {
            translatedText: { type: 'string', example: 'Bonjour, comment allez-vous?' },
            sourceLanguage: { type: 'string', example: 'en' },
            targetLanguage: { type: 'string', example: 'fr' },
            confidenceScore: { type: 'number', example: 0.95 },
            modelType: { type: 'string', example: 'medium' },
            processingTime: { type: 'number', example: 0.234 }
          }
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for conversation response
 */
const conversationResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'MongoDB ObjectId of the conversation',
          example: '507f1f77bcf86cd799439011'
        },
        identifier: {
          type: 'string',
          description: 'Human-readable conversation identifier',
          example: 'conv_456def'
        },
        title: {
          type: 'string',
          description: 'Conversation title',
          example: 'Support Chat'
        },
        type: {
          type: 'string',
          description: 'Conversation type',
          example: 'direct',
          enum: ['direct', 'group', 'channel']
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          description: 'Conversation creation timestamp',
          example: '2024-01-15T10:30:00.000Z'
        },
        lastMessageAt: {
          type: 'string',
          format: 'date-time',
          description: 'Last message timestamp',
          example: '2024-01-15T14:30:00.000Z'
        },
        messageCount: {
          type: 'number',
          description: 'Number of messages in the conversation',
          example: 42
        },
        memberCount: {
          type: 'number',
          description: 'Number of members in the conversation',
          example: 3
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for status route params
 */
const statusParamsSchema = {
  type: 'object',
  properties: {
    messageId: {
      type: 'string',
      description: 'ID of the message',
      example: 'msg_123abc'
    },
    language: {
      type: 'string',
      description: 'Target language code',
      example: 'fr'
    }
  },
  required: ['messageId', 'language']
} as const;

/**
 * OpenAPI schema for conversation params
 */
const conversationParamsSchema = {
  type: 'object',
  properties: {
    identifier: {
      type: 'string',
      description: 'Conversation identifier (human-readable or ObjectId)',
      example: 'conv_456def'
    }
  },
  required: ['identifier']
} as const;

// ===== ROUTE NON-BLOQUANTE =====
export async function translationRoutes(fastify: FastifyInstance, options: any) {
  // Recuperer les services depuis l'instance fastify (comme dans translation.ts)
  const translationService = (fastify as any).translationService;
  const messagingService = (fastify as any).messagingService;

  if (!translationService) {
    throw new Error('MessageTranslationService not provided to translation routes');
  }

  if (!messagingService) {
    throw new Error('MessagingService not provided to translation routes');
  }


  // ===== ROUTE PRINCIPALE NON-BLOQUANTE =====
  fastify.post<{ Body: TranslateRequest }>('/translate', {
    schema: {
      description: 'Translate text asynchronously with non-blocking behavior. This endpoint submits a translation request and returns immediately with a "processing" status. The actual translation happens asynchronously in the background. Use the GET /status/:messageId/:language endpoint to check translation status and retrieve the result. Supports both new message translation and retranslation of existing messages.',
      tags: ['translation'],
      summary: 'Translate text (non-blocking)',
      body: translateRequestSchema,
      response: {
        200: translationNonBlockingResponseSchema,
        400: {
          description: 'Bad request - validation error or missing required fields',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - message or conversation does not exist',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error - translation service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: TranslateRequest }>, reply: FastifyReply) => {
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
  fastify.get('/status/:messageId/:language', {
    schema: {
      description: 'Get the translation status and result for a specific message and target language. Returns "processing" status if the translation is still being processed, or "completed" status with the translation result if available. This endpoint is used to poll for translation completion after submitting a non-blocking translation request.',
      tags: ['translation'],
      summary: 'Get translation status',
      params: statusParamsSchema,
      response: {
        200: translationStatusResponseSchema,
        500: {
          description: 'Internal server error - failed to retrieve translation status',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: any, reply: FastifyReply) => {
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
  fastify.get<{ Params: { identifier: string } }>('/conversation/:identifier', {
    schema: {
      description: 'Retrieve conversation details by identifier. Accepts either a human-readable identifier or a MongoDB ObjectId. Returns conversation metadata including ID, title, type, timestamps, and counts of messages and members. This endpoint is useful for validating conversation identifiers before submitting translation requests.',
      tags: ['translation'],
      summary: 'Get conversation by identifier',
      params: conversationParamsSchema,
      response: {
        200: conversationResponseSchema,
        404: {
          description: 'Not found - conversation does not exist',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error - failed to retrieve conversation',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { identifier: string } }>, reply: FastifyReply) => {
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
