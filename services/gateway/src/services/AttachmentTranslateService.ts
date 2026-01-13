/**
 * AttachmentTranslateService - Dispatcher for attachment translation
 *
 * Routes translation requests to the appropriate service based on attachment type:
 * - audio/* → AudioTranslateService
 * - image/* → ImageTranslateService (stub)
 * - video/* → VideoTranslateService (stub)
 * - application/pdf, text/* → DocumentTranslateService (stub)
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { AudioTranslateService, AudioTranslationResult } from './AudioTranslateService';
import { ZMQTranslationClient } from './ZmqTranslationClient';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TranslateOptions {
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
  async?: boolean;
  webhookUrl?: string;
  priority?: number;

  /**
   * Pour les transferts: utiliser la voix de l'émetteur ORIGINAL (pas le forwarder)
   * Par défaut: true (utilise toujours la voix originale)
   */
  useOriginalVoice?: boolean;
}

export interface AsyncJobSubmitResult {
  jobId: string;
  status: string;
}

export interface TranslationResult {
  type: 'audio' | 'image' | 'video' | 'document';
  attachmentId: string;
  result: AudioTranslationResult | AsyncJobSubmitResult | ImageTranslationResult | VideoTranslationResult | DocumentTranslationResult;
}

export interface ImageTranslationResult {
  translationId: string;
  originalText: string;
  translations: Array<{
    targetLanguage: string;
    translatedText: string;
    overlayImageUrl?: string;
  }>;
}

export interface VideoTranslationResult {
  translationId: string;
  jobId?: string;
  status: string;
}

export interface DocumentTranslationResult {
  translationId: string;
  originalText: string;
  translations: Array<{
    targetLanguage: string;
    translatedText: string;
    translatedDocumentUrl?: string;
  }>;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class AttachmentTranslateService {
  private prisma: PrismaClient;
  private audioTranslateService: AudioTranslateService;
  private uploadBasePath: string;

  constructor(prisma: PrismaClient, zmqClient: ZMQTranslationClient) {
    this.prisma = prisma;
    this.audioTranslateService = new AudioTranslateService(zmqClient);
    this.uploadBasePath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads', 'attachments');
  }

  /**
   * Translate an attachment based on its type
   */
  async translate(
    userId: string,
    attachmentId: string,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    try {
      // 1. Get attachment from database
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        include: {
          message: {
            select: {
              conversationId: true,
              senderId: true
            }
          }
        }
      });

      if (!attachment) {
        return {
          success: false,
          error: 'Attachment not found',
          errorCode: 'ATTACHMENT_NOT_FOUND'
        };
      }

      // 2. Verify user has access to this attachment
      const hasAccess = await this.verifyUserAccess(userId, attachment);
      if (!hasAccess) {
        return {
          success: false,
          error: 'Access denied to this attachment',
          errorCode: 'ACCESS_DENIED'
        };
      }

      // 3. Determine attachment type and route to appropriate service
      const attachmentType = this.getAttachmentType(attachment.mimeType);

      switch (attachmentType) {
        case 'audio':
          return await this.translateAudio(userId, attachment, options);

        case 'image':
          return await this.translateImage(userId, attachment, options);

        case 'video':
          return await this.translateVideo(userId, attachment, options);

        case 'document':
          return await this.translateDocument(userId, attachment, options);

        default:
          return {
            success: false,
            error: `Unsupported attachment type: ${attachment.mimeType}`,
            errorCode: 'UNSUPPORTED_TYPE'
          };
      }
    } catch (error) {
      console.error('[AttachmentTranslateService] Translation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed',
        errorCode: 'TRANSLATION_FAILED'
      };
    }
  }

  /**
   * Get translation status for async jobs
   */
  async getTranslationStatus(
    userId: string,
    jobId: string
  ): Promise<ServiceResult<{ status: string; progress?: number; result?: any }>> {
    // Delegate to audio service for now (only audio supports async)
    return this.audioTranslateService.getJobStatus(userId, jobId);
  }

  /**
   * Cancel a translation job
   */
  async cancelTranslation(
    userId: string,
    jobId: string
  ): Promise<ServiceResult<{ cancelled: boolean }>> {
    return this.audioTranslateService.cancelJob(userId, jobId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private getAttachmentType(mimeType: string): 'audio' | 'image' | 'video' | 'document' | 'unknown' {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
    return 'unknown';
  }

  private async verifyUserAccess(userId: string, attachment: any): Promise<boolean> {
    // User uploaded the attachment
    if (attachment.uploadedBy === userId) {
      return true;
    }

    // User is part of the conversation
    if (attachment.message?.conversationId) {
      const member = await this.prisma.conversationMember.findFirst({
        where: {
          conversationId: attachment.message.conversationId,
          userId: userId,
          isActive: true
        }
      });
      return !!member;
    }

    return false;
  }

  private async readAttachmentFile(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.uploadBasePath, filePath);
    return fs.readFile(fullPath);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPE-SPECIFIC TRANSLATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private async translateAudio(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // =========================================================================
    // 1. TROUVER L'ATTACHEMENT ORIGINAL ET L'ÉMETTEUR ORIGINAL
    // =========================================================================

    // Trouver l'attachement original en cas de transferts multiples (A → B → C → D)
    const { originalAttachmentId, originalSenderId } = await this._findOriginalAttachmentAndSender(attachment.id);

    // L'utilisateur dont la voix sera utilisée (par défaut: émetteur original)
    const useOriginalVoice = options.useOriginalVoice !== false; // true par défaut
    const voiceUserId = useOriginalVoice && originalSenderId ? originalSenderId : userId;

    // =========================================================================
    // 2. RÉCUPÉRER LE PROFIL VOCAL DE L'ÉMETTEUR ORIGINAL (si disponible)
    // =========================================================================

    const voiceProfile = await this._getVoiceProfile(voiceUserId);

    // =========================================================================
    // 3. VÉRIFIER LES TRADUCTIONS EXISTANTES (cache/réutilisation)
    // =========================================================================

    // Récupérer les traductions existantes de l'attachement ORIGINAL
    const existingTranslations = await this.prisma.messageTranslatedAudio.findMany({
      where: { attachmentId: originalAttachmentId },
      select: { targetLanguage: true, translatedText: true, audioUrl: true, audioPath: true, durationMs: true, voiceCloned: true, voiceQuality: true }
    });

    const existingLanguages = new Set(existingTranslations.map(t => t.targetLanguage));

    // Filtrer les langues qui ne sont pas encore traduites
    const languagesToTranslate = options.targetLanguages.filter(lang => !existingLanguages.has(lang));

    const isForwarded = attachment.isForwarded || attachment.forwardedFromAttachmentId;

    console.log(`[AttachmentTranslateService] 🎤 Audio ${attachment.id}`);
    console.log(`   📦 Original attachment: ${originalAttachmentId}${isForwarded ? ' (forwarded)' : ''}`);
    console.log(`   👤 Original sender: ${originalSenderId || 'unknown'}`);
    console.log(`   🎙️ Voice profile: ${voiceUserId}${voiceProfile ? ' (loaded from DB)' : ' (will be created)'}`);
    console.log(`   ✅ Déjà traduit: [${Array.from(existingLanguages).join(', ')}]`);
    console.log(`   🔄 À traduire: [${languagesToTranslate.join(', ')}]`);

    // =========================================================================
    // 2. SI TOUTES LES LANGUES SONT DÉJÀ TRADUITES, RETOURNER LE CACHE
    // =========================================================================

    if (languagesToTranslate.length === 0) {
      console.log(`   ⚡ Cache HIT - Toutes les langues déjà traduites`);

      // Si c'est un transfert, copier les traductions de l'original vers le nouvel attachement
      if (isForwarded && attachment.id !== originalAttachmentId) {
        await this._copyTranslationsForForward(originalAttachmentId, attachment.id, attachment.message?.id);
      }

      // Construire la réponse à partir du cache
      const cachedResult: AudioTranslationResult = {
        translationId: `cached_${attachment.id}`,
        originalAudio: {
          transcription: '', // Sera rempli si on a la transcription
          language: options.sourceLanguage || 'auto',
          durationMs: attachment.duration || 0,
          confidence: 1.0
        },
        translations: existingTranslations
          .filter(t => options.targetLanguages.includes(t.targetLanguage))
          .map(t => ({
            targetLanguage: t.targetLanguage,
            translatedText: t.translatedText,
            audioUrl: t.audioUrl,
            durationMs: t.durationMs,
            voiceCloned: t.voiceCloned,
            voiceQuality: t.voiceQuality
          })),
        processingTimeMs: 0
      };

      return {
        success: true,
        data: {
          type: 'audio',
          attachmentId: attachment.id,
          result: cachedResult
        }
      };
    }

    // =========================================================================
    // 3. TRADUIRE LES LANGUES MANQUANTES
    // =========================================================================

    console.log(`   🚀 Envoi au Translator pour ${languagesToTranslate.length} langues`);

    // Read audio file
    const audioBuffer = await this.readAttachmentFile(attachment.filePath);
    const audioBase64 = audioBuffer.toString('base64');

    // Translate via AudioTranslateService (seulement les langues manquantes)
    // Transmettre le profil vocal de l'émetteur original pour le clonage vocal
    const result = options.async
      ? await this.audioTranslateService.translateAsync(userId, {
          audioBase64,
          targetLanguages: languagesToTranslate, // Seulement les nouvelles langues
          sourceLanguage: options.sourceLanguage,
          generateVoiceClone: options.generateVoiceClone,
          webhookUrl: options.webhookUrl,
          priority: options.priority,
          // Voice profile options (pour messages transférés - voix de l'émetteur original)
          originalSenderId: originalSenderId || undefined,
          existingVoiceProfile: voiceProfile || undefined,
          useOriginalVoice
        })
      : await this.audioTranslateService.translateSync(userId, {
          audioBase64,
          targetLanguages: languagesToTranslate, // Seulement les nouvelles langues
          sourceLanguage: options.sourceLanguage,
          generateVoiceClone: options.generateVoiceClone,
          // Voice profile options (pour messages transférés - voix de l'émetteur original)
          originalSenderId: originalSenderId || undefined,
          existingVoiceProfile: voiceProfile || undefined,
          useOriginalVoice
        });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode
      };
    }

    // =========================================================================
    // 4. MERGER LE CACHE + NOUVELLES TRADUCTIONS
    // =========================================================================

    // Si on a aussi des traductions en cache, les ajouter au résultat
    if (existingTranslations.length > 0 && result.data && 'translations' in result.data) {
      const fullResult = result.data as AudioTranslationResult;
      const cachedForRequest = existingTranslations
        .filter(t => options.targetLanguages.includes(t.targetLanguage))
        .map(t => ({
          targetLanguage: t.targetLanguage,
          translatedText: t.translatedText,
          audioUrl: t.audioUrl,
          durationMs: t.durationMs,
          voiceCloned: t.voiceCloned,
          voiceQuality: t.voiceQuality
        }));

      fullResult.translations = [...fullResult.translations, ...cachedForRequest];
    }

    return {
      success: true,
      data: {
        type: 'audio',
        attachmentId: attachment.id,
        result: result.data!
      }
    };
  }

  /**
   * Trouve l'attachement ORIGINAL et son ÉMETTEUR en traversant la chaîne de transferts.
   *
   * Exemple: Si A → B → C → D (D est transféré de C, qui est transféré de B, qui est transféré de A)
   * Cette méthode retourne { originalAttachmentId: A.id, originalSenderId: sender_of_A }
   *
   * @param attachmentId - ID de l'attachement courant
   * @returns { originalAttachmentId, originalSenderId }
   */
  private async _findOriginalAttachmentAndSender(attachmentId: string): Promise<{
    originalAttachmentId: string;
    originalSenderId: string | null;
  }> {
    const MAX_CHAIN_DEPTH = 10; // Protection contre les boucles infinies
    let currentId = attachmentId;
    let depth = 0;

    while (depth < MAX_CHAIN_DEPTH) {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: currentId },
        select: {
          forwardedFromAttachmentId: true,
          message: {
            select: { senderId: true }
          }
        }
      });

      // Si pas d'attachement ou pas de parent → on a trouvé l'original
      if (!attachment || !attachment.forwardedFromAttachmentId) {
        return {
          originalAttachmentId: currentId,
          originalSenderId: attachment?.message?.senderId || null
        };
      }

      // Remonter au parent
      currentId = attachment.forwardedFromAttachmentId;
      depth++;
    }

    console.warn(`[AttachmentTranslateService] ⚠️ Chaîne de transferts trop longue (>${MAX_CHAIN_DEPTH})`);

    // Récupérer le senderId du dernier attachement atteint
    const lastAttachment = await this.prisma.messageAttachment.findUnique({
      where: { id: currentId },
      select: { message: { select: { senderId: true } } }
    });

    return {
      originalAttachmentId: currentId,
      originalSenderId: lastAttachment?.message?.senderId || null
    };
  }

  /**
   * Récupère le profil vocal d'un utilisateur depuis MongoDB.
   * Ce profil sera envoyé à Translator pour éviter de le recréer.
   *
   * @param userId - ID de l'utilisateur
   * @returns Profil vocal ou null si inexistant
   */
  private async _getVoiceProfile(userId: string): Promise<{
    profileId: string;
    userId: string;
    embedding: string;
    qualityScore: number;
    fingerprint?: Record<string, any>;
    voiceCharacteristics?: Record<string, any>;
    version: number;
    audioCount: number;
    totalDurationMs: number;
  } | null> {
    try {
      const voiceModel = await this.prisma.userVoiceModel.findUnique({
        where: { userId },
        select: {
          profileId: true,
          embedding: true,
          qualityScore: true,
          fingerprint: true,
          voiceCharacteristics: true,
          version: true,
          audioCount: true,
          totalDurationMs: true
        }
      });

      if (!voiceModel || !voiceModel.embedding) {
        return null;
      }

      return {
        profileId: voiceModel.profileId || `vfp_${userId}`,
        userId,
        embedding: Buffer.from(voiceModel.embedding).toString('base64'), // Bytes → Base64
        qualityScore: voiceModel.qualityScore,
        fingerprint: voiceModel.fingerprint as Record<string, any> | undefined,
        voiceCharacteristics: voiceModel.voiceCharacteristics as Record<string, any> | undefined,
        version: voiceModel.version,
        audioCount: voiceModel.audioCount,
        totalDurationMs: voiceModel.totalDurationMs
      };
    } catch (error) {
      console.error(`[AttachmentTranslateService] Error fetching voice profile: ${error}`);
      return null;
    }
  }

  /**
   * Copie les traductions ET la transcription d'un attachement source vers un transféré.
   * Les fichiers audio ne sont PAS dupliqués - on référence les mêmes URLs.
   *
   * IMPORTANT: Ceci préserve les traductions existantes sans retraduire.
   * Pour les nouvelles langues demandées, elles seront traitées avec le profil vocal
   * du forwarder (userId actuel) et non de l'émetteur original.
   */
  private async _copyTranslationsForForward(
    originalAttachmentId: string,
    targetAttachmentId: string,
    targetMessageId?: string
  ): Promise<void> {
    try {
      // 1. Copier la transcription si elle existe
      const sourceTranscription = await this.prisma.messageAudioTranscription.findUnique({
        where: { attachmentId: originalAttachmentId }
      });

      if (sourceTranscription && targetMessageId) {
        await this.prisma.messageAudioTranscription.upsert({
          where: { attachmentId: targetAttachmentId },
          update: {}, // Pas de mise à jour si existe déjà
          create: {
            attachmentId: targetAttachmentId,
            messageId: targetMessageId,
            transcribedText: sourceTranscription.transcribedText,
            language: sourceTranscription.language,
            confidence: sourceTranscription.confidence,
            source: `forwarded:${sourceTranscription.source}`, // Marquer comme forwarded
            segments: sourceTranscription.segments,
            audioDurationMs: sourceTranscription.audioDurationMs,
            speakerCount: sourceTranscription.speakerCount,
            primarySpeakerId: sourceTranscription.primarySpeakerId,
            speakerAnalysis: sourceTranscription.speakerAnalysis
          }
        });
        console.log(`   📝 Transcription copiée depuis l'original`);
      }

      // 2. Copier les traductions audio
      const sourceTranslations = await this.prisma.messageTranslatedAudio.findMany({
        where: { attachmentId: originalAttachmentId }
      });

      for (const translation of sourceTranslations) {
        await this.prisma.messageTranslatedAudio.upsert({
          where: {
            attachmentId_targetLanguage: {
              attachmentId: targetAttachmentId,
              targetLanguage: translation.targetLanguage
            }
          },
          update: {}, // Pas de mise à jour si existe déjà
          create: {
            attachmentId: targetAttachmentId,
            messageId: targetMessageId || translation.messageId,
            targetLanguage: translation.targetLanguage,
            translatedText: translation.translatedText,
            audioPath: translation.audioPath, // Référence le même fichier
            audioUrl: translation.audioUrl,   // Référence la même URL
            durationMs: translation.durationMs,
            voiceCloned: translation.voiceCloned,
            voiceQuality: translation.voiceQuality,
            voiceModelId: translation.voiceModelId
          }
        });
      }

      console.log(`   📋 Copied ${sourceTranslations.length} audio translations for forwarded attachment`);
    } catch (error) {
      console.error(`[AttachmentTranslateService] Error copying translations: ${error}`);
    }
  }

  private async translateImage(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // STUB: Image translation not yet implemented
    return {
      success: false,
      error: 'Image translation not yet implemented',
      errorCode: 'NOT_IMPLEMENTED'
    };
  }

  private async translateVideo(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // STUB: Video translation not yet implemented
    return {
      success: false,
      error: 'Video translation not yet implemented',
      errorCode: 'NOT_IMPLEMENTED'
    };
  }

  private async translateDocument(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // STUB: Document translation not yet implemented
    return {
      success: false,
      error: 'Document translation not yet implemented',
      errorCode: 'NOT_IMPLEMENTED'
    };
  }
}
