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

  // Cache des requêtes en cours (pour traçabilité)
  private pendingRequests: Map<string, {
    request: any;
    timestamp: number;
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
  async sendTranslationRequest(request: TranslationRequest): Promise<string> {
    const taskId = randomUUID();

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

    logger.info('[GATEWAY] 🔍 PRÉPARATION ENVOI PUSH:');
    logger.info(`[GATEWAY]    📋 taskId: ${taskId}`);
    logger.info(`[GATEWAY]    📋 messageId: ${request.messageId}`);
    logger.info(`[GATEWAY]    📋 text: "${request.text}"`);
    logger.info(`[GATEWAY]    📋 sourceLanguage: ${request.sourceLanguage}`);
    logger.info(`[GATEWAY]    📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
    logger.info(`[GATEWAY]    📋 conversationId: ${request.conversationId}`);
    logger.info(`[GATEWAY]    🎨 modelType: ${requestMessage.modelType}`);
    logger.info(`[GATEWAY]    📋 message size: ${JSON.stringify(requestMessage).length} chars`);

    // Envoyer la commande via PUSH (garantit distribution équitable)
    await this.connectionManager.send(requestMessage);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.translationRequests++;

    logger.info(`[GATEWAY] 📤 [ZMQ-Client] Commande PUSH envoyée: taskId=${taskId}, conversationId=${request.conversationId}, langues=${request.targetLanguages.length}, message=${JSON.stringify(requestMessage)}`);

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
  async sendAudioProcessRequest(request: Omit<AudioProcessRequest, 'type'>): Promise<string> {
    // Valider qu'on a une source audio
    if (!request.audioPath) {
      throw new Error('audioPath must be provided');
    }

    const taskId = randomUUID();

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

        logger.info(`[GATEWAY]    🎙️ Voice profile transmis en multipart: frame 2 (${embeddingBuffer.length} bytes)`);
      } catch (error) {
        logger.error('[GATEWAY] ⚠️ Erreur décodage voice profile, ignoré', error);
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
      generateVoiceClone: request.generateVoiceClone,
      modelType: request.modelType,
      // Champs voice profile (métadonnées seulement, embedding dans frame binaire)
      originalSenderId: request.originalSenderId,
      existingVoiceProfile: voiceProfileMetadata,  // Métadonnées uniquement (sans embedding)
      useOriginalVoice: request.useOriginalVoice,
      voiceCloneParams: request.voiceCloneParams
    };

    const transferMode = `multipart binaire (${(audioData.size / 1024).toFixed(1)}KB, ${audioData.mimeType})`;

    logger.info('[GATEWAY] 🎤 ENVOI AUDIO PROCESS:');
    logger.info(`[GATEWAY]    📋 taskId: ${taskId}`);
    logger.info(`[GATEWAY]    📋 messageId: ${request.messageId}`);
    logger.info(`[GATEWAY]    📋 attachmentId: ${request.attachmentId}`);
    logger.info(`[GATEWAY]    📋 senderId: ${request.senderId}`);
    logger.info(`[GATEWAY]    📋 targetLanguages: [${request.targetLanguages.join(', ')}]`);
    logger.info(`[GATEWAY]    📋 audioDurationMs: ${request.audioDurationMs}`);
    logger.info(`[GATEWAY]    📋 mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);
    logger.info(`[GATEWAY]    📋 transferMode: ${transferMode}`);

    // Envoyer via PUSH en multipart (TOUJOURS)
    await this.connectionManager.sendMultipart(requestMessage, binaryFrames);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: requestMessage,
      timestamp: Date.now()
    });

    this.stats.audioProcessRequests++;

    logger.info(`[GATEWAY] 📤 [ZMQ-Client] Audio process PUSH envoyée: taskId=${taskId}, messageId=${request.messageId}`);

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
    request: Omit<TranscriptionOnlyRequest, 'type' | 'taskId'>
  ): Promise<string> {
    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] ======== DÉBUT ENVOI TRANSCRIPTION ========`);
    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] Request params:`);
    logger.info(`[GATEWAY]    - messageId: ${request.messageId}`);
    logger.info(`[GATEWAY]    - attachmentId: ${request.attachmentId}`);
    logger.info(`[GATEWAY]    - audioPath: ${request.audioPath || 'N/A'}`);
    logger.info(`[GATEWAY]    - audioData (base64): ${request.audioData ? `${request.audioData.substring(0, 50)}...` : 'N/A'}`);
    logger.info(`[GATEWAY]    - audioFormat: ${request.audioFormat || 'N/A'}`);
    logger.info(`[GATEWAY]    - mobileTranscription: ${request.mobileTranscription ? 'OUI' : 'NON'}`);

    // Valider qu'on a une source audio (fichier OU base64)
    if (!request.audioPath && !request.audioData) {
      logger.error(`[GATEWAY] 🔍 [ZMQ-TRACE] ❌ Aucune source audio fournie`);
      throw new Error('Either audioPath or audioData (base64) must be provided');
    }

    const taskId = randomUUID();
    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] Task ID généré: ${taskId}`);

    let audioBuffer: Buffer;
    let mimeType: string;
    let audioSize: number;

    if (request.audioPath) {
      logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] Mode FICHIER: chargement depuis ${request.audioPath}...`);
      // Mode fichier: charger depuis le disque
      const audioData = await loadAudioAsBinary(request.audioPath);
      if (!audioData) {
        logger.error(`[GATEWAY] 🔍 [ZMQ-TRACE] ❌ Impossible de charger le fichier`);
        throw new Error(`Impossible de charger le fichier audio: ${request.audioPath}`);
      }
      audioBuffer = audioData.buffer;
      mimeType = audioData.mimeType;
      audioSize = audioData.size;
      logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] ✅ Fichier chargé: ${(audioSize / 1024).toFixed(2)} KB`);
    } else {
      logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] Mode BASE64: décodage...`);
      // Mode base64: décoder en Buffer (pas de fichier temporaire)
      audioBuffer = Buffer.from(request.audioData!, 'base64');
      audioSize = audioBuffer.length;

      // Déterminer le mime type depuis audioFormat
      mimeType = audioFormatToMimeType(request.audioFormat || 'wav');
      logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] ✅ Audio décodé: ${(audioSize / 1024).toFixed(2)} KB, MIME: ${mimeType}`);
    }

    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] Préparation frames multipart...`);

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

    logger.info('[GATEWAY] 🔍 [ZMQ-TRACE] Message à envoyer:');
    logger.info(`[GATEWAY]    - type: ${requestMessage.type}`);
    logger.info(`[GATEWAY]    - taskId: ${taskId}`);
    logger.info(`[GATEWAY]    - messageId: ${request.messageId}`);
    logger.info(`[GATEWAY]    - attachmentId: ${request.attachmentId || 'N/A'}`);
    logger.info(`[GATEWAY]    - audioFormat: ${requestMessage.audioFormat}`);
    logger.info(`[GATEWAY]    - binaryFrames.audio: ${binaryFrameInfo.audio}`);
    logger.info(`[GATEWAY]    - binaryFrames.audioMimeType: ${binaryFrameInfo.audioMimeType}`);
    logger.info(`[GATEWAY]    - binaryFrames.audioSize: ${binaryFrameInfo.audioSize} bytes`);
    logger.info(`[GATEWAY]    - transferMode: ${transferMode}`);
    logger.info(`[GATEWAY]    - mobileTranscription: ${request.mobileTranscription ? 'provided' : 'none'}`);

    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] Envoi via PUSH multipart...`);
    // Envoyer via PUSH en multipart
    await this.connectionManager.sendMultipart(requestMessage, binaryFrames);

    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] ✅ Message envoyé avec succès`);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: requestMessage,
      timestamp: Date.now()
    });

    this.stats.transcriptionRequests++;

    logger.info(`[GATEWAY] 🔍 [ZMQ-TRACE] ======== FIN ENVOI TRANSCRIPTION ========`);
    logger.info(`[GATEWAY] 📤 [ZMQ-Client] Transcription only PUSH envoyée: taskId=${taskId}, messageId=${request.messageId}`);

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
  async sendVoiceAPIRequest(request: VoiceAPIRequest): Promise<string> {
    logger.info('[GATEWAY] 🎤 ENVOI VOICE API REQUEST:');
    logger.info(`[GATEWAY]    📋 type: ${request.type}`);
    logger.info(`[GATEWAY]    📋 taskId: ${request.taskId}`);
    logger.info(`[GATEWAY]    📋 userId: ${request.userId || 'N/A'}`);

    // Envoyer via PUSH
    await this.connectionManager.send(request);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(request.taskId, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.voiceAPIRequests++;

    logger.info(`[GATEWAY] 📤 [ZMQ-Client] Voice API request envoyée: taskId=${request.taskId}, type=${request.type}`);

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
  async sendVoiceProfileRequest(request: VoiceProfileRequest): Promise<string> {
    logger.info('[GATEWAY] 🎤 ENVOI VOICE PROFILE REQUEST:');
    logger.info(`[GATEWAY]    📋 type: ${request.type}`);
    logger.info(`[GATEWAY]    📋 request_id: ${request.request_id}`);

    // Envoyer via PUSH
    await this.connectionManager.send(request);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(request.request_id, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.voiceProfileRequests++;

    logger.info(`[GATEWAY] 📤 [ZMQ-Client] Voice Profile request envoyée: request_id=${request.request_id}, type=${request.type}`);

    return request.request_id;
  }

  /**
   * Retire une requête du cache des requêtes en cours
   */
  removePendingRequest(taskId: string): void {
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
   * Nettoie les ressources
   */
  clear(): void {
    this.pendingRequests.clear();
  }
}
