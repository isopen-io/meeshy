/**
 * Voice Translation Routes - Translation and transcription endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AudioTranslateService, AudioTranslateError } from '../../services/AudioTranslateService';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { logger } from '../../utils/logger';
import {
  voiceTranslationResultSchema,
  translationJobSchema,
  errorResponseSchema,
  getUserId
} from './types';

function errorResponse(reply: FastifyReply, error: unknown, statusCode: number = 500) {
  if (error instanceof AudioTranslateError) {
    return reply.status(statusCode).send({
      success: false,
      error: error.code,
      message: error.message
    });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return reply.status(statusCode).send({
    success: false,
    error: 'INTERNAL_ERROR',
    message: message
  });
}

export function registerTranslationRoutes(
  fastify: FastifyInstance,
  audioTranslateService: AudioTranslateService,
  translationService: MessageTranslationService | undefined,
  prefix: string
): void {
  /**
   * POST /api/v1/voice/translate
   * Flexible voice translation - accepts audioBase64 OR attachmentId
   */
  fastify.post(`${prefix}/translate`, {
    schema: {
      description: 'Translate audio to one or more target languages with voice cloning support. Accepts either direct audio (audioBase64) or an existing attachment (attachmentId). When using attachmentId, returns existing translations if available.',
      tags: ['voice'],
      summary: 'Translate audio (flexible input)',
      body: {
        type: 'object',
        properties: {
          audioBase64: {
            type: 'string',
            description: 'Audio data in base64 format (alternative to attachmentId)'
          },
          attachmentId: {
            type: 'string',
            description: 'ID of an existing audio attachment (alternative to audioBase64)',
            example: '507f1f77bcf86cd799439011'
          },
          targetLanguages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of target language codes (ISO 639-1). Required.',
            example: ['en', 'es']
          },
          sourceLanguage: {
            type: 'string',
            description: 'Source language code (auto-detected if not provided)',
            example: 'fr'
          },
          generateVoiceClone: {
            type: 'boolean',
            default: true,
            description: 'Whether to clone the original voice in the translated audio'
          }
        }
      },
      response: {
        200: {
          description: 'Translation completed or processing started',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                taskId: { type: 'string', nullable: true, description: 'Task ID for tracking (null if already completed)' },
                status: { type: 'string', description: 'Processing status', enum: ['completed', 'processing'] },
                attachment: { type: 'object', nullable: true },
                transcription: { type: 'object', nullable: true },
                translatedAudios: { type: 'array' },
                result: voiceTranslationResultSchema
              }
            }
          }
        },
        400: {
          description: 'Bad request - must provide audioBase64 or attachmentId',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Attachment not found (when using attachmentId)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error or translation service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: {
      audioBase64?: string;
      attachmentId?: string;
      targetLanguages?: string[];
      sourceLanguage?: string;
      generateVoiceClone?: boolean;
    }
  }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { audioBase64, attachmentId, targetLanguages, sourceLanguage, generateVoiceClone } = request.body;

      if (!audioBase64 && !attachmentId) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Must provide either audioBase64 or attachmentId'
        });
      }

      if (!targetLanguages || targetLanguages.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'targetLanguages is required'
        });
      }

      if (audioBase64) {
        const result = await audioTranslateService.translateSync(userId, {
          audioBase64,
          targetLanguages,
          sourceLanguage,
          generateVoiceClone: generateVoiceClone ?? true
        });

        return reply.status(200).send({
          success: true,
          data: {
            taskId: null,
            status: 'completed',
            attachment: null,
            transcription: result.originalAudio ? {
              text: result.originalAudio.transcription,
              language: result.originalAudio.language,
              confidence: result.originalAudio.confidence,
              durationMs: result.originalAudio.durationMs
            } : null,
            translatedAudios: result.translations || [],
            result
          }
        });
      }

      if (!translationService) {
        return reply.status(500).send({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Translation service not available'
        });
      }

      const existingData = await translationService.getAttachmentWithTranscription(attachmentId!);

      if (!existingData) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Attachment not found'
        });
      }

      if (existingData.translatedAudios?.length > 0) {
        return reply.status(200).send({
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

      const result = await translationService.translateAttachment(attachmentId!, {
        targetLanguages,
        generateVoiceClone
      });

      if (!result) {
        return reply.status(500).send({
          success: false,
          error: 'TRANSLATION_FAILED',
          message: 'Failed to start translation'
        });
      }

      return reply.status(200).send({
        success: true,
        data: {
          taskId: result.taskId,
          status: 'processing',
          attachment: result.attachment,
          transcription: null,
          translatedAudios: []
        }
      });
    } catch (error) {
      logger.error('[VoiceRoutes] Translate error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * POST /api/v1/voice/translate/async
   * Asynchronous voice translation with advanced options
   */
  fastify.post(`${prefix}/translate/async`, {
    schema: {
      description: 'Asynchronous voice translation with advanced options. Accepts audioBase64 or attachmentId. Supports webhooks for completion notification, priority queuing, and custom metadata.',
      tags: ['voice'],
      summary: 'Async voice translation with advanced options',
      body: {
        type: 'object',
        properties: {
          audioBase64: {
            type: 'string',
            description: 'Audio data in base64 format (alternative to attachmentId)'
          },
          attachmentId: {
            type: 'string',
            description: 'ID of an existing audio attachment (alternative to audioBase64)',
            example: '507f1f77bcf86cd799439011'
          },
          targetLanguages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of target language codes (ISO 639-1). Required.',
            example: ['en', 'es', 'de']
          },
          sourceLanguage: {
            type: 'string',
            description: 'Source language code (auto-detected if not provided)',
            example: 'fr'
          },
          generateVoiceClone: {
            type: 'boolean',
            default: true,
            description: 'Whether to clone the original voice in the translated audio'
          },
          webhookUrl: {
            type: 'string',
            format: 'uri',
            description: 'URL to receive completion notification via POST'
          },
          priority: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 1,
            description: 'Job priority (1=lowest, 10=highest)'
          },
          callbackMetadata: {
            type: 'object',
            description: 'Custom metadata to include in webhook callback'
          }
        }
      },
      response: {
        202: {
          description: 'Translation job accepted and queued',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                jobId: { type: 'string', description: 'Unique job identifier for status tracking' },
                taskId: { type: 'string', description: 'Task ID (alias for jobId)' },
                status: { type: 'string', enum: ['pending', 'processing'], description: 'Initial job status' },
                attachment: { type: 'object', nullable: true }
              }
            }
          }
        },
        400: {
          description: 'Bad request - must provide audioBase64 or attachmentId',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Attachment not found (when using attachmentId)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: {
      audioBase64?: string;
      attachmentId?: string;
      targetLanguages?: string[];
      sourceLanguage?: string;
      generateVoiceClone?: boolean;
      webhookUrl?: string;
      priority?: number;
      callbackMetadata?: Record<string, any>;
    }
  }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const {
        audioBase64,
        attachmentId,
        targetLanguages,
        sourceLanguage,
        generateVoiceClone,
        webhookUrl,
        priority,
        callbackMetadata
      } = request.body;

      if (!audioBase64 && !attachmentId) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Must provide either audioBase64 or attachmentId'
        });
      }

      if (!targetLanguages || targetLanguages.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'targetLanguages is required'
        });
      }

      if (audioBase64) {
        const result = await audioTranslateService.translateAsync(userId, {
          audioBase64,
          targetLanguages,
          sourceLanguage,
          generateVoiceClone: generateVoiceClone ?? true,
          webhookUrl,
          priority,
          callbackMetadata
        });

        return reply.status(202).send({
          success: true,
          data: {
            jobId: result.jobId,
            taskId: result.jobId,
            status: result.status,
            attachment: null
          }
        });
      }

      if (!translationService) {
        return reply.status(500).send({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Translation service not available'
        });
      }

      const result = await translationService.translateAttachment(attachmentId!, {
        targetLanguages,
        generateVoiceClone
      });

      if (!result) {
        return reply.status(500).send({
          success: false,
          error: 'TRANSLATION_FAILED',
          message: 'Failed to start translation'
        });
      }

      return reply.status(202).send({
        success: true,
        data: {
          jobId: result.taskId,
          taskId: result.taskId,
          status: 'processing',
          attachment: result.attachment
        }
      });
    } catch (error) {
      logger.error('[VoiceRoutes] Translate async error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * GET /api/v1/voice/job/:jobId
   * Get job status
   */
  fastify.get(`${prefix}/job/:jobId`, {
    schema: {
      description: 'Check the status of an asynchronous translation job. Returns job metadata, current progress, and results if completed. Jobs can be in pending, processing, completed, failed, or cancelled status.',
      tags: ['voice'],
      summary: 'Get translation job status',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: {
            type: 'string',
            description: 'Unique job identifier returned from POST /translate/async'
          }
        }
      },
      response: {
        200: {
          description: 'Job status retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: translationJobSchema
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Job not found or access denied',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { jobId } = request.params;
      const result = await audioTranslateService.getJobStatus(userId, jobId);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Get job status error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * DELETE /api/v1/voice/job/:jobId
   * Cancel a pending job
   */
  fastify.delete(`${prefix}/job/:jobId`, {
    schema: {
      description: 'Cancel a pending or processing translation job. Only jobs that have not completed can be cancelled. Returns the updated job status. Cancelled jobs cannot be resumed.',
      tags: ['voice'],
      summary: 'Cancel translation job',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: {
            type: 'string',
            description: 'Unique job identifier to cancel'
          }
        }
      },
      response: {
        200: {
          description: 'Job cancelled successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                jobId: { type: 'string', description: 'Cancelled job ID' },
                status: { type: 'string', enum: ['cancelled'], description: 'Updated job status' }
              }
            }
          }
        },
        400: {
          description: 'Job cannot be cancelled (already completed or failed)',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Job not found or access denied',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      const { jobId } = request.params;
      const result = await audioTranslateService.cancelJob(userId, jobId);
      return reply.status(200).send({ success: true, data: result });
    } catch (error) {
      logger.error('[VoiceRoutes] Cancel job error:', error);
      return errorResponse(reply, error);
    }
  });

  /**
   * POST /api/v1/voice/transcribe
   * Flexible transcription - accepts file upload, audioBase64, OR attachmentId
   */
  fastify.post(`${prefix}/transcribe`, {
    schema: {
      description: 'Transcribe audio to text using Whisper. Accepts file upload (multipart/form-data), direct audio (audioBase64), or existing attachment (attachmentId). Returns transcription with detected language, confidence score, and word-level timestamps. OpenAI-compatible when using file upload.',
      tags: ['voice'],
      summary: 'Transcribe audio (flexible input)',
      consumes: ['multipart/form-data', 'application/json'],
      body: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Audio file (multipart/form-data) - OpenAI compatible'
          },
          audioBase64: {
            type: 'string',
            description: 'Audio data in base64 format (alternative to file/attachmentId)'
          },
          audioFormat: {
            type: 'string',
            description: 'Audio format when using audioBase64 (required with audioBase64)',
            enum: ['wav', 'mp3', 'ogg', 'webm', 'm4a', 'mp4', 'aac', 'flac'],
            example: 'webm'
          },
          attachmentId: {
            type: 'string',
            description: 'ID of an existing audio attachment (alternative to file/audioBase64)',
            example: '507f1f77bcf86cd799439011'
          },
          language: {
            type: 'string',
            description: 'Hint for source language (optional, auto-detected if not provided)',
            example: 'fr'
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
                taskId: { type: 'string', nullable: true, description: 'Task ID for tracking (null if completed)' },
                status: { type: 'string', description: 'Processing status', enum: ['completed', 'processing'] },
                attachment: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    messageId: { type: 'string' },
                    fileName: { type: 'string' },
                    fileUrl: { type: 'string' },
                    duration: { type: 'number' },
                    mimeType: { type: 'string' }
                  }
                },
                transcription: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    text: { type: 'string' },
                    language: { type: 'string' },
                    confidence: { type: 'number' },
                    source: { type: 'string' },
                    segments: { type: 'array' },
                    durationMs: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - must provide audioBase64 or attachmentId',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Attachment not found (when using attachmentId)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error or transcription service failure',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    try {
      let audioBase64: string | undefined;
      let audioFormat: string | undefined;
      let attachmentId: string | undefined;
      let language: string | undefined;

      const contentType = request.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');

      if (isMultipart) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'file') {
            const buffer = await part.toBuffer();
            audioBase64 = buffer.toString('base64');
            const filename = part.filename || '';
            const ext = filename.split('.').pop()?.toLowerCase();
            audioFormat = ext || part.mimetype?.split('/').pop() || 'wav';
            logger.info(`[VoiceRoutes] Transcribe file upload: ${filename}, format=${audioFormat}, size=${(buffer.length / 1024).toFixed(1)}KB`);
          } else if (part.type === 'field') {
            if (part.fieldname === 'language') language = part.value as string;
            if (part.fieldname === 'attachmentId') attachmentId = part.value as string;
            if (part.fieldname === 'audioFormat') audioFormat = part.value as string;
          }
        }
      } else {
        const body = request.body as {
          audioBase64?: string;
          audioFormat?: string;
          attachmentId?: string;
          language?: string;
        };
        audioBase64 = body.audioBase64;
        audioFormat = body.audioFormat;
        attachmentId = body.attachmentId;
        language = body.language;
      }

      if (!audioBase64 && !attachmentId) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Must provide file, audioBase64, or attachmentId'
        });
      }

      if (audioBase64) {
        if (!audioFormat) {
          return reply.status(400).send({
            success: false,
            error: 'INVALID_REQUEST',
            message: 'audioFormat is required when using audioBase64'
          });
        }

        if (!isMultipart) {
          logger.info(`[VoiceRoutes] Transcribe direct audio: format=${audioFormat}, size=${(audioBase64.length * 0.75 / 1024).toFixed(1)}KB`);
        }

        const result = await audioTranslateService.transcribeOnly(userId, {
          audioBase64,
          audioFormat,
          language,
          saveToDatabase: false
        });

        return reply.status(200).send({
          success: true,
          data: {
            taskId: null,
            status: 'completed',
            attachment: null,
            transcription: {
              text: result.text,
              language: result.language,
              confidence: result.confidence,
              source: result.source,
              segments: result.segments,
              durationMs: result.durationMs
            },
            translatedAudios: []
          }
        });
      }

      if (!translationService) {
        return reply.status(500).send({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Translation service not available'
        });
      }

      const existingData = await translationService.getAttachmentWithTranscription(attachmentId!);

      if (!existingData) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Attachment not found'
        });
      }

      if (existingData.transcription) {
        return reply.status(200).send({
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

      const result = await translationService.transcribeAttachment(attachmentId!);

      if (!result) {
        return reply.status(500).send({
          success: false,
          error: 'TRANSCRIPTION_FAILED',
          message: 'Failed to start transcription'
        });
      }

      return reply.status(200).send({
        success: true,
        data: {
          taskId: result.taskId,
          status: 'processing',
          attachment: result.attachment,
          transcription: null,
          translatedAudios: []
        }
      });
    } catch (error) {
      logger.error('[VoiceRoutes] Transcribe error:', error);
      return errorResponse(reply, error);
    }
  });
}
