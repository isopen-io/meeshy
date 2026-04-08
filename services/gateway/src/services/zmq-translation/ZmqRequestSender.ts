/**
 * ZMQ Request Sender
 * Gère l'envoi de toutes les requêtes vers le service Translator
 *
 * Responsabilités:
 * - Envoi de requêtes de traduction
 * - Envoi de requêtes de processing audio (avec multipart)
 * - Envoi de requêtes de transcription seule
 * - Envoi de requêtes Voice API
 * - Envoi de requêtes Voice Profile
 * - Gestion du tracking des requêtes en cours
 */

import { randomUUID } from 'crypto';
import type { ZmqConnectionManager } from './ZmqConnectionManager';
import { loadAudioAsBinary, audioFormatToMimeType } from './utils/zmq-helpers';
import type {
  TranslationRequest,
  AudioProcessRequest,
  TranscriptionOnlyRequest,
  VoiceAPIRequest,
  VoiceProfileRequest,
  BinaryFrameInfo
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
// Logger dédié pour ZmqRequestSender
const logger = enhancedLogger.child({ module: 'ZmqRequestSender' });


export interface RequestSenderStats {
  translationRequests: number;
  audioProcessRequests: number;
  transcriptionRequests: number;
  voiceAPIRequests: number;
  voiceProfileRequests: number;
}

export class ZmqRequestSender {
  private connectionManager: ZmqConnectionManager;

  // Cache des requêtes en cours (pour traçabilité + timeout)
  private pendingRequests: Map<string, {
    request: any;
    timestamp: number;
    timeoutId?: NodeJS.Timeout;
    onTimeout?: () => void;
  }> = new Map();

  private stats: RequestSenderStats = {
    translationRequests: 0,
    audioProcessRequests: 0,
    transcriptionRequests: 0,
    voiceAPIRequests: 0,
    voiceProfileRequests: 0
  };

  constructor(connectionManager: ZmqConnectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Envoie une requête de traduction
   */
  async sendTranslationRequest(request: TranslationRequest, existingTaskId?: string): Promise<string> {
    const taskId = existingTaskId ?? randomUUID();

    // Préparer le message de commande
    const requestMessage = {
      type: 'translation',  // Type explicite pour routage
      taskId: taskId,
      messageId: request.messageId,
      text: request.text,
      sourceLanguage: request.sourceLanguage,
      targetLanguages: request.targetLanguages,
      conversationId: request.conversationId,
      modelType: request.modelType || 'basic',
      timestamp: Date.now()
    };

    logger.info('🔍 PRÉPARATION ENVOI PUSH:');
    logger.info(`   📋 taskId: ${taskId}`);
    logger.info(`   📋 messageId: ${request.messageId}`);
    logger.info(`   📋 text: "${request.text}"`);
    logger.info(`   📋 sourceLanguage: ${request.sourceLanguage}`);
    logger.info(`   📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
    logger.info(`   📋 conversationId: ${request.conversationId}`);
    logger.info(`   🎨 modelType: ${requestMessage.modelType}`);
    logger.info(`   📋 message size: ${JSON.stringify(requestMessage).length} chars`);

    // Envoyer la commande via PUSH (garantit distribution équitable)
    await this.connectionManager.send(requestMessage);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.translationRequests++;

    logger.info(`📤 [ZMQ-Client] Commande PUSH envoyée: taskId=${taskId}, conversationId=${request.conversationId}, langues=${request.targetLanguages.length}, message=${JSON.stringify(requestMessage)}`);

    return taskId;
  }

  /**
   * Envoie une requête de processing audio au service translator.
   * Le translator va:
   * 1. Transcrire l'audio (ou utiliser la transcription mobile)
   * 2. Traduire vers les langues cibles
   * 3. Cloner la voix de l'émetteur
   * 4. Générer des versions audio traduites
   */
  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>, existingTaskId?: string): Promise<string> {
    // Valider qu'on a une source audio
    if (!request.audioPath) {
      throw new Error('audioPath must be provided');
    }

    const taskId = existingTaskId ?? randomUUID();

    // Charger l'audio en binaire (OBLIGATOIRE - pas de fallback URL)
    const audioData = await loadAudioAsBinary(request.audioPath);
    if (!audioData) {
      throw new Error(`Impossible de charger le fichier audio: ${request.audioPath}`);
    }

    // Préparer les frames binaires
    const binaryFrames: Buffer[] = [audioData.buffer];
    const binaryFrameInfo: BinaryFrameInfo = {
      audio: 1,  // L'audio est dans le frame 1 (0-indexed après le JSON)
      audioMimeType: audioData.mimeType,
      audioSize: audioData.size
    };

    // Extraire et transmettre le voice profile en frame binaire séparé (si disponible)
    let voiceProfileMetadata: any = undefined;
    if (request.existingVoiceProfile && request.existingVoiceProfile.embedding) {
      try {
        // Décoder l'embedding base64 en Buffer binaire
        const embeddingBuffer = Buffer.from(request.existingVoiceProfile.embedding, 'base64');

        // Ajouter le frame binaire du profil vocal (Frame 2)
        binaryFrames.push(embeddingBuffer);
        binaryFrameInfo.voiceProfile = 2;  // Le profil vocal est dans le frame 2
        binaryFrameInfo.voiceProfileSize = embeddingBuffer.length;

        // Créer les métadonnées du profil SANS l'embedding (qui est dans le frame binaire)
        voiceProfileMetadata = {
          profileId: request.existingVoiceProfile.profileId,
          userId: request.existingVoiceProfile.userId,
          qualityScore: request.existingVoiceProfile.qualityScore,
          // L'embedding est transmis en frame binaire, pas dans le JSON
        };

        logger.info(`   🎙️ Voice profile transmis en multipart: frame 2 (${embeddingBuffer.length} bytes)`);
      } catch (error) {
        logger.error('⚠️ Erreur décodage voice profile, ignoré', error);
      }
    }

    // Préparer le message de commande audio (SANS chemin ni URL!)
    const requestMessage: AudioProcessRequest = {
      type: 'audio_process',
      messageId: request.messageId,
      attachmentId: request.attachmentId,
      conversationId: request.conversationId,
      senderId: request.senderId,
      // Pas de audioPath, audioUrl, audioBase64 - uniquement binaryFrames
      audioUrl: '',  // Champ requis par interface mais non utilisé
      audioMimeType: audioData.mimeType,
      binaryFrames: binaryFrameInfo,
      audioDurationMs: request.audioDurationMs,
      mobileTranscription: request.mobileTranscription,
      targetLanguages: request.targetLanguages,
      userLanguage: request.userLanguage,  // Langue de l'utilisateur pour la transcription
      generateVoiceClone: request.generateVoiceClone,
      modelType: request.modelType,
      // Champs voice profile (métadonnées seulement, embedding dans frame binaire)
      originalSenderId: request.originalSenderId,
      existingVoiceProfile: voiceProfileMetadata,  // Métadonnées uniquement (sans embedding)
      useOriginalVoice: request.useOriginalVoice,
      voiceCloneParams: request.voiceCloneParams,
      // Champs post audio (présents uniquement pour les requêtes post media)
      postId: request.postId,
      postMediaId: request.postMediaId,
    };

    const transferMode = `multipart binaire (${(audioData.size / 1024).toFixed(1)}KB, ${audioData.mimeType})`;

    logger.info('🎤 ENVOI AUDIO PROCESS:');
    logger.info(`   📋 taskId: ${taskId}`);
    logger.info(`   📋 messageId: ${request.messageId}`);
    logger.info(`   📋 attachmentId: ${request.attachmentId}`);
    logger.info(`   📋 senderId: ${request.senderId}`);
    logger.info(`   📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
    logger.info(`   📋 audioDurationMs: ${request.audioDurationMs}`);
    logger.info(`   📋 mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);
    logger.info(`   📋 transferMode: ${transferMode}`);

    // Envoyer via PUSH en multipart (TOUJOURS)
    await this.connectionManager.sendMultipart(requestMessage, binaryFrames);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: requestMessage,
      timestamp: Date.now()
    });

    this.stats.audioProcessRequests++;

    logger.info(`📤 [ZMQ-Client] Audio process PUSH envoyée: taskId=${taskId}, messageId=${request.messageId}`);

    return taskId;
  }

  /**
   * Envoie une requête de transcription seule au service translator.
   * Retourne uniquement la transcription sans traduction ni TTS.
   *
   * Envoie les données audio en multipart binaire via ZMQ.
   * Supporte deux modes:
   * - Mode fichier: audioPath fourni → charge le fichier
   * - Mode base64: audioData fourni → décode en Buffer
   */
  async sendTranscriptionOnlyRequest(
    request: Omit<TranscriptionOnlyRequest, 'type' | 'taskId'>,
    existingTaskId?: string
  ): Promise<string> {
    logger.info(`🔍 [ZMQ-TRACE] ======== DÉBUT ENVOI TRANSCRIPTION ========`);
    logger.info(`🔍 [ZMQ-TRACE] Request params:`);
    logger.info(`   - messageId: ${request.messageId}`);
    logger.info(`   - attachmentId: ${request.attachmentId}`);
    logger.info(`   - audioPath: ${request.audioPath || 'N/A'}`);
    logger.info(`   - audioData (base64): ${request.audioData ? `${request.audioData.substring(0, 50)}...` : 'N/A'}`);
    logger.info(`   - audioFormat: ${request.audioFormat || 'N/A'}`);
    logger.info(`   - mobileTranscription: ${request.mobileTranscription ? 'OUI' : 'NON'}`);

    // Valider qu'on a une source audio (fichier OU base64)
    if (!request.audioPath && !request.audioData) {
      logger.error(`🔍 [ZMQ-TRACE] ❌ Aucune source audio fournie`);
      throw new Error('Either audioPath or audioData (base64) must be provided');
    }

    const taskId = existingTaskId ?? randomUUID();
    logger.info(`🔍 [ZMQ-TRACE] Task ID généré: ${taskId}`);

    let audioBuffer: Buffer;
    let mimeType: string;
    let audioSize: number;

    if (request.audioPath) {
      logger.info(`🔍 [ZMQ-TRACE] Mode FICHIER: chargement depuis ${request.audioPath}...`);
      // Mode fichier: charger depuis le disque
      const audioData = await loadAudioAsBinary(request.audioPath);
      if (!audioData) {
        logger.error(`🔍 [ZMQ-TRACE] ❌ Impossible de charger le fichier`);
        throw new Error(`Impossible de charger le fichier audio: ${request.audioPath}`);
      }
      audioBuffer = audioData.buffer;
      mimeType = audioData.mimeType;
      audioSize = audioData.size;
      logger.info(`🔍 [ZMQ-TRACE] ✅ Fichier chargé: ${(audioSize / 1024).toFixed(2)} KB`);
    } else {
      logger.info(`🔍 [ZMQ-TRACE] Mode BASE64: décodage...`);
      // Mode base64: décoder en Buffer (pas de fichier temporaire)
      audioBuffer = Buffer.from(request.audioData!, 'base64');
      audioSize = audioBuffer.length;

      // Déterminer le mime type depuis audioFormat
      mimeType = audioFormatToMimeType(request.audioFormat || 'wav');
      logger.info(`🔍 [ZMQ-TRACE] ✅ Audio décodé: ${(audioSize / 1024).toFixed(2)} KB, MIME: ${mimeType}`);
    }

    logger.info(`🔍 [ZMQ-TRACE] Préparation frames multipart...`);

    // Préparer les frames binaires
    const binaryFrames: Buffer[] = [audioBuffer];
    const binaryFrameInfo: BinaryFrameInfo = {
      audio: 1,
      audioMimeType: mimeType,
      audioSize: audioSize
    };

    // Préparer le message de commande transcription (sans chemin ni URL)
    const requestMessage: TranscriptionOnlyRequest = {
      type: 'transcription_only',
      taskId,
      messageId: request.messageId,
      attachmentId: request.attachmentId,
      audioFormat: mimeType.replace('audio/', ''),
      mobileTranscription: request.mobileTranscription,
      binaryFrames: binaryFrameInfo
    };

    const sourceMode = request.audioPath ? 'fichier' : 'base64';
    const transferMode = `multipart binaire (${(audioSize / 1024).toFixed(1)}KB, ${mimeType}, source: ${sourceMode})`;

    logger.info('🔍 [ZMQ-TRACE] Message à envoyer:');
    logger.info(`   - type: ${requestMessage.type}`);
    logger.info(`   - taskId: ${taskId}`);
    logger.info(`   - messageId: ${request.messageId}`);
    logger.info(`   - attachmentId: ${request.attachmentId || 'N/A'}`);
    logger.info(`   - audioFormat: ${requestMessage.audioFormat}`);
    logger.info(`   - binaryFrames.audio: ${binaryFrameInfo.audio}`);
    logger.info(`   - binaryFrames.audioMimeType: ${binaryFrameInfo.audioMimeType}`);
    logger.info(`   - binaryFrames.audioSize: ${binaryFrameInfo.audioSize} bytes`);
    logger.info(`   - transferMode: ${transferMode}`);
    logger.info(`   - mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);

    logger.info(`🔍 [ZMQ-TRACE] Envoi via PUSH multipart...`);
    // Envoyer via PUSH en multipart
    await this.connectionManager.sendMultipart(requestMessage, binaryFrames);

    logger.info(`🔍 [ZMQ-TRACE] ✅ Message envoyé avec succès`);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: requestMessage,
      timestamp: Date.now()
    });

    this.stats.transcriptionRequests++;

    logger.info(`🔍 [ZMQ-TRACE] ======== FIN ENVOI TRANSCRIPTION ========`);
    logger.info(`📤 [ZMQ-Client] Transcription only PUSH envoyée: taskId=${taskId}, messageId=${request.messageId}`);

    return taskId;
  }

  /**
   * Envoie une requête Voice API au service translator.
   * Supporte toutes les opérations Voice API:
   * - voice_translate / voice_translate_async
   * - voice_analyze / voice_compare
   * - voice_profile_* (CRUD)
   * - voice_feedback / voice_history / voice_stats
   * - voice_admin_metrics / voice_health / voice_languages
   */
  async sendVoiceAPIRequest(request: VoiceAPIRequest, _existingTaskId?: string): Promise<string> {
    logger.info('🎤 ENVOI VOICE API REQUEST:');
    logger.info(`   📋 type: ${request.type}`);
    logger.info(`   📋 taskId: ${request.taskId}`);
    logger.info(`   📋 userId: ${request.userId || 'N/A'}`);

    // Envoyer via PUSH
    await this.connectionManager.send(request);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(request.taskId, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.voiceAPIRequests++;

    logger.info(`📤 [ZMQ-Client] Voice API request envoyée: taskId=${request.taskId}, type=${request.type}`);

    return request.taskId;
  }

  /**
   * Send a voice profile request to Translator for audio processing.
   *
   * Supported types:
   * - voice_profile_analyze: Analyze audio for profile creation/update
   * - voice_profile_verify: Verify audio matches existing profile
   * - voice_profile_compare: Compare two fingerprints
   */
  async sendVoiceProfileRequest(request: VoiceProfileRequest, _existingTaskId?: string): Promise<string> {
    logger.info('🎤 ENVOI VOICE PROFILE REQUEST:');
    logger.info(`   📋 type: ${request.type}`);
    logger.info(`   📋 request_id: ${request.request_id}`);

    // Envoyer via PUSH
    await this.connectionManager.send(request);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(request.request_id, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.voiceProfileRequests++;

    logger.info(`📤 [ZMQ-Client] Voice Profile request envoyée: request_id=${request.request_id}, type=${request.type}`);

    return request.request_id;
  }

  /**
   * Envoie une requête de traduction pour un textObject de story.
   * Utilisé par le pipeline story_text_object_translation (Task 14/15).
   */
  async sendStoryTextObjectRequest(params: {
    postId: string;
    textObjectIndex: number;
    text: string;
    sourceLanguage: string;
    targetLanguages: string[];
  }): Promise<void> {
    const requestMessage = {
      type: 'story_text_object_translation',
      postId: params.postId,
      textObjectIndex: params.textObjectIndex,
      text: params.text,
      sourceLanguage: params.sourceLanguage,
      targetLanguages: params.targetLanguages,
      timestamp: Date.now(),
    };

    logger.info('📤 StoryTextObject: sending ZMQ request', {
      postId: params.postId,
      index: params.textObjectIndex,
      sourceLanguage: params.sourceLanguage,
      targetLanguages: params.targetLanguages.length,
    });

    await this.connectionManager.send(requestMessage);
  }

  /**
   * Enregistre un timeout pour une requête en cours.
   * Doit être appelé après que la requête a été ajoutée via pendingRequests.set().
   */
  registerTimeout(taskId: string, timeoutMs: number, onTimeout: () => void): void {
    const entry = this.pendingRequests.get(taskId);
    if (!entry) return;

    const timeoutId = setTimeout(() => {
      if (this.pendingRequests.has(taskId)) {
        this.pendingRequests.delete(taskId);
        onTimeout();
      }
    }, timeoutMs);

    this.pendingRequests.set(taskId, { ...entry, timeoutId, onTimeout });
  }

  /**
   * Retire une requête du cache des requêtes en cours et annule son timeout.
   */
  removePendingRequest(taskId: string): void {
    const entry = this.pendingRequests.get(taskId);
    if (entry?.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    this.pendingRequests.delete(taskId);
  }

  /**
   * Récupère le nombre de requêtes en cours
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Récupère les statistiques d'envoi
   */
  getStats(): RequestSenderStats {
    return { ...this.stats };
  }

  /**
   * Nettoie les ressources et annule tous les timeouts en cours
   */
  clear(): void {
    for (const entry of this.pendingRequests.values()) {
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
    }
    this.pendingRequests.clear();
  }
}
