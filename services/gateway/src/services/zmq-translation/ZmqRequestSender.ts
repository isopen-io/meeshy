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
import { withTimeout } from '../../utils/with-timeout';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
// Logger dédié pour ZmqRequestSender
const logger = enhancedLogger.child({ module: 'ZmqRequestSender' });

/**
 * Forme canonique d'un code langue (SSOT `normalizeLanguageCode`). Les appelants
 * donnent leurs cibles VERBATIM (`'EN'`, `'pt-BR'`, `'fr-FR'` — la diffusion
 * admin, la traduction à la demande d'un post/commentaire) et le champ n'est
 * normalisé nulle part en amont. On les canonicalise ICI, à l'unique porte avant
 * ZMQ, pour DEUX raisons — la seconde est un défaut de complétude, pas une
 * optimisation :
 *  - une cible région-taggée (`'pt-BR'`) est absente de la table NLLB côté
 *    translator et y retombe silencieusement : la traduction n'est jamais
 *    produite, et le travail ML (le poste le plus cher du pipeline) est gaspillé
 *    en double dès que `'fr'` et `'fr-FR'` cohabitent ;
 *  - le jeu ENVOYÉ (`targetLanguages`) et le jeu ATTENDU (`pendingLanguages`)
 *    doivent coïncider : une complétion rendue sous `'pt'` ne solderait jamais
 *    une attente inscrite sous `'pt-br'`, et la requête expirerait au deadman.
 */
const canonicalLanguage = (language: string): string =>
  normalizeLanguageCode(language) ?? language.toLowerCase();


export interface RequestSenderStats {
  translationRequests: number;
  audioProcessRequests: number;
  transcriptionRequests: number;
  voiceAPIRequests: number;
  voiceProfileRequests: number;
}

export class ZmqRequestSender {
  private connectionManager: ZmqConnectionManager;

  // Cache des requêtes en cours (pour traçabilité + timeout).
  //
  // `pendingLanguages` n'existe que pour les requêtes de TRADUCTION : le
  // translator rend une langue à la fois, donc une requête à N langues reçoit N
  // `translationCompleted`. Elle n'est soldée qu'une fois ce jeu vidé — sinon
  // les langues 2..N perdraient deadman, retry et erreur dès la première rendue.
  private pendingRequests: Map<string, {
    request: any;
    timestamp: number;
    timeoutId?: NodeJS.Timeout;
    onTimeout?: (pendingLanguages?: string[]) => void;
    pendingLanguages?: Set<string>;
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

    // Canonicaliser PUIS dédupliquer les langues cibles (SSOT `canonicalLanguage`).
    // Le jeu ENVOYÉ est ainsi identique au jeu ATTENDU (`pendingLanguages` plus
    // bas) : `'fr'` et `'fr-FR'` comptent pour UNE cible, et aucune forme
    // région-taggée invalide n'atteint NLLB.
    const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(canonicalLanguage))];
    if (uniqueTargetLanguages.length === 0) {
      throw new Error('targetLanguages must not be empty after deduplication');
    }

    // Préparer le message de commande
    const requestMessage = {
      type: 'translation',  // Type explicite pour routage
      taskId: taskId,
      messageId: request.messageId,
      text: request.text,
      sourceLanguage: request.sourceLanguage,
      targetLanguages: uniqueTargetLanguages,
      conversationId: request.conversationId,
      modelType: request.modelType || 'basic',
      timestamp: Date.now()
    };

    // Envoyer la commande via PUSH avec timeout (5s) pour détecter les pannes translator
    try {
      await withTimeout(
        this.connectionManager.send(requestMessage),
        5_000,
        `ZMQ send timeout after 5s for taskId=${taskId}`
      );
    } catch (error) {
      logger.error(`❌ [ZMQ-Client] Échec envoi PUSH taskId=${taskId}:`, error);
      throw error;
    }

    // Stocker la requête en cours pour traçabilité, avec le jeu des langues
    // qu'elle attend encore (un renvoi avec `existingTaskId` REMPLACE ce jeu :
    // il ne porte plus que les langues encore manquantes).
    this.pendingRequests.set(taskId, {
      request: request,
      timestamp: Date.now(),
      pendingLanguages: new Set(uniqueTargetLanguages)
    });

    this.stats.translationRequests++;

    logger.info('translation push sent', {
      taskId,
      messageId: request.messageId,
      conversationId: request.conversationId,
      sourceLanguage: request.sourceLanguage,
      targetLanguages: uniqueTargetLanguages,
      modelType: requestMessage.modelType,
      textLength: request.text.length
    });

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

    // Envoyer via PUSH en multipart (TOUJOURS)
    await this.connectionManager.sendMultipart(requestMessage, binaryFrames);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: requestMessage,
      timestamp: Date.now()
    });

    this.stats.audioProcessRequests++;

    logger.info('audio process push sent', {
      taskId,
      messageId: request.messageId,
      attachmentId: request.attachmentId,
      conversationId: request.conversationId,
      senderId: request.senderId,
      targetLanguages: request.targetLanguages,
      audioDurationMs: request.audioDurationMs,
      hasMobileTranscription: Boolean(request.mobileTranscription),
      audioSize: audioData.size,
      audioMimeType: audioData.mimeType,
      voiceProfileBytes: binaryFrameInfo.voiceProfileSize
    });

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
    // Valider qu'on a une source audio (fichier OU base64)
    if (!request.audioPath && !request.audioData) {
      throw new Error('Either audioPath or audioData (base64) must be provided');
    }

    const taskId = existingTaskId ?? randomUUID();

    let audioBuffer: Buffer;
    let mimeType: string;
    let audioSize: number;

    if (request.audioPath) {
      // Mode fichier: charger depuis le disque
      const audioData = await loadAudioAsBinary(request.audioPath);
      if (!audioData) {
        throw new Error(`Impossible de charger le fichier audio: ${request.audioPath}`);
      }
      audioBuffer = audioData.buffer;
      mimeType = audioData.mimeType;
      audioSize = audioData.size;
    } else {
      // Mode base64: décoder en Buffer (pas de fichier temporaire)
      audioBuffer = Buffer.from(request.audioData!, 'base64');
      audioSize = audioBuffer.length;

      // Déterminer le mime type depuis audioFormat
      mimeType = audioFormatToMimeType(request.audioFormat || 'wav');
    }

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

    // Envoyer via PUSH en multipart
    await this.connectionManager.sendMultipart(requestMessage, binaryFrames);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(taskId, {
      request: requestMessage,
      timestamp: Date.now()
    });

    this.stats.transcriptionRequests++;

    logger.info('transcription push sent', {
      taskId,
      messageId: request.messageId,
      attachmentId: request.attachmentId,
      audioFormat: requestMessage.audioFormat,
      sourceMode: request.audioPath ? 'file' : 'base64',
      audioSize,
      audioMimeType: mimeType,
      hasMobileTranscription: Boolean(request.mobileTranscription)
    });

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
    // Envoyer via PUSH
    await this.connectionManager.send(request);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(request.taskId, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.voiceAPIRequests++;

    logger.info('voice api push sent', {
      taskId: request.taskId,
      type: request.type,
      userId: request.userId
    });

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
    // Envoyer via PUSH
    await this.connectionManager.send(request);

    // Stocker la requête en cours pour traçabilité
    this.pendingRequests.set(request.request_id, {
      request: request,
      timestamp: Date.now()
    });

    this.stats.voiceProfileRequests++;

    logger.info('voice profile push sent', {
      requestId: request.request_id,
      type: request.type
    });

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
   *
   * `onTimeout` reçoit les langues encore attendues au moment où le deadman
   * tombe : l'entrée est retirée AVANT l'appel, donc c'est la seule occasion de
   * les lire, et un renvoi ne doit redemander que celles-là.
   */
  registerTimeout(taskId: string, timeoutMs: number, onTimeout: (pendingLanguages?: string[]) => void): void {
    const entry = this.pendingRequests.get(taskId);
    if (!entry) return;

    const timeoutId = setTimeout(() => {
      const pending = this.pendingRequests.get(taskId);
      if (pending) {
        this.pendingRequests.delete(taskId);
        onTimeout(pending.pendingLanguages ? [...pending.pendingLanguages] : undefined);
      }
    }, timeoutMs);

    this.pendingRequests.set(taskId, { ...entry, timeoutId, onTimeout });
  }

  /**
   * Solde UNE langue d'une requête de traduction.
   *
   * Rend les langues encore attendues, ou `null` si le taskId n'est plus (ou
   * n'a jamais été) en cours — un doublon, ou un résultat arrivé après le
   * deadman. Quand la dernière langue est soldée, la requête est retirée et son
   * timeout annulé, exactement comme `removePendingRequest`.
   *
   * Une requête sans jeu de langues (audio, voix) se solde d'un coup : ces
   * pipelines ne rendent qu'un résultat.
   */
  settleTranslationLanguage(taskId: string, targetLanguage: string): { remaining: string[] } | null {
    const entry = this.pendingRequests.get(taskId);
    if (!entry) return null;

    if (!entry.pendingLanguages) {
      this.removePendingRequest(taskId);
      return { remaining: [] };
    }

    entry.pendingLanguages.delete(canonicalLanguage(targetLanguage));

    if (entry.pendingLanguages.size === 0) {
      this.removePendingRequest(taskId);
      return { remaining: [] };
    }

    return { remaining: [...entry.pendingLanguages] };
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
