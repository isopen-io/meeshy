import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MessageTranslationService } from '../services/message-translation/MessageTranslationService';
import { logError } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// Schémas de validation
const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(1000).optional(), // Optional si message_id est fourni
  source_language: z.string().min(2).max(5).optional(),
  target_language: z.string().min(2).max(5),
  model_type: z.enum(['basic', 'medium', 'premium']).optional(), // Optional car on peut le prédire automatiquement
  message_id: z.string().optional(), // ID du message pour retraduction
  conversation_id: z.string().optional() // ID de conversation pour nouveaux messages
}).refine((data) => {
  // Soit text est fourni, soit message_id est fourni
  return (data.text !== undefined && data.text.length > 0) || (data.message_id !== undefined);
}, {
  message: "Either 'text' or 'message_id' must be provided"
});

interface TranslateRequest {
  text?: string;
  sourceLanguage?: string;
  targetLanguage: string;
  modelType?: 'basic' | 'medium' | 'premium';
  messageId?: string;
  conversationId?: string;
}

interface TranslationResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  original_text: string;
  model_used: string;
  confidence: number;
  processing_time: number;
  from_cache: boolean;
  cache_key?: string;
}

// Fonction pour prédire le type de modèle selon la taille du texte
function getPredictedModelType(textLength: number): 'basic' | 'medium' | 'premium' {
  if (textLength < 20) return 'basic';
  if (textLength <= 100) return 'medium';
  return 'premium';
}

// =============================================================================
// OpenAPI Schemas
// =============================================================================

/**
 * OpenAPI schema for translation request body
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
      description: 'Translation model type. If set to "basic", the system will automatically predict the best model based on text length. Optional.',
      example: 'medium'
    },
    message_id: {
      type: 'string',
      description: 'ID of an existing message to retranslate. Either text or message_id must be provided.',
      example: 'msg_123abc'
    },
    conversation_id: {
      type: 'string',
      description: 'ID of the conversation. Required when message_id is not provided.',
      example: 'conv_456def'
    }
  },
  required: ['target_language']
} as const;

/**
 * OpenAPI schema for successful translation response
 */
const translationSuccessResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'ID of the translated message',
          example: 'msg_123abc'
        },
        translated_text: {
          type: 'string',
          description: 'The translated text',
          example: 'Bonjour, comment allez-vous?'
        },
        original_text: {
          type: 'string',
          description: 'The original text before translation',
          example: 'Hello, how are you?'
        },
        source_language: {
          type: 'string',
          description: 'Detected or provided source language code',
          example: 'en'
        },
        target_language: {
          type: 'string',
          description: 'Target language code',
          example: 'fr'
        },
        model_used: {
          type: 'string',
          description: 'Translation model that was used',
          example: 'medium',
          enum: ['basic', 'medium', 'premium', 'fallback', 'none']
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Translation confidence score (0-1)',
          example: 0.95
        },
        processing_time: {
          type: 'number',
          description: 'Processing time in seconds',
          example: 0.234
        },
        from_cache: {
          type: 'boolean',
          description: 'Whether the translation was retrieved from cache',
          example: false
        },
        cache_key: {
          type: 'string',
          description: 'Cache key used for this translation (optional)',
          example: 'trans_en_fr_abc123'
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp of the response',
          example: '2024-01-15T10:30:00.000Z'
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for language list response
 */
const languagesResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        languages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'en' },
              name: { type: 'string', example: 'English' },
              flag: { type: 'string', example: 'US' }
            }
          }
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for language detection request
 */
const detectLanguageRequestSchema = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      minLength: 1,
      description: 'Text to detect language from',
      example: 'Bonjour le monde'
    }
  },
  required: ['text']
} as const;

/**
 * OpenAPI schema for language detection response
 */
const detectLanguageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Detected language code',
          example: 'fr'
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Detection confidence score (0-1)',
          example: 0.7
        },
        text: {
          type: 'string',
          description: 'Original text that was analyzed',
          example: 'Bonjour le monde'
        }
      }
    }
  }
} as const;

/**
 * OpenAPI schema for E2EE translation error
 */
const e2eeErrorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', example: 'E2EE_NOT_TRANSLATABLE' },
    message: {
      type: 'string',
      example: 'End-to-end encrypted messages cannot be translated by the server'
    }
  }
} as const;


export async function translationRoutes(fastify: FastifyInstance) {
  // Récupérer le service de traduction depuis les options
  const translationService = (fastify as any).translationService;

  if (!translationService) {
    throw new Error('MessageTranslationService not provided to translation routes');
  }

  // Route principale de traduction
  fastify.post<{ Body: TranslateRequest }>('/translate-blocking', {
    schema: {
      description: 'Translate text synchronously with blocking behavior. This endpoint waits for the translation to complete before responding. Supports both new message translation and retranslation of existing messages. For E2E encrypted messages, translation is not supported as the server cannot decrypt the content.',
      tags: ['translation'],
      summary: 'Translate text (blocking)',
      body: translateRequestSchema,
      response: {
        200: translationSuccessResponseSchema,
        400: {
          description: 'Bad request - validation error or E2EE message',
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - invalid or missing authentication',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - no access to the requested message',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - message does not exist',
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


      const startTime = Date.now();

      let result: any;
      let messageId: string;

      // Gérer les deux cas : nouveau message vs retraduction
      if (validatedData.message_id) {
        // Cas 1: Retraduction d'un message existant

        // Récupérer le message depuis la base de données
        const existingMessage = await fastify.prisma.message.findUnique({
          where: { id: validatedData.message_id },
          include: {
            conversation: {
              include: {
                members: true
              }
            }
          }
        });


        if (!existingMessage) {
          return reply.status(404).send({
            success: false,
            error: 'Message not found'
          });
        }

        // SECURITY: E2EE messages cannot be translated by the server
        if (existingMessage.encryptionMode === 'e2ee') {
          return reply.status(400).send({
            success: false,
            error: 'E2EE_NOT_TRANSLATABLE',
            message: 'End-to-end encrypted messages cannot be translated by the server'
          });
        }

        // Vérifier l'accès (optionnel, selon vos besoins)
        const userId = (request as any).user?.id;
        if (userId) {
          const hasAccess = existingMessage.conversation.members.some((member: any) => member.userId === userId);
          if (!hasAccess) {
            return reply.status(403).send({
              success: false,
              error: 'Access denied to this message'
            });
          }
        }

        // Utiliser le texte du message existant si pas fourni
        const messageText = validatedData.text || existingMessage.content;
        const messageSourceLanguage = validatedData.source_language || existingMessage.originalLanguage;

        // OPTIMISATION: Éviter la traduction si source = target (après récupération du message)
        if (messageSourceLanguage && messageSourceLanguage !== 'auto' &&
            messageSourceLanguage === validatedData.target_language) {
          return reply.send({
            success: true,
            data: {
              message_id: validatedData.message_id,
              translated_text: messageText,
              source_language: messageSourceLanguage,
              target_language: validatedData.target_language,
              confidence: 1.0,
              processing_time: 0,
              model: 'none', // Pas de traduction nécessaire
              timestamp: new Date().toISOString()
            }
          });
        }

        // Déterminer le type de modèle pour le texte récupéré
        const finalModelType = validatedData.model_type === 'basic'
          ? getPredictedModelType(messageText.length)
          : (validatedData.model_type || 'basic');

        // Créer les données du message pour retraduction
        const messageData: any = {
          id: validatedData.message_id,
          conversationId: existingMessage.conversationId,
          content: messageText,
          originalLanguage: messageSourceLanguage,
          targetLanguage: validatedData.target_language,
          modelType: finalModelType
        };

        // Appeler handleNewMessage qui gère la retraduction
        const handleResult = await translationService.handleNewMessage(messageData);
        messageId = handleResult.messageId;

        // Attendre la vraie traduction avec un timeout plus long
        let translationResult = null;
        const maxWaitTime = 10000; // 10 secondes
        const checkInterval = 500; // Vérifier toutes les 500ms
        let waitedTime = 0;

        while (!translationResult && waitedTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitedTime += checkInterval;

          translationResult = await translationService.getTranslation(messageId, validatedData.target_language);
        }

        if (!translationResult) {
          // Fallback seulement si la traduction n'est pas disponible après le timeout
          result = {
            translatedText: `[${validatedData.target_language.toUpperCase()}] ${messageText}`,
            sourceLanguage: messageSourceLanguage,
            targetLanguage: validatedData.target_language,
            confidenceScore: 0.1,
            processingTime: 0.001,
            modelType: 'fallback'
          };
        } else {
          result = translationResult;
        }

      } else {
        // Cas 2: Nouveau message (comportement WebSocket)

        if (!validatedData.conversation_id) {
          return reply.status(400).send({
            success: false,
            error: 'conversation_id is required when message_id is not provided'
          });
        }

        // Déterminer le type de modèle pour le nouveau message
        const finalModelType = validatedData.model_type === 'basic'
          ? getPredictedModelType(validatedData.text.length)
          : (validatedData.model_type || 'basic');

        // Créer les données du message
        const messageData: any = {
          conversationId: validatedData.conversation_id,
          content: validatedData.text,
          originalLanguage: validatedData.source_language || 'auto',
          targetLanguage: validatedData.target_language, // Passer la langue cible
          modelType: finalModelType
        };

        // Appeler handleNewMessage qui gère le nouveau message
        const handleResult = await translationService.handleNewMessage(messageData);
        messageId = handleResult.messageId;

        // Attendre la vraie traduction avec un timeout plus long
        let translationResult2 = null;
        const maxWaitTime2 = 10000; // 10 secondes
        const checkInterval2 = 500; // Vérifier toutes les 500ms
        let waitedTime2 = 0;

        while (!translationResult2 && waitedTime2 < maxWaitTime2) {
          await new Promise(resolve => setTimeout(resolve, checkInterval2));
          waitedTime2 += checkInterval2;

          translationResult2 = await translationService.getTranslation(messageId, validatedData.target_language);
        }

        if (!translationResult2) {
          // Fallback seulement si la traduction n'est pas disponible après le timeout
          result = {
            translatedText: `[${validatedData.target_language.toUpperCase()}] ${validatedData.text}`,
            sourceLanguage: validatedData.source_language || 'auto',
            targetLanguage: validatedData.target_language,
            confidenceScore: 0.1,
            processingTime: 0.001,
            modelType: 'fallback'
          };
        } else {
          result = translationResult2;
        }
      }

      const processingTime = (Date.now() - startTime) / 1000;


      return reply.send({
        success: true,
        data: {
          message_id: messageId,
          translated_text: result.translatedText,
          original_text: validatedData.text,
          source_language: result.sourceLanguage,
          target_language: result.targetLanguage,
          confidence: result.confidenceScore,
          processing_time: processingTime,
          model: result.modelType || 'basic',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError(request.log, 'Translation error:', error);

      // Determine appropriate status code based on error type
      let statusCode = 500;
      let errorCode = 'TRANSLATION_ERROR';

      if (error instanceof z.ZodError) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
      }

      return reply.status(statusCode).send({
        success: false,
        error: errorCode,
        message: errorMessage
      });
    }
  });

  // Route pour obtenir les langues supportées
  fastify.get('/languages', {
    schema: {
      description: 'Get the list of supported languages for translation. Returns language codes, display names, and associated flag codes.',
      tags: ['translation'],
      summary: 'Get supported languages',
      response: {
        200: languagesResponseSchema,
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: {
        languages: [
          { code: 'fr', name: 'Francais', flag: 'FR' },
          { code: 'en', name: 'English', flag: 'US' },
          { code: 'es', name: 'Espanol', flag: 'ES' },
          { code: 'de', name: 'Deutsch', flag: 'DE' },
          { code: 'pt', name: 'Portugues', flag: 'PT' },
          { code: 'zh', name: 'Chinese', flag: 'CN' },
          { code: 'ja', name: 'Japanese', flag: 'JP' },
          { code: 'ar', name: 'Arabic', flag: 'SA' }
        ]
      }
    });
  });

  // Route pour détecter la langue
  fastify.post<{ Body: { text: string } }>('/detect-language', {
    schema: {
      description: 'Detect the language of a given text using pattern-based analysis. Returns the detected language code and a confidence score. The detection is based on character patterns specific to different languages (accents, special characters).',
      tags: ['translation'],
      summary: 'Detect text language',
      body: detectLanguageRequestSchema,
      response: {
        200: detectLanguageResponseSchema,
        400: {
          description: 'Bad request - validation error (empty text)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error - detection failed',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { text: string } }>, reply: FastifyReply) => {
    try {
      const { text } = request.body;

      if (!text || text.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Text is required'
        });
      }

      // Détection simple basée sur des patterns
      let detectedLanguage = 'en';
      let confidence = 0.5;

      // Détection basique par patterns
      if (/[àáâäçèéêëìíîïñòóôöùúûüÿ]/i.test(text)) {
        detectedLanguage = 'fr';
        confidence = 0.7;
      } else if (/[ñáéíóúü]/i.test(text)) {
        detectedLanguage = 'es';
        confidence = 0.7;
      } else if (/[äöüß]/i.test(text)) {
        detectedLanguage = 'de';
        confidence = 0.7;
      }

      return reply.send({
        success: true,
        data: {
          language: detectedLanguage,
          confidence: confidence,
          text: text
        }
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown language detection error';
      logError(request.log, 'Language detection error:', error);
      return reply.status(500).send({
        success: false,
        error: 'DETECTION_ERROR',
        message: errorMessage
      });
    }
  });

  // Route de test pour le service de traduction
  fastify.get('/test', {
    schema: {
      description: 'Test the translation service by translating a sample text ("Hello world" from English to French). This endpoint is useful for health checks and verifying that the translation service is operational. Returns the translation result with metadata.',
      tags: ['translation'],
      summary: 'Test translation service',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Translation service is working' },
                message_id: { type: 'string', example: 'msg_test123' },
                test_result: {
                  type: 'object',
                  properties: {
                    translated_text: { type: 'string', example: 'Bonjour le monde' },
                    source_language: { type: 'string', example: 'en' },
                    target_language: { type: 'string', example: 'fr' },
                    model: { type: 'string', example: 'basic' },
                    confidence: { type: 'number', example: 0.95 }
                  }
                }
              }
            }
          }
        },
        500: {
          description: 'Internal server error - test failed',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'TEST_FAILED' },
            message: { type: 'string', example: 'Translation service test failed' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Test avec un nouveau message (comportement WebSocket)
      const messageData: any = {
        conversationId: 'test-conversation',
        content: 'Hello world',
        originalLanguage: 'en'
      };

      const handleResult = await translationService.handleNewMessage(messageData);

      // Attendre un peu pour que la traduction soit traitée
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Récupérer le résultat de traduction
      const testResult = await translationService.getTranslation(handleResult.messageId, 'fr');

      if (!testResult) {
        return reply.send({
          success: false,
          error: 'TEST_FAILED',
          message: 'Translation service test failed - no result available',
          data: { message_id: handleResult.messageId }
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Translation service is working',
          message_id: handleResult.messageId,
          test_result: {
            translated_text: testResult.translatedText,
            source_language: testResult.sourceLanguage,
            target_language: testResult.targetLanguage,
            model: testResult.modelType,
            confidence: testResult.confidenceScore
          }
        }
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown translation test error';
      return reply.send({
        success: false,
        error: 'TEST_FAILED',
        message: errorMessage
      });
    }
  });
}
