/**
 * Voice API Routes - Main entry point
 * All voice operations go through Gateway -> ZMQ -> Translator
 */

import { FastifyInstance } from 'fastify';
import { AudioTranslateService } from '../../services/AudioTranslateService';
import { MessageTranslationService } from '../../services/MessageTranslationService';
import { logger } from '../../utils/logger';
import { registerTranslationRoutes } from './translation';
import { registerAnalysisRoutes } from './analysis';

export function registerVoiceRoutes(
  fastify: FastifyInstance,
  audioTranslateService: AudioTranslateService,
  translationService?: MessageTranslationService
): void {
  const prefix = '/api/v1/voice';

  // Register translation and transcription routes
  registerTranslationRoutes(fastify, audioTranslateService, translationService, prefix);

  // Register analysis, feedback, and monitoring routes
  registerAnalysisRoutes(fastify, audioTranslateService, prefix);

  logger.info('[VoiceRoutes] Voice API routes registered at /api/v1/voice/*');
}
