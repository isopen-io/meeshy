/**
 * VoiceAnalysisService - Service d'analyse vocale avec persistence
 *
 * Gère les analyses vocales pour:
 * - Attachements audio (MessageAudioTranscription)
 * - Profils vocaux (UserVoiceModel)
 *
 * Features:
 * - Analyse parallèle (batch processing)
 * - Persistence automatique dans MongoDB
 * - Support de multiples types d'analyse (pitch, timbre, MFCC, etc.)
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { AudioTranslateService } from './AudioTranslateService';
import { ZMQTranslationClient } from './ZmqTranslationClient';
import type {
  VoiceQualityAnalysis,
  VoiceAnalysisType,
  VoiceQualityMetrics
} from '@meeshy/shared/types/voice-api';
import logger from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AnalyzeAttachmentOptions {
  attachmentId: string;
  messageId: string;
  userId: string;
  audioPath?: string;
  audioBase64?: string;
  analysisTypes?: VoiceAnalysisType[];
  persist?: boolean; // Défaut: true
}

interface AnalyzeAttachmentResult {
  attachmentId: string;
  messageId: string;
  analysis: VoiceQualityAnalysis;
  persisted: boolean;
}

interface AnalyzeVoiceProfileOptions {
  userId: string;
  audioPath?: string;
  audioBase64?: string;
  analysisTypes?: VoiceAnalysisType[];
  persist?: boolean; // Défaut: true
}

interface AnalyzeVoiceProfileResult {
  userId: string;
  analysis: VoiceQualityAnalysis;
  persisted: boolean;
}

interface BatchAnalysisResult<T> {
  success: T[];
  failures: Array<{
    id: string;
    error: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class VoiceAnalysisService {
  private prisma: PrismaClient;
  private audioTranslateService: AudioTranslateService;

  constructor(prisma: PrismaClient, zmqClient: ZMQTranslationClient) {
    this.prisma = prisma;
    this.audioTranslateService = new AudioTranslateService(prisma, zmqClient);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHEMENT AUDIO ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyser un attachement audio et persister dans MessageAudioTranscription
   */
  async analyzeAttachment(options: AnalyzeAttachmentOptions): Promise<AnalyzeAttachmentResult> {
    const { attachmentId, messageId, userId, audioPath, audioBase64, analysisTypes, persist = true } = options;

    logger.info(`[VoiceAnalysis] Analyzing attachment: ${attachmentId}`);

    try {
      // Appeler le service de traduction pour analyser la voix
      const analysisResult = await this.audioTranslateService.analyzeVoice(userId, {
        audioPath,
        audioBase64,
        analysisTypes
      });

      // Calculer les métriques de qualité
      const qualityMetrics = this.calculateQualityMetrics(analysisResult);

      const analysis: VoiceQualityAnalysis = {
        ...analysisResult,
        qualityMetrics
      };

      let persisted = false;

      // Persister dans MongoDB si demandé
      if (persist) {
        await this.persistAttachmentAnalysis(attachmentId, messageId, analysis);
        persisted = true;
        logger.info(`[VoiceAnalysis] Persisted analysis for attachment: ${attachmentId}`);
      }

      return {
        attachmentId,
        messageId,
        analysis,
        persisted
      };
    } catch (error) {
      logger.error(`[VoiceAnalysis] Failed to analyze attachment ${attachmentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyser plusieurs attachements en parallèle
   */
  async analyzeAttachmentsBatch(
    options: AnalyzeAttachmentOptions[]
  ): Promise<BatchAnalysisResult<AnalyzeAttachmentResult>> {
    logger.info(`[VoiceAnalysis] Batch analyzing ${options.length} attachments`);

    const results = await Promise.allSettled(
      options.map(opt => this.analyzeAttachment(opt))
    );

    const success: AnalyzeAttachmentResult[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success.push(result.value);
      } else {
        failures.push({
          id: options[index].attachmentId,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    logger.info(
      `[VoiceAnalysis] Batch complete: ${success.length} success, ${failures.length} failures`
    );

    return { success, failures };
  }

  /**
   * Persister l'analyse dans MessageAudioTranscription
   */
  private async persistAttachmentAnalysis(
    attachmentId: string,
    messageId: string,
    analysis: VoiceQualityAnalysis
  ): Promise<void> {
    // Chercher la transcription existante
    const transcription = await this.prisma.messageAudioTranscription.findUnique({
      where: { attachmentId }
    });

    if (!transcription) {
      logger.warn(
        `[VoiceAnalysis] No transcription found for attachment ${attachmentId}, skipping persistence`
      );
      return;
    }

    // Mettre à jour avec l'analyse vocale
    await this.prisma.messageAudioTranscription.update({
      where: { attachmentId },
      data: {
        voiceQualityAnalysis: analysis as any, // Prisma Json type
        voiceAnalysisAt: new Date(),
        voiceAnalysisModel: 'voice_quality_analyzer_v1'
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE PROFILE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyser un profil vocal et persister dans UserVoiceModel
   */
  async analyzeVoiceProfile(
    options: AnalyzeVoiceProfileOptions
  ): Promise<AnalyzeVoiceProfileResult> {
    const { userId, audioPath, audioBase64, analysisTypes, persist = true } = options;

    logger.info(`[VoiceAnalysis] Analyzing voice profile for user: ${userId}`);

    try {
      // Appeler le service de traduction pour analyser la voix
      const analysisResult = await this.audioTranslateService.analyzeVoice(userId, {
        audioPath,
        audioBase64,
        analysisTypes
      });

      // Calculer les métriques de qualité
      const qualityMetrics = this.calculateQualityMetrics(analysisResult);

      const analysis: VoiceQualityAnalysis = {
        ...analysisResult,
        qualityMetrics
      };

      let persisted = false;

      // Persister dans MongoDB si demandé
      if (persist) {
        await this.persistVoiceProfileAnalysis(userId, analysis);
        persisted = true;
        logger.info(`[VoiceAnalysis] Persisted analysis for voice profile: ${userId}`);
      }

      return {
        userId,
        analysis,
        persisted
      };
    } catch (error) {
      logger.error(`[VoiceAnalysis] Failed to analyze voice profile ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Analyser plusieurs profils vocaux en parallèle
   */
  async analyzeVoiceProfilesBatch(
    options: AnalyzeVoiceProfileOptions[]
  ): Promise<BatchAnalysisResult<AnalyzeVoiceProfileResult>> {
    logger.info(`[VoiceAnalysis] Batch analyzing ${options.length} voice profiles`);

    const results = await Promise.allSettled(
      options.map(opt => this.analyzeVoiceProfile(opt))
    );

    const success: AnalyzeVoiceProfileResult[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success.push(result.value);
      } else {
        failures.push({
          id: options[index].userId,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    logger.info(
      `[VoiceAnalysis] Batch complete: ${success.length} success, ${failures.length} failures`
    );

    return { success, failures };
  }

  /**
   * Persister l'analyse dans UserVoiceModel
   */
  private async persistVoiceProfileAnalysis(
    userId: string,
    analysis: VoiceQualityAnalysis
  ): Promise<void> {
    // Chercher le profil vocal existant
    const voiceModel = await this.prisma.userVoiceModel.findUnique({
      where: { userId }
    });

    if (!voiceModel) {
      logger.warn(
        `[VoiceAnalysis] No voice model found for user ${userId}, skipping persistence`
      );
      return;
    }

    // Mettre à jour avec l'analyse vocale
    await this.prisma.userVoiceModel.update({
      where: { userId },
      data: {
        voiceCharacteristics: analysis as any, // Prisma Json type
        voiceAnalysisAt: new Date(),
        voiceAnalysisModel: 'voice_quality_analyzer_v1'
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY METRICS CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculer les métriques de qualité à partir de l'analyse vocale
   */
  private calculateQualityMetrics(analysis: any): VoiceQualityMetrics {
    // Score de clarté basé sur l'énergie et la plage dynamique
    const clarity = Math.min(
      1.0,
      (analysis.energy?.dynamicRange || 0) / 60.0 // 60dB = excellente plage dynamique
    );

    // Score de consistance basé sur la variance du pitch
    const pitchVariance = (analysis.pitch?.std || 0) / (analysis.pitch?.mean || 1);
    const consistency = Math.max(0, 1.0 - pitchVariance);

    // Score global (moyenne pondérée)
    const overallScore =
      clarity * 0.4 + consistency * 0.3 + (analysis.classification?.confidence || 0.5) * 0.3;

    // Déterminer la qualité d'entraînement
    let trainingQuality: 'poor' | 'fair' | 'good' | 'excellent';
    if (overallScore >= 0.8) {
      trainingQuality = 'excellent';
    } else if (overallScore >= 0.6) {
      trainingQuality = 'good';
    } else if (overallScore >= 0.4) {
      trainingQuality = 'fair';
    } else {
      trainingQuality = 'poor';
    }

    // Déterminer si convient pour le clonage vocal (seuil: 0.5)
    const suitableForCloning = overallScore >= 0.5 && clarity >= 0.4;

    return {
      overallScore,
      clarity,
      consistency,
      suitableForCloning,
      trainingQuality
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRIEVAL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupérer l'analyse d'un attachement
   */
  async getAttachmentAnalysis(attachmentId: string): Promise<VoiceQualityAnalysis | null> {
    const transcription = await this.prisma.messageAudioTranscription.findUnique({
      where: { attachmentId },
      select: { voiceQualityAnalysis: true }
    });

    if (!transcription?.voiceQualityAnalysis) {
      return null;
    }

    return transcription.voiceQualityAnalysis as any;
  }

  /**
   * Récupérer l'analyse d'un profil vocal
   */
  async getVoiceProfileAnalysis(userId: string): Promise<VoiceQualityAnalysis | null> {
    const voiceModel = await this.prisma.userVoiceModel.findUnique({
      where: { userId },
      select: { voiceCharacteristics: true }
    });

    if (!voiceModel?.voiceCharacteristics) {
      return null;
    }

    return voiceModel.voiceCharacteristics as any;
  }
}
