/**
 * Translation routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentTranslateService } from '../../services/AttachmentTranslateService';
import { ConsentValidationService } from '../../services/ConsentValidationService';
import { messageAttachmentSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { AttachmentParams, TranslateBody } from './types';

export async function registerTranslationRoutes(
  fastify: FastifyInstance,
  authRequired: any,
  prisma: PrismaClient,
  translateService: AttachmentTranslateService | null
) {

  /**
   * POST /attachments/:attachmentId/translate
   * Translate an attachment based on its type
   */
  fastify.post(
    '/attachments/:attachmentId/translate',
    {
      onRequest: [authRequired],
      schema: {
        description: 'Translate an attachment to one or more target languages. Currently supports audio files with speech-to-text, translation, and text-to-speech (with optional voice cloning). Image, video, and document translation are planned but not yet implemented. Translation can be async with webhook notification.',
        tags: ['attachments', 'translation'],
        summary: 'Translate attachment',
        params: {
          type: 'object',
          required: ['attachmentId'],
          properties: {
            attachmentId: {
              type: 'string',
              description: 'Unique attachment identifier'
            }
          }
        },
        body: {
          type: 'object',
          required: ['targetLanguages'],
          properties: {
            targetLanguages: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Array of target language codes (ISO 639-1: en, fr, es, etc.)',
              example: ['en', 'es', 'fr']
            },
            sourceLanguage: {
              type: 'string',
              description: 'Source language code (auto-detected if not provided)',
              example: 'fr'
            },
            generateVoiceClone: {
              type: 'boolean',
              description: 'Whether to clone the original voice in translated audio',
              default: false
            },
            async: {
              type: 'boolean',
              description: 'Whether to process translation asynchronously',
              default: false
            },
            webhookUrl: {
              type: 'string',
              format: 'uri',
              description: 'Webhook URL for async translation completion notification'
            },
            priority: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              description: 'Translation priority (1=lowest, 10=highest)',
              default: 5
            }
          }
        },
        response: {
          200: {
            description: 'Translation completed or queued successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', description: 'Translation status', example: 'completed' },
                  jobId: { type: 'string', description: 'Job ID for async translations' },
                  translations: {
                    type: 'array',
                    description: 'Translated attachment results (for sync translations)',
                    items: messageAttachmentSchema
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - invalid parameters',
            ...errorResponseSchema
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Access denied - user does not own attachment',
            ...errorResponseSchema
          },
          404: {
            description: 'Attachment not found',
            ...errorResponseSchema
          },
          501: {
            description: 'Not implemented - attachment type not supported for translation',
            ...errorResponseSchema
          },
          503: {
            description: 'Service unavailable - translation service not initialized',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!translateService) {
          return reply.status(503).send({
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            message: 'Translation service not available'
          });
        }

        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { attachmentId } = request.params as AttachmentParams;
        const body = request.body as TranslateBody;
        const userId = authContext.userId;

        const attachment = await prisma.messageAttachment.findUnique({
          where: { id: attachmentId },
          select: { mimeType: true }
        });

        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found'
          });
        }

        const mimeType = attachment.mimeType || '';

        // Vérifier les consentements de l'utilisateur pour la traduction
        const consentService = new ConsentValidationService(prisma);
        const consentStatus = await consentService.getConsentStatus(userId);

        // Pour les fichiers audio, vérifier les consentements spécifiques
        if (mimeType.startsWith('audio/')) {
          if (!consentStatus.canTranscribeAudio) {
            return reply.status(403).send({
              success: false,
              error: 'AUDIO_TRANSCRIPTION_NOT_ENABLED',
              message: 'You must enable audio transcription consent to translate audio',
              requiredConsents: [
                'dataProcessingConsentAt',
                'voiceDataConsentAt',
                'audioTranscriptionEnabledAt'
              ]
            });
          }

          if (!consentStatus.canTranslateAudio) {
            return reply.status(403).send({
              success: false,
              error: 'AUDIO_TRANSLATION_NOT_ENABLED',
              message: 'You must enable audio translation consent to translate audio',
              requiredConsents: [
                'audioTranslationEnabledAt',
                'audioTranscriptionEnabledAt',
                'textTranslationEnabledAt'
              ]
            });
          }

          if (body.generateVoiceClone && !consentStatus.canUseVoiceCloning) {
            return reply.status(403).send({
              success: false,
              error: 'VOICE_CLONING_NOT_ENABLED',
              message: 'You must enable voice cloning consent to use this feature',
              requiredConsents: [
                'voiceDataConsentAt',
                'voiceProfileConsentAt',
                'voiceCloningConsentAt',
                'voiceCloningEnabledAt'
              ]
            });
          }
        }

        const result = await translateService.translate(userId, attachmentId, {
          targetLanguages: body.targetLanguages,
          sourceLanguage: body.sourceLanguage,
          generateVoiceClone: body.generateVoiceClone,
          async: body.async,
          webhookUrl: body.webhookUrl,
          priority: body.priority
        });

        if (!result.success) {
          const statusCode = result.errorCode === 'ATTACHMENT_NOT_FOUND' ? 404 :
                            result.errorCode === 'ACCESS_DENIED' ? 403 :
                            result.errorCode === 'NOT_IMPLEMENTED' ? 501 :
                            400;
          return reply.status(statusCode).send({
            success: false,
            error: result.errorCode,
            message: result.error
          });
        }

        return reply.send({
          success: true,
          data: result.data
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error translating attachment:', error);
        return reply.status(500).send({
          success: false,
          error: 'TRANSLATION_FAILED',
          message: error.message || 'Error translating attachment'
        });
      }
    }
  );

  /**
   * POST /attachments/:attachmentId/transcribe
   * Transcribe an audio attachment to text only (no translation, no TTS)
   */
  fastify.post(
    '/attachments/:attachmentId/transcribe',
    {
      onRequest: [authRequired],
      schema: {
        description: 'Transcribe an audio attachment to text only, without translation or voice synthesis. Uses Whisper for accurate speech-to-text. Returns the attachment enriched with transcription data including text, detected language, confidence score, and word-level timestamps.',
        tags: ['attachments', 'transcription'],
        summary: 'Transcribe audio attachment',
        params: {
          type: 'object',
          required: ['attachmentId'],
          properties: {
            attachmentId: {
              type: 'string',
              description: 'Unique attachment identifier'
            }
          }
        },
        response: {
          200: {
            description: 'Transcription completed or processing started',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  taskId: { type: 'string', nullable: true, description: 'Task ID for tracking (null if already completed)' },
                  status: { type: 'string', description: 'Processing status', enum: ['completed', 'processing'] },
                  attachment: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      messageId: { type: 'string' },
                      fileName: { type: 'string' },
                      fileUrl: { type: 'string' },
                      duration: { type: 'number', nullable: true },
                      mimeType: { type: 'string' }
                    }
                  },
                  transcription: {
                    type: 'object',
                    nullable: true,
                    description: 'Transcription data (null if still processing)',
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      language: { type: 'string' },
                      confidence: { type: 'number' },
                      source: { type: 'string' },
                      segments: { type: 'array' },
                      durationMs: { type: 'number' }
                    }
                  },
                  translatedAudios: {
                    type: 'array',
                    description: 'Translated audio versions (if any)'
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - not an audio attachment',
            ...errorResponseSchema
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Feature not enabled',
            ...errorResponseSchema
          },
          404: {
            description: 'Attachment not found',
            ...errorResponseSchema
          },
          503: {
            description: 'Service unavailable - transcription service not initialized',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const translationService = (fastify as any).translationService;
        if (!translationService) {
          return reply.status(503).send({
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            message: 'Translation service not available'
          });
        }

        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { attachmentId } = request.params as AttachmentParams;
        const userId = authContext.userId;

        const attachment = await prisma.messageAttachment.findUnique({
          where: { id: attachmentId },
          select: { id: true, mimeType: true, uploadedBy: true }
        });

        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found'
          });
        }

        if (!attachment.mimeType?.startsWith('audio/')) {
          return reply.status(400).send({
            success: false,
            error: 'INVALID_ATTACHMENT_TYPE',
            message: 'Only audio attachments can be transcribed'
          });
        }

        // Vérifier les consentements de l'utilisateur pour la transcription audio
        const consentService = new ConsentValidationService(prisma);
        const consentStatus = await consentService.getConsentStatus(userId);

        if (!consentStatus.canTranscribeAudio) {
          return reply.status(403).send({
            success: false,
            error: 'AUDIO_TRANSCRIPTION_NOT_ENABLED',
            message: 'You must enable audio transcription consent to use this feature',
            requiredConsents: [
              'dataProcessingConsentAt',
              'voiceDataConsentAt',
              'audioTranscriptionEnabledAt'
            ]
          });
        }

        const existingData = await translationService.getAttachmentWithTranscription(attachmentId);

        if (!existingData) {
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found'
          });
        }

        if (existingData.transcription) {
          return reply.send({
            success: true,
            data: {
              taskId: null,
              status: 'completed',
              attachment: existingData.attachment,
              transcription: existingData.transcription,
              translatedAudios: existingData.translatedAudios
            }
          });
        }

        const result = await translationService.transcribeAttachment(attachmentId);

        if (!result) {
          return reply.status(500).send({
            success: false,
            error: 'TRANSCRIPTION_FAILED',
            message: 'Failed to start transcription'
          });
        }

        return reply.send({
          success: true,
          data: {
            taskId: result.taskId,
            status: 'processing',
            attachment: result.attachment,
            transcription: null,
            translatedAudios: []
          }
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error transcribing attachment:', error);
        return reply.status(500).send({
          success: false,
          error: 'TRANSCRIPTION_FAILED',
          message: error.message || 'Error transcribing attachment'
        });
      }
    }
  );
}
