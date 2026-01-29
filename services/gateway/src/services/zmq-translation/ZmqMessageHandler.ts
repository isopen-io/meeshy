/**
 * ZMQ Message Handler
 * Traite les messages reçus du service Translator (simple JSON et multipart)
 *
 * Responsabilités:
 * - Parse les messages JSON
 * - Gère les messages multipart avec binaires
 * - Route les événements selon leur type
 * - Extrait les données binaires (audio, embeddings)
 */

import { EventEmitter } from 'events';
import type {
  ZMQEvent,
  TranslationCompletedEvent,
  TranslationErrorEvent,
  AudioProcessCompletedEvent,
  AudioProcessErrorEvent,
  VoiceAPISuccessEvent,
  VoiceAPIErrorEvent,
  VoiceJobProgressEvent,
  VoiceProfileAnalyzeResult,
  VoiceProfileVerifyResult,
  VoiceProfileCompareResult,
  VoiceProfileErrorEvent,
  TranscriptionCompletedEvent,
  TranscriptionReadyEvent,
  TranslationReadyEvent,
  AudioTranslationReadyEvent,
  AudioTranslationsProgressiveEvent,
  AudioTranslationsCompletedEvent,
  TranscriptionErrorEvent,
  VoiceTranslationCompletedEvent,
  VoiceTranslationFailedEvent
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
// Logger dédié pour ZmqMessageHandler
const logger = enhancedLogger.child({ module: 'ZmqMessageHandler' });


export interface MessageHandlerStats {
  messagesProcessed: number;
  translationCompleted: number;
  translationErrors: number;
  audioCompleted: number;
  audioErrors: number;
  voiceEvents: number;
  transcriptionCompleted: number;
  transcriptionErrors: number;
  multipartMessages: number;
  voiceTranslationCompleted: number;
  voiceTranslationFailed: number;
}

export class ZmqMessageHandler extends EventEmitter {
  private processedResults = new Set<string>();

  private stats: MessageHandlerStats = {
    messagesProcessed: 0,
    translationCompleted: 0,
    translationErrors: 0,
    audioCompleted: 0,
    audioErrors: 0,
    voiceEvents: 0,
    transcriptionCompleted: 0,
    transcriptionErrors: 0,
    multipartMessages: 0,
    voiceTranslationCompleted: 0,
    voiceTranslationFailed: 0
  };

  /**
   * Gère un message ZMQ (simple JSON ou multipart)
   *
   * Pour les messages multipart (audio_process_completed):
   * - Frame 0: JSON metadata avec binaryFrames
   * - Frame 1+: Données binaires (audios, embeddings)
   */
  async handleMessage(message: Buffer | Buffer[]): Promise<void> {
    try {
      // Déterminer si c'est multipart
      let firstFrame: Buffer;
      let binaryFrames: Buffer[] = [];

      if (Array.isArray(message)) {
        // Multipart: premier frame = JSON, reste = binaires
        [firstFrame, ...binaryFrames] = message;
        this.stats.multipartMessages++;
      } else {
        // Simple: un seul frame JSON
        firstFrame = message;
      }

      const messageStr = firstFrame.toString('utf-8');
      const event: ZMQEvent = JSON.parse(messageStr);

      // Log multipart
      if (binaryFrames.length > 0) {
        const totalSize = binaryFrames.reduce((sum, f) => sum + f.length, 0);
        logger.info(`📦 Multipart reçu: ${binaryFrames.length} frames binaires, ${totalSize} bytes`);
      }

      this.stats.messagesProcessed++;

      // Router l'événement selon son type
      await this.routeEvent(event, binaryFrames);

    } catch (error) {
      logger.error(`❌ Erreur traitement message ZMQ: ${error}`);
    }
  }

  /**
   * Route l'événement vers le handler approprié
   */
  private async routeEvent(event: ZMQEvent, binaryFrames: Buffer[]): Promise<void> {
    switch (event.type) {
      case 'translation_completed':
        this.handleTranslationCompleted(event as TranslationCompletedEvent);
        break;

      case 'translation_error':
        this.handleTranslationError(event as TranslationErrorEvent);
        break;

      case 'audio_process_completed':
        this.handleAudioProcessCompleted(event as unknown as AudioProcessCompletedEvent, binaryFrames);
        break;

      case 'audio_process_error':
        this.handleAudioProcessError(event as unknown as AudioProcessErrorEvent);
        break;

      case 'voice_api_success':
        this.handleVoiceAPISuccess(event as unknown as VoiceAPISuccessEvent);
        break;

      case 'voice_api_error':
        this.handleVoiceAPIError(event as unknown as VoiceAPIErrorEvent);
        break;

      case 'voice_job_progress':
        this.handleVoiceJobProgress(event as unknown as VoiceJobProgressEvent);
        break;

      case 'voice_profile_analyze_result':
        this.handleVoiceProfileAnalyze(event as unknown as VoiceProfileAnalyzeResult);
        break;

      case 'voice_profile_verify_result':
        this.handleVoiceProfileVerify(event as unknown as VoiceProfileVerifyResult);
        break;

      case 'voice_profile_compare_result':
        this.handleVoiceProfileCompare(event as unknown as VoiceProfileCompareResult);
        break;

      case 'voice_profile_error':
        this.handleVoiceProfileError(event as unknown as VoiceProfileErrorEvent);
        break;

      case 'transcription_completed':
        this.handleTranscriptionCompleted(event as unknown as TranscriptionCompletedEvent);
        break;

      case 'transcription_ready':
        // Transcription prête (avant traduction) - envoi progressif
        this.handleTranscriptionReady(event as unknown as TranscriptionReadyEvent);
        break;

      case 'audio_translation_ready':
        // Traduction unique (1 seule langue demandée)
        // Attacher les frames binaires à l'événement pour extraction
        (event as any).__binaryFrames = binaryFrames;
        this.handleAudioTranslationReady(event as unknown as AudioTranslationReadyEvent);
        break;

      case 'audio_translations_progressive':
        // Traduction progressive (multi-langues, pas la dernière)
        // Attacher les frames binaires à l'événement pour extraction
        (event as any).__binaryFrames = binaryFrames;
        this.handleAudioTranslationsProgressive(event as unknown as AudioTranslationsProgressiveEvent);
        break;

      case 'audio_translations_completed':
        // Dernière traduction terminée (multi-langues)
        // Attacher les frames binaires à l'événement pour extraction
        (event as any).__binaryFrames = binaryFrames;
        this.handleAudioTranslationsCompleted(event as unknown as AudioTranslationsCompletedEvent);
        break;

      case 'translation_ready':
        // DEPRECATED: Ancien événement conservé pour rétrocompatibilité
        this.handleTranslationReady(event as unknown as TranslationReadyEvent);
        break;

      case 'transcription_error':
        this.handleTranscriptionError(event as unknown as TranscriptionErrorEvent);
        break;

      case 'voice_translation_completed':
        this.handleVoiceTranslationCompleted(event as unknown as VoiceTranslationCompletedEvent);
        break;

      case 'voice_translation_failed':
        this.handleVoiceTranslationFailed(event as unknown as VoiceTranslationFailedEvent);
        break;

      case 'pong':
        // Gestion des réponses ping/pong (silencieux en production)
        break;

      default:
        logger.warn(`⚠️ Type d'événement inconnu: ${(event as any).type}`);
    }
  }

  /**
   * Gère un événement de traduction terminée
   */
  private handleTranslationCompleted(event: TranslationCompletedEvent): void {
    // Utiliser taskId pour la déduplication (permet la retraduction avec un nouveau taskId)
    const resultKey = `${event.taskId}_${event.targetLanguage}`;

    // Vérifier si ce taskId a déjà été traité (évite les doublons accidentels)
    if (this.processedResults.has(resultKey)) {
      return;
    }

    // Marquer ce task comme traité
    this.processedResults.add(resultKey);

    // Nettoyer les anciens résultats (garder seulement les 1000 derniers)
    if (this.processedResults.size > 1000) {
      const firstKey = this.processedResults.values().next().value;
      this.processedResults.delete(firstKey);
    }

    // VALIDATION COMPLÈTE
    if (!event.result) {
      logger.error(`❌ Message sans résultat`);
      return;
    }

    if (!event.result.messageId) {
      logger.error(`❌ Message sans messageId`);
      return;
    }

    this.stats.translationCompleted++;

    // Émettre l'événement avec toutes les informations
    this.emit('translationCompleted', {
      taskId: event.taskId,
      result: event.result,
      targetLanguage: event.targetLanguage,
      metadata: event.metadata || {}
    });
  }

  /**
   * Gère un événement d'erreur de traduction
   */
  private handleTranslationError(event: TranslationErrorEvent): void {
    this.stats.translationErrors++;

    logger.error(`❌ Erreur traduction: ${event.error} pour ${event.messageId}`);

    // Émettre l'événement d'erreur avec métadonnées
    this.emit('translationError', {
      taskId: event.taskId,
      messageId: event.messageId,
      error: event.error,
      conversationId: event.conversationId,
      metadata: event.metadata || {}
    });
  }

  /**
   * Gère un événement de processing audio terminé (MULTIPART)
   */
  private handleAudioProcessCompleted(event: AudioProcessCompletedEvent, binaryFrames: Buffer[]): void {
    logger.info(`🎤 Audio process terminé: ${event.messageId}`);
    if (event.transcription?.text) {
      logger.info(`   📝 Transcription: ${event.transcription.text.substring(0, 50)}...`);
    }
    logger.info(`   🌍 Traductions audio: ${event.translatedAudios?.length || 0} versions`);

    // ═══════════════════════════════════════════════════════════════
    // EXTRACTION DES BINAIRES DEPUIS FRAMES MULTIPART
    // ═══════════════════════════════════════════════════════════════
    const binaryFramesInfo = (event as any).binaryFrames || {};
    const audioBinaries: Map<string, Buffer> = new Map();
    let embeddingBinary: Buffer | null = null;

    // Extraire les audios traduits des frames binaires
    for (const [key, info] of Object.entries(binaryFramesInfo)) {
      const frameInfo = info as { index: number; size: number; mimeType?: string };
      const frameIndex = frameInfo.index - 1; // Les indices dans metadata commencent à 1, array à 0

      if (frameIndex >= 0 && frameIndex < binaryFrames.length) {
        if (key.startsWith('audio_')) {
          const language = key.replace('audio_', '');
          audioBinaries.set(language, binaryFrames[frameIndex]);
        } else if (key === 'embedding') {
          embeddingBinary = binaryFrames[frameIndex];
        }
      } else {
        logger.warn(`   ⚠️ Frame index invalide pour ${key}: ${frameIndex}`);
      }
    }

    // Enrichir translatedAudios avec les données binaires
    const enrichedTranslatedAudios = event.translatedAudios.map(audio => {
      const audioBinary = audioBinaries.get(audio.targetLanguage);
      return {
        ...audio,
        // Ajouter le Buffer binaire pour sauvegarde directe
        _audioBinary: audioBinary || null
      };
    });

    // Enrichir newVoiceProfile avec l'embedding binaire
    let enrichedVoiceProfile = (event as any).newVoiceProfile || null;
    if (enrichedVoiceProfile && embeddingBinary) {
      enrichedVoiceProfile = {
        ...enrichedVoiceProfile,
        _embeddingBinary: embeddingBinary
      };
    }

    logger.info(`   ✅ Multipart décodé: ${audioBinaries.size} audios, embedding=${!!embeddingBinary}`);

    this.stats.audioCompleted++;

    // Émettre l'événement de succès audio avec binaires
    this.emit('audioProcessCompleted', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      transcription: event.transcription,
      translatedAudios: enrichedTranslatedAudios, // Avec _audioBinary
      voiceModelUserId: event.voiceModelUserId,
      voiceModelQuality: event.voiceModelQuality,
      processingTimeMs: event.processingTimeMs,
      newVoiceProfile: enrichedVoiceProfile // Avec _embeddingBinary
    });
  }

  /**
   * Gère un événement d'erreur de processing audio
   */
  private handleAudioProcessError(event: AudioProcessErrorEvent): void {
    logger.error(`❌ Audio process erreur: ${event.messageId} - ${event.error}`);

    this.stats.audioErrors++;

    // Émettre l'événement d'erreur audio
    this.emit('audioProcessError', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      error: event.error,
      errorCode: event.errorCode
    });
  }

  /**
   * Gère un événement de succès Voice API
   */
  private handleVoiceAPISuccess(event: VoiceAPISuccessEvent): void {
    logger.info(`🎤 Voice API success: ${event.taskId} (${event.processingTimeMs}ms)`);

    this.stats.voiceEvents++;

    // Émettre l'événement de succès Voice API
    this.emit('voiceAPISuccess', {
      taskId: event.taskId,
      requestType: event.requestType,
      result: event.result,
      processingTimeMs: event.processingTimeMs,
      timestamp: event.timestamp
    });
  }

  /**
   * Gère un événement d'erreur Voice API
   */
  private handleVoiceAPIError(event: VoiceAPIErrorEvent): void {
    logger.error(`❌ Voice API error: ${event.taskId} - ${event.errorCode}: ${event.error}`);

    this.stats.voiceEvents++;

    // Émettre l'événement d'erreur Voice API
    this.emit('voiceAPIError', {
      taskId: event.taskId,
      requestType: event.requestType,
      error: event.error,
      errorCode: event.errorCode,
      timestamp: event.timestamp
    });
  }

  /**
   * Gère un événement de progression Voice Job
   */
  private handleVoiceJobProgress(event: VoiceJobProgressEvent): void {
    logger.info(`📊 Voice job progress: ${event.jobId} - ${event.progress}% (${event.currentStep})`);

    this.stats.voiceEvents++;

    // Émettre l'événement de progression
    this.emit('voiceJobProgress', {
      taskId: event.taskId,
      jobId: event.jobId,
      progress: event.progress,
      currentStep: event.currentStep,
      timestamp: event.timestamp
    });
  }

  /**
   * Gère un événement d'analyse de profil vocal
   */
  private handleVoiceProfileAnalyze(event: VoiceProfileAnalyzeResult): void {
    if (event.success) {
      logger.info(`🎤 Voice profile analyzed: ${event.request_id} - quality: ${event.quality_score}`);
    } else {
      logger.error(`❌ Voice profile analyze failed: ${event.request_id} - ${event.error}`);
    }

    this.stats.voiceEvents++;

    this.emit('voiceProfileAnalyzeResult', event);
  }

  /**
   * Gère un événement de vérification de profil vocal
   */
  private handleVoiceProfileVerify(event: VoiceProfileVerifyResult): void {
    if (event.success) {
      logger.info(`🎤 Voice profile verified: ${event.request_id} - match: ${event.is_match}, score: ${event.similarity_score}`);
    } else {
      logger.error(`❌ Voice profile verify failed: ${event.request_id} - ${event.error}`);
    }

    this.stats.voiceEvents++;

    this.emit('voiceProfileVerifyResult', event);
  }

  /**
   * Gère un événement de comparaison de profils vocaux
   */
  private handleVoiceProfileCompare(event: VoiceProfileCompareResult): void {
    if (event.success) {
      logger.info(`🎤 Voice profiles compared: ${event.request_id} - match: ${event.is_match}, score: ${event.similarity_score}`);
    } else {
      logger.error(`❌ Voice profile compare failed: ${event.request_id} - ${event.error}`);
    }

    this.stats.voiceEvents++;

    this.emit('voiceProfileCompareResult', event);
  }

  /**
   * Gère un événement d'erreur de profil vocal
   */
  private handleVoiceProfileError(event: VoiceProfileErrorEvent): void {
    logger.error(`❌ Voice profile error: ${event.request_id} - ${event.error}`);

    this.stats.voiceEvents++;

    this.emit('voiceProfileError', event);
  }

  /**
   * Gère un événement de transcription terminée
   */
  private handleTranscriptionCompleted(event: TranscriptionCompletedEvent): void {
    logger.info(`📝 Transcription terminée: ${event.messageId}`);
    if (event.transcription?.text) {
      logger.info(`   📝 Texte: ${event.transcription.text.substring(0, 50)}...`);
    }
    if (event.transcription?.language) {
      logger.info(`   🌍 Langue: ${event.transcription.language}`);
    }

    this.stats.transcriptionCompleted++;

    // Émettre l'événement de succès transcription
    this.emit('transcriptionCompleted', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      transcription: event.transcription,
      processingTimeMs: event.processingTimeMs
    });
  }

  /**
   * Gère un événement de transcription prête (AVANT traduction).
   * Permet d'envoyer la transcription au client immédiatement,
   * sans attendre que la traduction soit terminée.
   */
  private handleTranscriptionReady(event: TranscriptionReadyEvent): void {
    logger.info(`📤 Transcription READY (avant traduction): ${event.messageId}`);
    if (event.transcription?.text) {
      logger.info(`   📝 Texte: ${event.transcription.text.substring(0, 50)}...`);
    }
    if (event.transcription?.language) {
      logger.info(`   🌍 Langue: ${event.transcription.language}`);
    }
    if (event.transcription?.speakerCount) {
      logger.info(`   🎤 Speakers: ${event.transcription.speakerCount}`);
    }

    // Émettre l'événement de transcription prête (avant traduction)
    this.emit('transcriptionReady', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      transcription: event.transcription,
      processingTimeMs: event.processingTimeMs
    });
  }

  /**
   * Gère un événement de traduction individuelle prête.
   * Permet d'envoyer chaque traduction dès qu'elle est prête,
   * sans attendre que toutes les traductions soient terminées.
   * @deprecated Utilisez handleAudioTranslationReady, handleAudioTranslationsProgressive ou handleAudioTranslationsCompleted
   */
  private handleTranslationReady(event: TranslationReadyEvent): void {
    logger.info(`🌍 Translation READY (progressive - DEPRECATED): ${event.messageId}`);
    logger.info(`   🔊 Langue: ${event.language}`);
    logger.info(`   📝 Segments: ${event.translatedAudio.segments?.length || 0}`);

    // Émettre l'événement de traduction prête (progressive)
    this.emit('translationReady', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      language: event.language,
      translatedAudio: event.translatedAudio
    });
  }

  /**
   * Gère un événement de traduction audio unique (1 seule langue demandée).
   * Événement final pour les traductions mono-langue.
   */
  private handleAudioTranslationReady(event: AudioTranslationReadyEvent & { binaryFrames?: any }): void {
    logger.info(`🎯 AUDIO_TRANSLATION_READY (langue unique): ${event.messageId}`);
    logger.info(`   🔊 Langue: ${event.language}`);
    logger.info(`   📝 Segments: ${event.translatedAudio.segments?.length || 0}`);

    // Extraire le binaire audio depuis les frames multipart
    let audioBinary: Buffer | null = null;
    const binaryFrames = (event as any).__binaryFrames;

    if (binaryFrames && binaryFrames.length > 0) {
      // Frame 0 = JSON metadata, Frame 1+ = binaires
      // Pour les événements single, il n'y a qu'un seul audio (frame 1)
      if (binaryFrames.length >= 2) {
        audioBinary = binaryFrames[1];
        logger.info(`   📦 Audio binaire extrait: ${audioBinary.length} bytes`);
      }
    }

    // Enrichir l'audio traduit avec le binaire
    const enrichedTranslatedAudio = {
      ...event.translatedAudio,
      _audioBinary: audioBinary
    };

    // Émettre l'événement de traduction unique prête
    this.emit('audioTranslationReady', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      language: event.language,
      translatedAudio: enrichedTranslatedAudio
    });
  }

  /**
   * Gère un événement de traduction progressive (multi-langues, pas la dernière).
   * Permet d'envoyer chaque traduction au fur et à mesure.
   */
  private handleAudioTranslationsProgressive(event: AudioTranslationsProgressiveEvent & { binaryFrames?: any }): void {
    logger.info(`🔄 AUDIO_TRANSLATIONS_PROGRESSIVE: ${event.messageId}`);
    logger.info(`   🔊 Langue: ${event.language}`);
    logger.info(`   📝 Segments: ${event.translatedAudio.segments?.length || 0}`);

    // Extraire le binaire audio depuis les frames multipart
    let audioBinary: Buffer | null = null;
    const binaryFrames = (event as any).__binaryFrames;

    if (binaryFrames && binaryFrames.length > 0) {
      // Frame 0 = JSON metadata, Frame 1+ = binaires
      // Pour les événements progressifs, il n'y a qu'un seul audio (frame 1)
      if (binaryFrames.length >= 2) {
        audioBinary = binaryFrames[1];
        logger.info(`   📦 Audio binaire extrait: ${audioBinary.length} bytes`);
      }
    }

    // Enrichir l'audio traduit avec le binaire
    const enrichedTranslatedAudio = {
      ...event.translatedAudio,
      _audioBinary: audioBinary
    };

    // Émettre l'événement de traduction progressive
    this.emit('audioTranslationsProgressive', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      language: event.language,
      translatedAudio: enrichedTranslatedAudio
    });
  }

  /**
   * Gère un événement de dernière traduction terminée (multi-langues).
   * Signale que toutes les traductions sont complètes.
   */
  private handleAudioTranslationsCompleted(event: AudioTranslationsCompletedEvent & { binaryFrames?: any }): void {
    logger.info(`✅ AUDIO_TRANSLATIONS_COMPLETED (dernière): ${event.messageId}`);
    logger.info(`   🔊 Langue: ${event.language}`);
    logger.info(`   📝 Segments: ${event.translatedAudio.segments?.length || 0}`);

    // Extraire le binaire audio depuis les frames multipart
    let audioBinary: Buffer | null = null;
    const binaryFrames = (event as any).__binaryFrames;

    if (binaryFrames && binaryFrames.length > 0) {
      // Frame 0 = JSON metadata, Frame 1+ = binaires
      // Pour les événements complétés, il n'y a qu'un seul audio (frame 1)
      if (binaryFrames.length >= 2) {
        audioBinary = binaryFrames[1];
        logger.info(`   📦 Audio binaire extrait: ${audioBinary.length} bytes`);
      }
    }

    // Enrichir l'audio traduit avec le binaire
    const enrichedTranslatedAudio = {
      ...event.translatedAudio,
      _audioBinary: audioBinary
    };

    // Émettre l'événement de traductions complétées
    this.emit('audioTranslationsCompleted', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      language: event.language,
      translatedAudio: enrichedTranslatedAudio
    });
  }

  /**
   * Gère un événement d'erreur de transcription
   */
  private handleTranscriptionError(event: TranscriptionErrorEvent): void {
    logger.error(`❌ Transcription error: ${event.messageId} - ${event.error}`);

    this.stats.transcriptionErrors++;

    // Émettre l'événement d'erreur transcription
    this.emit('transcriptionError', {
      taskId: event.taskId,
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      error: event.error,
      errorCode: event.errorCode
    });
  }

  /**
   * Gère un événement de job de traduction audio terminé
   */
  private handleVoiceTranslationCompleted(event: VoiceTranslationCompletedEvent): void {
    logger.info(`🎤 Voice translation job completed: ${event.jobId}`);
    if (event.result) {
      const transcription = event.result.originalAudio?.transcription;
      if (transcription) {
        logger.info(`   📝 Original: ${transcription.substring(0, 50)}...`);
        logger.info(`   🌍 Langue: ${event.result.originalAudio.language}`);
      }
      if (event.result.translations?.length) {
        const langs = event.result.translations.map(t => t.targetLanguage).join(', ');
        logger.info(`   🌍 Traductions: ${event.result.translations.length} versions (${langs})`);
      }
    }

    this.stats.voiceTranslationCompleted++;

    // Émettre l'événement de job terminé
    this.emit('voiceTranslationCompleted', {
      jobId: event.jobId,
      status: event.status,
      userId: event.userId,
      timestamp: event.timestamp,
      result: event.result
    });
  }

  /**
   * Gère un événement de job de traduction audio échoué
   */
  private handleVoiceTranslationFailed(event: VoiceTranslationFailedEvent): void {
    logger.error(`❌ Voice translation job failed: ${event.jobId} - ${event.error}`);

    this.stats.voiceTranslationFailed++;

    // Émettre l'événement de job échoué
    this.emit('voiceTranslationFailed', {
      jobId: event.jobId,
      status: event.status,
      userId: event.userId,
      timestamp: event.timestamp,
      error: event.error,
      errorCode: event.errorCode
    });
  }

  /**
   * Récupère les statistiques du handler
   */
  getStats(): MessageHandlerStats {
    return { ...this.stats };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats(): void {
    this.stats = {
      messagesProcessed: 0,
      translationCompleted: 0,
      translationErrors: 0,
      audioCompleted: 0,
      audioErrors: 0,
      voiceEvents: 0,
      transcriptionCompleted: 0,
      transcriptionErrors: 0,
      multipartMessages: 0,
      voiceTranslationCompleted: 0,
      voiceTranslationFailed: 0
    };
  }

  /**
   * Nettoie les ressources
   */
  clear(): void {
    this.processedResults.clear();
    this.resetStats();
  }
}
