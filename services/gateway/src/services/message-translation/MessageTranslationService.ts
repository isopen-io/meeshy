/**
 * Service de traduction haute performance pour Meeshy
 * Architecture modulaire avec composition forte
 *
 * SECURITY: Translations are encrypted for server/hybrid mode conversations
 * to prevent plaintext exposure in the database.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { ZmqTranslationClient, TranslationRequest, TranslationResult } from '../zmq-translation';
import { ZMQSingleton } from '../ZmqSingleton';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { TranslationCache } from './TranslationCache';
import { LanguageCache } from './LanguageCache';
import { TranslationStats, TranslationServiceStats } from './TranslationStats';
import { EncryptionHelper } from './EncryptionHelper';
import { ConsentValidationService } from '../ConsentValidationService';
import { MultiLevelJobMappingCache } from '../MultiLevelJobMappingCache';
import type { AttachmentTranscription, AttachmentTranslations, AttachmentTranslation, TranscriptionSegment } from '@meeshy/shared/types/attachment-audio';
import { toSocketIOTranslation } from '@meeshy/shared/types/attachment-audio';

const logger = enhancedLogger.child({ module: 'MessageTranslationService' });

export interface MessageData {
  id?: string;
  conversationId: string;
  senderId?: string;
  anonymousSenderId?: string;
  content: string;
  originalLanguage: string;
  messageType?: string;
  replyToId?: string;
  targetLanguage?: string;
  isEncrypted?: boolean;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid' | null;
}

interface TranslationEncryptionData {
  isEncrypted: boolean;
  encryptionKeyId: string | null;
  encryptionIv: string | null;
  encryptionAuthTag: string | null;
}

export class MessageTranslationService extends EventEmitter {
  private readonly prisma: PrismaClient;
  private zmqClient: ZmqTranslationClient | null = null;
  private isInitialized: boolean = false;
  private redis: Redis | null = null;
  private jobMappingService: MultiLevelJobMappingCache | null = null;

  // Composition de modules
  private readonly translationCache: TranslationCache;
  private readonly languageCache: LanguageCache;
  private readonly stats: TranslationStats;
  private readonly encryptionHelper: EncryptionHelper;

  // Déduplication
  private readonly processedMessages = new Set<string>();
  private readonly processedTasks = new Set<string>();

  constructor(prisma: PrismaClient, redis?: Redis, jobMappingCache?: MultiLevelJobMappingCache) {
    super();
    this.prisma = prisma;
    this.redis = redis || null;
    this.translationCache = new TranslationCache(1000);
    this.languageCache = new LanguageCache(5 * 60 * 1000, 100);
    this.stats = new TranslationStats();
    this.encryptionHelper = new EncryptionHelper(prisma);

    // Utiliser le cache partagé si fourni, sinon en créer un (rétro-compatibilité)
    this.jobMappingService = jobMappingCache || new MultiLevelJobMappingCache(this.redis || undefined);
  }

  getZmqClient(): ZmqTranslationClient | null {
    return this.zmqClient;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.zmqClient = await ZMQSingleton.getInstance();

    // Retirer les anciens listeners
    this.zmqClient.removeAllListeners('translationCompleted');
    this.zmqClient.removeAllListeners('translationError');
    this.zmqClient.removeAllListeners('audioProcessCompleted');
    this.zmqClient.removeAllListeners('audioProcessError');
    this.zmqClient.removeAllListeners('voiceTranslationCompleted');
    this.zmqClient.removeAllListeners('voiceTranslationFailed');

    // Enregistrer les nouveaux listeners
    this.zmqClient.on('translationCompleted', this._handleTranslationCompleted.bind(this));
    this.zmqClient.on('translationError', this._handleTranslationError.bind(this));
    this.zmqClient.on('audioProcessCompleted', this._handleAudioProcessCompleted.bind(this));
    this.zmqClient.on('audioProcessError', this._handleAudioProcessError.bind(this));
    this.zmqClient.on('transcriptionCompleted', this._handleTranscriptionOnlyCompleted.bind(this));
    this.zmqClient.on('transcriptionReady', this._handleTranscriptionReady.bind(this));  // Transcription prête (avant traduction)

    // Événements de traduction progressifs avec contexte sémantique
    this.zmqClient.on('audioTranslationReady', this._handleAudioTranslationReady.bind(this));  // Traduction unique (1 langue)
    this.zmqClient.on('audioTranslationsProgressive', this._handleAudioTranslationsProgressive.bind(this));  // Traduction progressive (multi-langues)
    this.zmqClient.on('audioTranslationsCompleted', this._handleAudioTranslationsCompleted.bind(this));  // Dernière traduction (multi-langues)

    // DEPRECATED: conservé pour rétrocompatibilité
    this.zmqClient.on('translationReady', this._handleTranslationReady.bind(this));

    this.zmqClient.on('transcriptionError', this._handleTranscriptionOnlyError.bind(this));
    this.zmqClient.on('voiceTranslationCompleted', this._handleVoiceTranslationCompleted.bind(this));
    this.zmqClient.on('voiceTranslationFailed', this._handleVoiceTranslationFailed.bind(this));

    // Client initialized successfully

    this.isInitialized = true;
  }

  /**
   * Traite un nouveau message selon l'architecture spécifiée
   */
  async handleNewMessage(messageData: MessageData): Promise<{ messageId: string; status: string }> {
    try {
      const startTime = Date.now();

      // SECURITY: Skip translation for E2EE messages
      if (messageData.encryptionMode === 'e2ee') {
        logger.debug('Skipping translation for E2EE message', {
          conversationId: messageData.conversationId,
          encryptionMode: messageData.encryptionMode
        });

        if (!messageData.id) {
          const savedMessage = await this._saveMessageToDatabase(messageData);
          this.stats.incrementMessagesSaved();
          return {
            messageId: savedMessage.id,
            status: 'e2ee_skipped'
          };
        }
        return {
          messageId: messageData.id,
          status: 'e2ee_skipped'
        };
      }

      let messageId: string;
      let isRetranslation = false;

      if (messageData.id) {
        messageId = messageData.id;
        isRetranslation = true;

        const existingMessage = await this.prisma.message.findFirst({
          where: { id: messageData.id }
        });

        if (!existingMessage) {
          throw new Error(`Message ${messageData.id} non trouvé en base de données`);
        }
      } else {
        const savedMessage = await this._saveMessageToDatabase(messageData);
        messageId = savedMessage.id;
        this.stats.incrementMessagesSaved();
      }

      const response = {
        messageId: messageId,
        status: isRetranslation ? 'retranslation_queued' : 'message_saved',
        translation_queued: true
      };

      // Traitement asynchrone
      setImmediate(async () => {
        try {
          if (isRetranslation) {
            await this._processRetranslationAsync(messageId, messageData);
          } else {
            const savedMessage = await this.prisma.message.findFirst({
              where: { id: messageId }
            });
            if (savedMessage) {
              const requestedModelType = (messageData as any).modelType;
              await this._processTranslationsAsync(savedMessage, messageData.targetLanguage, requestedModelType);
            } else {
              logger.error(`❌ [TranslationService] Message ${messageId} non trouvé en base`);
            }
          }
        } catch (error) {
          logger.error(`❌ Erreur traitement asynchrone des traductions: ${error}`);
          this.stats.incrementErrors();
        }
      });

      return response;
    } catch (error) {
      logger.error(`❌ Erreur traitement message: ${error}`);
      this.stats.incrementErrors();
      throw error;
    }
  }

  private async _saveMessageToDatabase(messageData: MessageData) {
    try {
      const existingConversation = await this.prisma.conversation.findFirst({
        where: { id: messageData.conversationId }
      });

      if (!existingConversation) {
        const conversationIdentifier = this._generateConversationIdentifier(`Conversation ${messageData.conversationId}`);

        await this.prisma.conversation.create({
          data: {
            id: messageData.conversationId,
            identifier: conversationIdentifier,
            title: `Conversation ${messageData.conversationId}`,
            type: 'group',
            createdAt: new Date(),
            lastMessageAt: new Date()
          }
        });
      }

      const message = await this.prisma.message.create({
        data: {
          conversationId: messageData.conversationId,
          senderId: messageData.senderId || null,
          anonymousSenderId: messageData.anonymousSenderId || null,
          content: messageData.content,
          originalLanguage: messageData.originalLanguage,
          messageType: messageData.messageType || 'text',
          replyToId: messageData.replyToId || null
        }
      });

      await this.prisma.conversation.update({
        where: { id: messageData.conversationId },
        data: { lastMessageAt: new Date() }
      });

      return message;
    } catch (error) {
      logger.error(`❌ Erreur sauvegarde message: ${error}`);
      throw error;
    }
  }

  private _generateConversationIdentifier(title?: string): string {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');

    if (title) {
      const sanitizedTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (sanitizedTitle.length > 0) {
        return `mshy_${sanitizedTitle}-${timestamp}`;
      }
    }

    const uniqueId = Math.random().toString(36).slice(2, 10);
    return `mshy_${uniqueId}-${timestamp}`;
  }

  getStats(): TranslationServiceStats {
    return this.stats.getStats();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const zmqHealth = await this.zmqClient.healthCheck();
      return zmqHealth;
    } catch (error) {
      logger.error(`❌ Health check échoué: ${error}`);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.zmqClient.close();
    } catch (error) {
      logger.error(`❌ Erreur fermeture TranslationService: ${error}`);
    }
  }


  // ==========================================================
  // MÉTHODES PRIVÉES - Implémentations complètes restaurées

  // ============================================================================
  // ENCRYPTION HELPERS - DELEGATED TO EncryptionHelper MODULE
  // ============================================================================

  private async _getConversationEncryptionKey(conversationId: string): Promise<{ keyId: string; key: Buffer } | null> {
    return this.encryptionHelper.getConversationEncryptionKey(conversationId);
  }

  private async _encryptTranslation(
    plaintext: string,
    conversationId: string
  ): Promise<TranslationEncryptionData & { encryptedContent: string }> {
    return this.encryptionHelper.encryptTranslation(plaintext, conversationId);
  }

  private async _decryptTranslation(
    encryptedContent: string,
    encryptionKeyId: string,
    encryptionIv: string,
    encryptionAuthTag: string
  ): Promise<string> {
    return this.encryptionHelper.decryptTranslation(encryptedContent, encryptionKeyId, encryptionIv, encryptionAuthTag);
  }

  private async _shouldEncryptTranslation(messageId: string): Promise<{ shouldEncrypt: boolean; conversationId: string | null }> {
    return this.encryptionHelper.shouldEncryptTranslation(messageId);
  }

  // ==========================================================

  private async _processTranslationsAsync(message: any, targetLanguage?: string, modelType?: string) {
    try {
      const startTime = Date.now();
      
      if (!this.zmqClient) {
        logger.error('[GATEWAY] ❌ ZMQ Client non disponible pour les traductions');
        return;
      }
      
      // 1. DÉTERMINER LES LANGUES CIBLES
      let targetLanguages: string[];
      
      if (targetLanguage) {
        // Utiliser la langue cible spécifiée par le client
        targetLanguages = [targetLanguage];
      } else {
        // Extraire les langues de la conversation (comportement par défaut)
        targetLanguages = await this._extractConversationLanguages(message.conversationId);
        
        if (targetLanguages.length === 0) {
        }
      }
      
      // OPTIMISATION: Filtrer les langues cibles pour éviter les traductions inutiles
      const filteredTargetLanguages = targetLanguages.filter(targetLang => {
        const sourceLang = message.originalLanguage;
        if (sourceLang && sourceLang !== 'auto' && sourceLang === targetLang) {
          return false;
        }
        return true;
      });


      // Si aucune langue cible après filtrage, ne pas envoyer de requête
      if (filteredTargetLanguages.length === 0) {
        return;
      }
      
      // 2. DÉTERMINER LE MODEL TYPE
      // Priorité: 1) modelType passé en paramètre, 2) modelType du message, 3) auto-détection
      const finalModelType = modelType || (message as any).modelType || ((message.content?.length ?? 0) < 80 ? 'medium' : 'premium');
      
      
      // 3. ENVOYER LA REQUÊTE DE TRADUCTION VIA ZMQ
      const request: TranslationRequest = {
        messageId: message.id,
        text: message.content,
        sourceLanguage: message.originalLanguage,
        targetLanguages: filteredTargetLanguages,
        conversationId: message.conversationId,
        modelType: finalModelType
      };
      
      const taskId = await this.zmqClient.sendTranslationRequest(request);
      this.stats.incrementRequestsSent();
      
      const processingTime = Date.now() - startTime;
      
    } catch (error) {
      logger.error(`❌ Erreur traitement asynchrone: ${error}`);
      this.stats.incrementErrors();
    }
  }


  /**
   * Traite une retraduction d'un message existant
   * OPTIMISATION: Filtre automatiquement les langues cibles identiques à la langue source
   * pour éviter les traductions inutiles (ex: fr → fr)
   */
  private async _processRetranslationAsync(messageId: string, messageData: MessageData) {
    try {
      
      // Récupérer le message existant depuis la base
      const existingMessage = await this.prisma.message.findFirst({
        where: { id: messageId }
      });
      
      if (!existingMessage) {
        throw new Error(`Message ${messageId} non trouvé pour retraduction`);
      }
      
      // 1. DÉTERMINER LES LANGUES CIBLES
      let targetLanguages: string[];
      
      if (messageData.targetLanguage) {
        // Utiliser la langue cible spécifiée par le client
        targetLanguages = [messageData.targetLanguage];
      } else {
        // Extraire les langues de la conversation (comportement par défaut)
        targetLanguages = await this._extractConversationLanguages(existingMessage.conversationId);
        
        if (targetLanguages.length === 0) {
        }
      }
      
      // OPTIMISATION: Filtrer les langues cibles pour éviter les traductions inutiles
      const filteredTargetLanguages = targetLanguages.filter(targetLang => {
        const sourceLang = existingMessage.originalLanguage;
        if (sourceLang && sourceLang !== 'auto' && sourceLang === targetLang) {
          return false;
        }
        return true;
      });
      
      
      // Si aucune langue cible après filtrage, ne pas envoyer de requête
      if (filteredTargetLanguages.length === 0) {
        return;
      }
      
      // 2. DÉTERMINER LE MODEL TYPE
      // Priorité: 1) modelType du messageData (demandé par l'utilisateur), 2) auto-détection
      const requestedModelType = (messageData as any).modelType;
      const autoModelType = (existingMessage.content?.length ?? 0) < 80 ? 'medium' : 'premium';
      const finalModelType = requestedModelType || autoModelType;
      
      
      // 3. SUPPRIMER LES ANCIENNES TRADUCTIONS POUR LES LANGUES CIBLES
      // Cela permet de remplacer les traductions existantes par les nouvelles
      if (filteredTargetLanguages.length > 0) {
        const deleteResult = await this.prisma.messageTranslation.deleteMany({
          where: {
            messageId: messageId,
            targetLanguage: {
              in: filteredTargetLanguages
            }
          }
        });
      }
      
      // 4. ENVOYER LA REQUÊTE DE RETRADUCTION VIA ZMQ
      const request: TranslationRequest = {
        messageId: messageId,
        text: existingMessage.content,
        sourceLanguage: existingMessage.originalLanguage,
        targetLanguages: filteredTargetLanguages,
        conversationId: existingMessage.conversationId,
        modelType: finalModelType
      };
      
      const taskId = await this.zmqClient.sendTranslationRequest(request);
      this.stats.incrementRequestsSent();
      
      
    } catch (error) {
      logger.error(`❌ Erreur retraduction: ${error}`);
      this.stats.incrementErrors();
    }
  }

  /**
   * Extrait les langues cibles des participants d'une conversation
   * Inclut les langues des utilisateurs authentifiés ET des participants anonymes
   * NOTE: Cette méthode retourne TOUTES les langues parlées dans la conversation,
   * indépendamment des préférences de traduction automatique des utilisateurs.
   * Le filtrage des langues identiques à la source se fait dans les méthodes de traitement.
   * 
   * OPTIMISATION: Les résultats sont mis en cache pendant 5 minutes pour éviter les requêtes répétées
   */
  private async _extractConversationLanguages(conversationId: string): Promise<string[]> {
    try {
      // OPTIMISATION: Vérifier le cache d'abord
      const cached = this.languageCache.get(conversationId);

      if (cached) {
        return cached;
      }
      
      const startTime = Date.now();
      const languages = new Set<string>();
      
      // OPTIMISATION: Faire les 2 requêtes en parallèle au lieu de séquentiellement
      const [members, anonymousParticipants] = await Promise.all([
        this.prisma.conversationMember.findMany({
          where: {
            conversationId: conversationId,
            isActive: true
          },
          include: {
            user: {
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true
              }
            }
          }
        }),
        this.prisma.anonymousParticipant.findMany({
          where: { 
            conversationId: conversationId,
            isActive: true 
          },
          select: {
            language: true
          }
        })
      ]);
      
      // Extraire TOUTES les langues des utilisateurs authentifiés
      // On extrait toujours systemLanguage, et les autres langues configurées
      // TODO: Utiliser UserPreferences pour filtrer selon autoTranslateEnabled
      for (const member of members) {
        // Toujours ajouter la langue système du participant
        if (member.user.systemLanguage) {
          languages.add(member.user.systemLanguage);
        }

        // Ajouter les langues additionnelles (simplifié - pas de vérification des préférences pour l'instant)
        if (member.user.regionalLanguage) {
          languages.add(member.user.regionalLanguage);
        }
        if (member.user.customDestinationLanguage) {
          languages.add(member.user.customDestinationLanguage);
        }
      }
      
      // Extraire les langues des participants anonymes
      for (const anonymousParticipant of anonymousParticipants) {
        if (anonymousParticipant.language) {
          languages.add(anonymousParticipant.language); 
        }
      }
      
      // Retourner toutes les langues (le filtrage se fera dans les méthodes de traitement)
      const allLanguages = Array.from(languages);

      // OPTIMISATION: Mettre en cache le résultat
      this.languageCache.set(conversationId, allLanguages);
      
      const queryTime = Date.now() - startTime;
      
      return allLanguages;
      
    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur extraction langues: ${error}`);
      return ['en', 'fr']; // Fallback
    }
  }

  private async _getMessageSourceLanguage(conversationId: string): Promise<string> {
    try {
      const lastMessage = await this.prisma.message.findFirst({
        where: { conversationId: conversationId },
        orderBy: { createdAt: 'desc' },
        select: { originalLanguage: true }
      });
      
      return lastMessage?.originalLanguage || 'fr';
    } catch (error) {
      logger.error(`❌ Erreur récupération langue source: ${error}`);
      return 'fr';
    }
  }

  private async _handleTranslationCompleted(data: { 
    taskId: string; 
    result: TranslationResult; 
    targetLanguage: string;
    metadata?: any;
  }) {
    try {
      const startTime = Date.now();
      
      // Utiliser taskId pour la déduplication (permet la retraduction avec un nouveau taskId)
      const taskKey = `${data.taskId}_${data.targetLanguage}`;
      
      // Vérifier si ce taskId a déjà été traité (évite les doublons accidentels)
      if (this.processedTasks.has(taskKey)) {
        return;
      }
      
      // Marquer ce task comme traité
      this.processedTasks.add(taskKey);
      
      // Nettoyer les anciens tasks traités (garder seulement les 1000 derniers)
      if (this.processedTasks.size > 1000) {
        const firstKey = this.processedTasks.values().next().value;
        this.processedTasks.delete(firstKey);
      }
      
      
      this.stats.incrementTranslationsReceived();
      
      // SAUVEGARDE EN BASE DE DONNÉES (traduction validée par le Translator)
      let translationId: string | null = null;
      try {
        translationId = await this._saveTranslationToDatabase(data.result, data.metadata);
      } catch (error) {
        logger.error(`❌ [TranslationService] Erreur sauvegarde traduction: ${error}`);
        // Continuer même si la sauvegarde échoue
      }
      
      // Mettre en cache avec métadonnées (écrase l'ancienne traduction)
      const cacheKey = `${data.result.messageId}_${data.result.sourceLanguage}_${data.targetLanguage}`;
      this._addToCache(cacheKey, data.result);
      
      // Incrémenter le compteur de traductions pour l'utilisateur
      await this._incrementUserTranslationStats(data.result.messageId);
      
      // Émettre événement avec métadonnées et ID de traduction
      this.emit('translationReady', {
        taskId: data.taskId,
        result: data.result,
        targetLanguage: data.targetLanguage,
        translationId: translationId, // Ajouter l'ID de la traduction
        metadata: data.metadata || {}
      });
      
      const processingTime = Date.now() - startTime;
      
    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur traitement: ${error}`);
      logger.error(`📋 [TranslationService] Données reçues: ${JSON.stringify(data, null, 2)}`);
      this.stats.incrementErrors();
    }
  }

  private async _handleTranslationError(data: { taskId: string; messageId: string; error: string; conversationId: string }) {
    logger.error(`❌ Erreur de traduction: ${data.error} pour ${data.messageId}`);

    if (data.error === 'translation pool full') {
      this.stats.incrementPoolFullRejections();
    }

    this.stats.incrementErrors();
  }

  // ============================================================================
  // AUDIO ATTACHMENT TRANSLATION HANDLERS
  // ============================================================================

  /**
   * Traite les résultats de traduction audio (attachements) reçus du Translator.
   * Sauvegarde:
   * 1. La transcription dans MessageAudioTranscription
   * 2. Chaque audio traduit dans MessageTranslatedAudio
   */
  private async _handleAudioProcessCompleted(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    transcription: {
      text: string;
      language: string;
      confidence: number;
      source: string;
      durationMs?: number;
      segments?: TranscriptionSegment[];
      speakerCount?: number;
      primarySpeakerId?: string;
      senderVoiceIdentified?: boolean;
      senderSpeakerId?: string | null;
      speakerAnalysis?: any;
    };
    translatedAudios: Array<{
      targetLanguage: string;
      translatedText: string;
      audioUrl: string;
      audioPath: string;
      durationMs: number;
      voiceCloned: boolean;
      voiceQuality: number;
      // Audio binaire (multipart ZMQ - plus efficace que base64)
      _audioBinary?: Buffer | null;
      audioMimeType?: string;
      // Rétrocompatibilité base64 (legacy)
      audioDataBase64?: string;
      segments?: TranscriptionSegment[];  // Segments de la transcription de l'audio traduit
    }>;
    voiceModelUserId: string;
    voiceModelQuality: number;
    processingTimeMs: number;
    // Nouveau profil vocal créé par Translator (à sauvegarder)
    newVoiceProfile?: {
      userId: string;
      profileId: string;
      // Embedding binaire (multipart ZMQ - plus efficace)
      _embeddingBinary?: Buffer | null;
      // Rétrocompatibilité base64 (legacy)
      embedding?: string;
      qualityScore: number;
      audioCount: number;
      totalDurationMs: number;
      version: number;
      fingerprint?: Record<string, any>;
      voiceCharacteristics?: Record<string, any>;
      // Conditionals Chatterbox pour multi-speaker TTS
      chatterbox_conditionals_base64?: string;
      reference_audio_id?: string;
      reference_audio_url?: string;
    };
  }) {
    try {
      const startTime = Date.now();

      logger.info(
        `🎤 [TranslationService] Audio process completed: ${data.attachmentId} | ` +
        (data.transcription?.text ? `Transcription: "${data.transcription.text.substring(0, 50)}..." | ` : '') +
        `Traductions: ${data.translatedAudios.length} | ` +
        `Temps: ${data.processingTimeMs}ms | TaskID: ${data.taskId}`
      );

      // 1. Récupérer les infos de l'attachment et traductions existantes
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { id: true, messageId: true, duration: true, translations: true }
      });

      if (!attachment) {
        logger.error(`❌ [TranslationService] Attachment non trouvé: ${data.attachmentId}`);
        return;
      }

      // 2. Construire la structure transcription JSON avec diarisation
      const transcriptionData = {
        text: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence,
        source: data.transcription.source,
        segments: data.transcription.segments || undefined,
        speakerCount: data.transcription.speakerCount,
        primarySpeakerId: data.transcription.primarySpeakerId,
        senderVoiceIdentified: data.transcription.senderVoiceIdentified,
        senderSpeakerId: data.transcription.senderSpeakerId,
        speakerAnalysis: data.transcription.speakerAnalysis,
        durationMs: data.transcription.durationMs || attachment.duration || 0
      };

      // DEBUG: Vérifier la structure des segments
      if (data.transcription.segments && data.transcription.segments.length > 0) {
        const firstSeg = data.transcription.segments[0];
        logger.info(`✅ Transcription: ${data.transcription.segments.length} segments | Premier: text="${firstSeg.text}" (${typeof firstSeg.text}), startMs=${firstSeg.startMs} (${typeof firstSeg.startMs}), endMs=${firstSeg.endMs}, speakerId=${firstSeg.speakerId}, voiceSim=${firstSeg.voiceSimilarityScore}, conf=${firstSeg.confidence}`);
      } else {
        logger.warn(`⚠️ Transcription SANS segments!`);
      }

      // DEBUG: Vérifier les infos de diarisation
      if (data.transcription.speakerCount) {
        const speakersInfo = data.transcription.speakerAnalysis
          ? data.transcription.speakerAnalysis.speakers.map((sp: any) => `${sp.sid}(primary=${sp.isPrimary}, score=${sp.voiceSimilarityScore})`).join(', ')
          : 'N/A';
        logger.info(`🎤 [GATEWAY] Diarisation: ${data.transcription.speakerCount} locuteur(s) | primary=${data.transcription.primarySpeakerId} | senderIdentified=${data.transcription.senderVoiceIdentified} | senderSpeaker=${data.transcription.senderSpeakerId} | speakers=[${speakersInfo}]`);
      }

      logger.info(`✅ Transcription sauvegardée: ${data.transcription.language}`);

      // 3. Construire la structure translations JSON
      const existingTranslations = (attachment.translations as unknown as AttachmentTranslations) || {};
      const translationsData: AttachmentTranslations = { ...existingTranslations };

      for (const translatedAudio of data.translatedAudios) {
        let localAudioPath = translatedAudio.audioPath;
        let localAudioUrl = translatedAudio.audioUrl;

        // MULTIPART: Priorité aux données binaires (efficace, pas de décodage)
        // Fallback sur base64 pour rétrocompatibilité
        const audioBinary = translatedAudio._audioBinary;
        const audioBase64 = translatedAudio.audioDataBase64;

        if (audioBinary || audioBase64) {
          try {
            // Créer le dossier de sortie s'il n'existe pas
            const translatedDir = path.resolve(process.cwd(), 'uploads/attachments/translated');
            await fs.mkdir(translatedDir, { recursive: true });

            // Générer un nom de fichier unique
            const ext = translatedAudio.audioMimeType?.replace('audio/', '') || 'mp3';
            const filename = `${data.attachmentId}_${translatedAudio.targetLanguage}.${ext}`;
            localAudioPath = path.resolve(translatedDir, filename);

            // Sauvegarder directement le buffer (multipart) ou décoder base64 (legacy)
            const audioBuffer = audioBinary || Buffer.from(audioBase64!, 'base64');
            await fs.writeFile(localAudioPath, audioBuffer);

            // Générer l'URL accessible
            localAudioUrl = `/api/v1/attachments/file/translated/${filename}`;

            const source = audioBinary ? 'multipart' : 'base64';
            logger.info(`   📁 Audio sauvegardé (${source}): ${filename} (${(audioBuffer.length / 1024).toFixed(1)}KB)`);
          } catch (fileError) {
            logger.error(`   ❌ Erreur sauvegarde audio: ${fileError}`);
            // Continuer avec les chemins originaux du Translator (fallback)
          }
        }

        // Ajouter/mettre à jour la traduction dans le map avec segments (format BD)
        translationsData[translatedAudio.targetLanguage] = {
          type: 'audio',
          transcription: translatedAudio.translatedText,
          path: localAudioPath,
          url: localAudioUrl,
          durationMs: translatedAudio.durationMs,
          format: translatedAudio.audioMimeType?.replace('audio/', '') || 'mp3',
          cloned: translatedAudio.voiceCloned,
          quality: translatedAudio.voiceQuality,
          voiceModelId: data.voiceModelUserId || undefined,
          ttsModel: 'xtts',
          segments: translatedAudio.segments,  // Segments de la transcription de l'audio traduit
          createdAt: new Date(),
          updatedAt: new Date()
        };

        logger.info(`✅ Audio traduit sauvegardé: ${translatedAudio.targetLanguage} | segments=${translatedAudio.segments?.length || 0}`);
      }

      // Convertir les traductions BD vers format Socket.IO en utilisant la fonction officielle
      const savedTranslatedAudios = Object.entries(translationsData).map(([lang, translation]) =>
        toSocketIOTranslation(data.attachmentId, lang, translation)
      );

      // 4. Mettre à jour l'attachment avec transcription et translations JSON
      await this.prisma.messageAttachment.update({
        where: { id: data.attachmentId },
        data: {
          transcription: transcriptionData as any,
          translations: translationsData as any
        }
      });

      logger.info(`✅ Attachment mis à jour avec transcription et ${Object.keys(translationsData).length} traduction(s)`);

      // Log confirmation sauvegarde speakers en BDD
      if (transcriptionData.speakerCount) {
        logger.info(
          `💾 [GATEWAY] Sauvegarde BDD avec diarisation: ` +
          `${transcriptionData.speakerCount} speaker(s), ` +
          `primary=${transcriptionData.primarySpeakerId}, ` +
          `sender_identified=${transcriptionData.senderVoiceIdentified}, ` +
          `sender_speaker=${transcriptionData.senderSpeakerId}, ` +
          `segments=${transcriptionData.segments?.length || 0}`
        );
      }

      // 4. Sauvegarder le nouveau profil vocal si créé par Translator
      if (data.newVoiceProfile) {
        try {
          const nvp = data.newVoiceProfile;
          logger.info(`   📦 Sauvegarde nouveau profil vocal: ${nvp.userId}`);

          // MULTIPART: Utiliser binaire direct ou décoder base64 (fallback)
          const embeddingBuffer = nvp._embeddingBinary || (nvp.embedding ? Buffer.from(nvp.embedding, 'base64') : null);

          if (!embeddingBuffer) {
            logger.error(`   ❌ Pas d'embedding disponible pour le profil vocal`);
            throw new Error('Missing embedding data');
          }

          const source = nvp._embeddingBinary ? 'multipart' : 'base64';
          logger.info(`   📦 Embedding (${source}): ${(embeddingBuffer.length / 1024).toFixed(1)}KB`);

          // Décoder les conditionals Chatterbox si présents
          let chatterboxConditionalsBuffer: Buffer | null = null;
          if (nvp.chatterbox_conditionals_base64) {
            chatterboxConditionalsBuffer = Buffer.from(nvp.chatterbox_conditionals_base64, 'base64');
            logger.info(`   📦 Chatterbox conditionals: ${(chatterboxConditionalsBuffer.length / 1024).toFixed(1)}KB`);
          }

          // Upsert le profil vocal dans UserVoiceModel
          await this.prisma.userVoiceModel.upsert({
            where: { userId: nvp.userId },
            update: {
              profileId: nvp.profileId,
              embedding: embeddingBuffer,
              qualityScore: nvp.qualityScore,
              audioCount: nvp.audioCount,
              totalDurationMs: nvp.totalDurationMs,
              version: nvp.version,
              fingerprint: nvp.fingerprint || null,
              voiceCharacteristics: nvp.voiceCharacteristics || null,
              // Conditionals Chatterbox pour multi-speaker TTS
              chatterboxConditionals: chatterboxConditionalsBuffer,
              referenceAudioId: nvp.reference_audio_id || null,
              referenceAudioUrl: nvp.reference_audio_url || null,
              updatedAt: new Date()
            },
            create: {
              userId: nvp.userId,
              profileId: nvp.profileId,
              embedding: embeddingBuffer,
              qualityScore: nvp.qualityScore,
              audioCount: nvp.audioCount,
              totalDurationMs: nvp.totalDurationMs,
              version: nvp.version,
              fingerprint: nvp.fingerprint || null,
              voiceCharacteristics: nvp.voiceCharacteristics || null,
              // Conditionals Chatterbox pour multi-speaker TTS
              chatterboxConditionals: chatterboxConditionalsBuffer,
              referenceAudioId: nvp.reference_audio_id || null,
              referenceAudioUrl: nvp.reference_audio_url || null
            }
          });

          logger.info(`✅ Profil vocal sauvegardé: ${nvp.userId} (quality=${nvp.qualityScore.toFixed(2)})`);
        } catch (voiceProfileError) {
          logger.error(`⚠️ Erreur sauvegarde profil vocal: ${voiceProfileError}`);
          // Ne pas faire échouer le traitement principal
        }
      }

      // 5. Émettre événement pour notifier les clients (Socket.IO)
      // Utiliser savedTranslatedAudios qui contient les URLs locales accessibles
      logger.info(
        `📡 [TranslationService] Émission audioTranslationReady | ` +
        `TaskID: ${data.taskId} | Msg: ${data.messageId} | Att: ${data.attachmentId} | ` +
        `HasTranscription: ${!!data.transcription} | Audios: ${savedTranslatedAudios.length} (${savedTranslatedAudios.map(ta => ta.targetLanguage).join(', ')})`
      );

      // DEBUG: Vérifier que les URLs sont présentes dans savedTranslatedAudios
      logger.info(`🔍 [TranslationService] URLs des audios traduits envoyées via WebSocket:`);
      for (const ta of savedTranslatedAudios) {
        logger.info(`   - ${ta.targetLanguage}: url="${ta.url || '⚠️ VIDE'}", path="${ta.path || '⚠️ VIDE'}"`);
      }

      this.emit('audioTranslationReady', {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        transcription: data.transcription,
        translatedAudios: savedTranslatedAudios,
        processingTimeMs: data.processingTimeMs
      });

      const totalTime = Date.now() - startTime;
      logger.info(`   ⏱️ Persistance audio terminée en ${totalTime}ms`);

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur sauvegarde audio: ${error}`);
      this.stats.incrementErrors();
    }
  }

  /**
   * Gère les erreurs de processing audio
   */
  private async _handleAudioProcessError(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    error: string;
    errorCode: string;
  }) {
    logger.error(`❌ [TranslationService] Audio process error: ${data.attachmentId}`);
    logger.error(`   Code: ${data.errorCode}`);
    logger.error(`   Error: ${data.error}`);

    // Émettre événement d'erreur pour notifier les clients
    this.emit('audioTranslationError', {
      taskId: data.taskId,
      messageId: data.messageId,
      attachmentId: data.attachmentId,
      error: data.error,
      errorCode: data.errorCode
    });

    this.stats.incrementErrors();
  }

  // ============================================================================
  // TRANSCRIPTION ONLY HANDLERS
  // ============================================================================

  /**
   * Traite les résultats de transcription seule (sans traduction/TTS).
   * Sauvegarde la transcription dans MessageAudioTranscription.
   */
  private async _handleTranscriptionOnlyCompleted(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    transcription: {
      text: string;
      language: string;
      confidence: number;
      durationMs: number;
      source: string;
      model?: string;
      segments?: TranscriptionSegment[];
      speakerCount?: number;
      primarySpeakerId?: string;
      senderVoiceIdentified?: boolean;
      senderSpeakerId?: string | null;
      speakerAnalysis?: any;
    };
    processingTimeMs: number;
  }) {
    try {
      const startTime = Date.now();

      logger.info(
        `📝 [TranslationService] Transcription only completed: ${data.attachmentId} | ` +
        (data.transcription?.text ? `Text: "${data.transcription.text.substring(0, 50)}..." | ` : '') +
        `Lang: ${data.transcription.language}`
      );

      // 1. Récupérer les infos de l'attachment pour vérifier
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { id: true, messageId: true, duration: true }
      });

      if (!attachment) {
        logger.error(`❌ [TranslationService] Attachment non trouvé: ${data.attachmentId}`);
        return;
      }

      // 2. Construire la transcription JSON avec diarisation
      const transcriptionData: AttachmentTranscription = {
        text: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence,
        source: data.transcription.source as 'mobile' | 'whisper' | 'voice_api',
        model: 'whisper_boost',
        segments: data.transcription.segments as any,
        speakerCount: data.transcription.speakerCount,
        primarySpeakerId: data.transcription.primarySpeakerId,
        senderVoiceIdentified: data.transcription.senderVoiceIdentified,
        senderSpeakerId: data.transcription.senderSpeakerId,
        speakerAnalysis: data.transcription.speakerAnalysis,
        durationMs: data.transcription.durationMs || attachment.duration || 0
      };

      // Mettre à jour l'attachment avec la transcription
      await this.prisma.messageAttachment.update({
        where: { id: data.attachmentId },
        data: { transcription: transcriptionData as any }
      });

      logger.info(`✅ Transcription sauvegardée: ${data.transcription.language}`);

      // Log confirmation sauvegarde speakers en BDD
      if (transcriptionData.speakerCount) {
        logger.info(
          `💾 [GATEWAY] Sauvegarde BDD avec diarisation: ` +
          `${transcriptionData.speakerCount} speaker(s), ` +
          `primary=${transcriptionData.primarySpeakerId}, ` +
          `sender_identified=${transcriptionData.senderVoiceIdentified}, ` +
          `sender_speaker=${transcriptionData.senderSpeakerId}, ` +
          `segments=${transcriptionData.segments?.length || 0}`
        );
      }

      // 3. Émettre événement pour notifier les clients (Socket.IO)
      this.emit('transcriptionReady', {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        transcription: {
          id: data.attachmentId,
          text: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments,
          durationMs: data.transcription.durationMs,
          // Speaker analysis with voice characteristics
          speakerCount: data.transcription.speakerCount,
          primarySpeakerId: data.transcription.primarySpeakerId,
          senderVoiceIdentified: data.transcription.senderVoiceIdentified,
          senderSpeakerId: data.transcription.senderSpeakerId,
          speakerAnalysis: data.transcription.speakerAnalysis
        },
        processingTimeMs: data.processingTimeMs
      });

      const totalTime = Date.now() - startTime;
      logger.info(`   ⏱️ Persistance transcription terminée en ${totalTime}ms`);

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur sauvegarde transcription: ${error}`);
      this.stats.incrementErrors();
    }
  }

  /**
   * Gère les erreurs de transcription seule
   */
  private async _handleTranscriptionOnlyError(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    error: string;
    errorCode: string;
  }) {
    logger.error(`❌ [TranslationService] Transcription only error: ${data.attachmentId}`);
    logger.error(`   Code: ${data.errorCode}`);
    logger.error(`   Error: ${data.error}`);

    // Émettre événement d'erreur pour notifier les clients
    this.emit('transcriptionError', {
      taskId: data.taskId,
      messageId: data.messageId,
      attachmentId: data.attachmentId,
      error: data.error,
      errorCode: data.errorCode
    });

    this.stats.incrementErrors();
  }

  /**
   * Gère la transcription prête AVANT la traduction (architecture 2 phases).
   * Phase 1: Transcription terminée → envoyer immédiatement au client
   * Phase 2: Traduction + TTS terminés → envoyés séparément avec l'audio traduit
   */
  private async _handleTranscriptionReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    transcription: {
      text: string;
      language: string;
      confidence: number;
      durationMs: number;
      source: string;
      model?: string;
      segments?: TranscriptionSegment[];
      speakerCount?: number;
      primarySpeakerId?: string;
      senderVoiceIdentified?: boolean;
      senderSpeakerId?: string | null;
      speakerAnalysis?: any;
    };
    processingTimeMs: number;
  }) {
    try {
      const startTime = Date.now();

      logger.info(
        `🎯 [TranslationService] Transcription READY (avant traduction): ${data.attachmentId} | ` +
        (data.transcription?.text ? `Text: "${data.transcription.text.substring(0, 50)}..." | ` : '') +
        `Lang: ${data.transcription.language} | Segments: ${data.transcription.segments?.length || 0}`
      );

      // 1. Récupérer les infos de l'attachment pour vérifier
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { id: true, messageId: true, duration: true }
      });

      if (!attachment) {
        logger.error(`❌ [TranslationService] Attachment non trouvé: ${data.attachmentId}`);
        return;
      }

      // 2. Construire la transcription JSON avec diarisation
      const transcriptionData: AttachmentTranscription = {
        text: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence,
        source: data.transcription.source as 'mobile' | 'whisper' | 'voice_api',
        model: data.transcription.model || 'whisper_boost',
        segments: data.transcription.segments as any,
        speakerCount: data.transcription.speakerCount,
        primarySpeakerId: data.transcription.primarySpeakerId,
        senderVoiceIdentified: data.transcription.senderVoiceIdentified,
        senderSpeakerId: data.transcription.senderSpeakerId,
        speakerAnalysis: data.transcription.speakerAnalysis,
        durationMs: data.transcription.durationMs || attachment.duration || 0
      };

      // 3. Mettre à jour l'attachment avec la transcription
      await this.prisma.messageAttachment.update({
        where: { id: data.attachmentId },
        data: { transcription: transcriptionData as any }
      });

      logger.info(`✅ [Phase 1] Transcription sauvegardée: ${data.transcription.language} | ${transcriptionData.segments?.length || 0} segments`);

      // Log diarisation si présente
      if (transcriptionData.speakerCount) {
        logger.info(
          `💾 [GATEWAY] Transcription avec diarisation: ` +
          `${transcriptionData.speakerCount} speaker(s), ` +
          `primary=${transcriptionData.primarySpeakerId}, ` +
          `sender_identified=${transcriptionData.senderVoiceIdentified}`
        );
      }

      // 4. Émettre événement Socket.IO pour notifier les clients IMMÉDIATEMENT
      // (La traduction arrivera plus tard via audioProcessCompleted)
      this.emit('transcriptionReady', {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        transcription: {
          id: data.attachmentId,
          text: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments,
          durationMs: data.transcription.durationMs,
          // Speaker analysis with voice characteristics
          speakerCount: data.transcription.speakerCount,
          primarySpeakerId: data.transcription.primarySpeakerId,
          senderVoiceIdentified: data.transcription.senderVoiceIdentified,
          senderSpeakerId: data.transcription.senderSpeakerId,
          speakerAnalysis: data.transcription.speakerAnalysis
        },
        processingTimeMs: data.processingTimeMs,
        phase: 'transcription'  // Indique que c'est la phase 1
      });

      const totalTime = Date.now() - startTime;
      logger.info(`   ⏱️ [Phase 1] Transcription envoyée au client en ${totalTime}ms (traduction en cours...)`);

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur gestion transcription ready: ${error}`);
      this.stats.incrementErrors();
    }
  }

  /**
   * Helper générique pour gérer les événements de traduction audio.
   * Sauvegarde la traduction en DB et émet l'événement Socket.IO approprié.
   */
  private async _processTranslationEvent(
    data: {
      taskId: string;
      messageId: string;
      attachmentId: string;
      language: string;
      translatedAudio: {
        targetLanguage: string;
        translatedText: string;
        audioUrl: string;
        audioPath: string;
        durationMs: number;
        voiceCloned: boolean;
        voiceQuality: number;
        audioMimeType: string;
        segments?: TranscriptionSegment[];
      };
    },
    eventName: string,
    logPrefix: string
  ) {
    try {
      const startTime = Date.now();

      logger.info(
        `${logPrefix} [TranslationService] ${data.attachmentId} | ` +
        `Lang: ${data.language} | Segments: ${data.translatedAudio.segments?.length || 0}`
      );

      // 1. Récupérer l'attachment pour mise à jour
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { id: true, messageId: true, translations: true }
      });

      if (!attachment) {
        logger.error(`❌ [TranslationService] Attachment non trouvé: ${data.attachmentId}`);
        return;
      }

      // 2. Mettre à jour le champ translations JSON avec la nouvelle traduction
      const existingTranslations = (attachment.translations as unknown as AttachmentTranslations) || {};

      existingTranslations[data.language] = {
        type: 'audio',
        transcription: data.translatedAudio.translatedText,
        path: data.translatedAudio.audioPath,
        url: data.translatedAudio.audioUrl,
        durationMs: data.translatedAudio.durationMs,
        format: data.translatedAudio.audioMimeType?.replace('audio/', '') || 'mp3',
        cloned: data.translatedAudio.voiceCloned,
        quality: data.translatedAudio.voiceQuality,
        ttsModel: 'xtts',
        segments: data.translatedAudio.segments as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.prisma.messageAttachment.update({
        where: { id: data.attachmentId },
        data: { translations: existingTranslations as any }
      });

      logger.info(
        `✅ Traduction ${data.language} sauvegardée | ` +
        `Segments: ${data.translatedAudio.segments?.length || 0}`
      );

      // 3. Émettre événement Socket.IO pour notifier le client IMMÉDIATEMENT
      // Convertir la traduction au format Socket.IO
      const translationSocketIO = toSocketIOTranslation(
        data.attachmentId,
        data.language,
        existingTranslations[data.language]
      );

      this.emit(eventName, {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        language: data.language,
        translatedAudio: translationSocketIO,
        phase: 'translation'
      });

      const totalTime = Date.now() - startTime;
      logger.info(
        `   ⏱️ Traduction ${data.language} envoyée au client en ${totalTime}ms`
      );

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur traitement traduction: ${error}`);
      this.stats.incrementErrors();
    }
  }

  /**
   * Gère un événement de traduction audio unique (1 seule langue demandée).
   */
  private async _handleAudioTranslationReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: {
      targetLanguage: string;
      translatedText: string;
      audioUrl: string;
      audioPath: string;
      durationMs: number;
      voiceCloned: boolean;
      voiceQuality: number;
      audioMimeType: string;
      segments?: TranscriptionSegment[];
    };
  }) {
    await this._processTranslationEvent(data, 'audioTranslationReady', '🎯');
  }

  /**
   * Gère un événement de traduction progressive (multi-langues, pas la dernière).
   */
  private async _handleAudioTranslationsProgressive(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: {
      targetLanguage: string;
      translatedText: string;
      audioUrl: string;
      audioPath: string;
      durationMs: number;
      voiceCloned: boolean;
      voiceQuality: number;
      audioMimeType: string;
      segments?: TranscriptionSegment[];
    };
  }) {
    await this._processTranslationEvent(data, 'audioTranslationsProgressive', '🔄');
  }

  /**
   * Gère un événement de dernière traduction terminée (multi-langues).
   */
  private async _handleAudioTranslationsCompleted(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: {
      targetLanguage: string;
      translatedText: string;
      audioUrl: string;
      audioPath: string;
      durationMs: number;
      voiceCloned: boolean;
      voiceQuality: number;
      audioMimeType: string;
      segments?: TranscriptionSegment[];
    };
  }) {
    await this._processTranslationEvent(data, 'audioTranslationsCompleted', '✅');
  }

  /**
   * Gère un événement de traduction individuelle prête (PROGRESSIVE).
   * @deprecated Utilisez _handleAudioTranslationReady, _handleAudioTranslationsProgressive ou _handleAudioTranslationsCompleted
   */
  private async _handleTranslationReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: {
      targetLanguage: string;
      translatedText: string;
      audioUrl: string;
      audioPath: string;
      durationMs: number;
      voiceCloned: boolean;
      voiceQuality: number;
      audioMimeType: string;
      segments?: TranscriptionSegment[];
    };
  }) {
    await this._processTranslationEvent(data, 'translationReady', '🌍 [DEPRECATED]');
  }

  // ============================================================================
  // VOICE TRANSLATION JOB HANDLERS
  // ============================================================================

  /**
   * Traite les résultats de jobs de traduction vocale asynchrones.
   * Ces jobs sont créés via l'API Voice et ne sont pas nécessairement liés à un message.
   * Utilise le format unifié VoiceTranslationResult de @meeshy/shared/types/voice-api
   */
  private async _handleVoiceTranslationCompleted(data: {
    jobId: string;
    status: string;
    userId: string;
    timestamp: number;
    result?: {
      translationId: string;
      originalAudio: {
        transcription: string;
        language: string;
        durationMs: number;
        confidence: number;
        segments?: TranscriptionSegment[];  // ✅ Utiliser type partagé
        speakerCount?: number;
        primarySpeakerId?: string;
        senderVoiceIdentified?: boolean;
        senderSpeakerId?: string;
        speakerAnalysis?: any;
      };
      translations: Array<{
        targetLanguage: string;
        translatedText: string;
        audioUrl?: string;
        audioBase64?: string;
        durationMs: number;
        voiceCloned: boolean;
        voiceQuality: number;
        segments?: TranscriptionSegment[];  // Segments de la transcription de l'audio traduit
      }>;
      voiceProfile?: {
        profileId: string;
        quality: number;
        isNew: boolean;
      };
      processingTimeMs: number;
    };
  }) {
    try {
      const transcription = data.result?.originalAudio?.transcription;
      const langs = data.result?.translations?.map(t => t.targetLanguage).join(', ') || '';
      const voiceProfile = data.result?.voiceProfile;

      logger.info(
        `🎙️ [TranslationService] Voice job completed: ${data.jobId} | ` +
        `User: ${data.userId} | ` +
        (transcription ? `Original: "${transcription.substring(0, 50)}..." (${data.result.originalAudio.language}) | ` : '') +
        (langs ? `Traductions: ${data.result.translations.length} (${langs}) | ` : '') +
        (voiceProfile ? `Voice: ${voiceProfile.profileId} (quality: ${voiceProfile.quality.toFixed(2)})` : '')
      );

      // Récupérer les métadonnées du job depuis Redis
      let jobMetadata = null;
      if (this.jobMappingService) {
        jobMetadata = await this.jobMappingService.getAndDeleteJobMapping(data.jobId);
      }

      if (jobMetadata && jobMetadata.messageId && jobMetadata.attachmentId && data.result) {
        // C'est un job d'attachment - SAUVEGARDER EN BASE + diffuser au frontend
        logger.info(
          `📡 [TranslationService] Attachment job - sauvegarde + diffusion | ` +
          `Msg: ${jobMetadata.messageId} | Att: ${jobMetadata.attachmentId} | Conv: ${jobMetadata.conversationId}`
        );

        // 1. Vérifier que l'attachment existe et récupérer les traductions existantes
        const attachment = await this.prisma.messageAttachment.findUnique({
          where: { id: jobMetadata.attachmentId },
          select: { id: true, messageId: true, duration: true, translations: true }
        });

        if (!attachment) {
          logger.error(`❌ Attachment non trouvé: ${jobMetadata.attachmentId}`);
          return;
        }

        // 2. Construire la structure transcription JSON avec diarisation
        const transcriptionData: AttachmentTranscription | null = data.result.originalAudio ? {
          text: data.result.originalAudio.transcription,
          language: data.result.originalAudio.language,
          confidence: data.result.originalAudio.confidence,
          source: 'voice_api',
          model: undefined,
          segments: data.result.originalAudio.segments,  // ✅ Inclut speakerId et voiceSimilarityScore
          speakerCount: data.result.originalAudio.speakerCount,
          primarySpeakerId: data.result.originalAudio.primarySpeakerId,
          senderVoiceIdentified: data.result.originalAudio.senderVoiceIdentified,
          senderSpeakerId: data.result.originalAudio.senderSpeakerId,
          speakerAnalysis: data.result.originalAudio.speakerAnalysis,
          durationMs: data.result.originalAudio.durationMs
        } : null;

        // 3. Construire la structure translations JSON
        const existingTranslations = (attachment.translations as unknown as AttachmentTranslations) || {};
        const translationsData: AttachmentTranslations = { ...existingTranslations };

        for (const translation of data.result.translations) {
          let localAudioPath = '';
          let localAudioUrl = translation.audioUrl || '';

          // Sauvegarder le fichier audio localement si base64 fourni
          if (translation.audioBase64) {
            try {
              const translatedDir = path.resolve(process.cwd(), 'uploads/attachments/translated');
              await fs.mkdir(translatedDir, { recursive: true });

              const filename = `${jobMetadata.attachmentId}_${translation.targetLanguage}.mp3`;
              localAudioPath = path.resolve(translatedDir, filename);

              const audioBuffer = Buffer.from(translation.audioBase64, 'base64');
              await fs.writeFile(localAudioPath, audioBuffer);

              localAudioUrl = `/api/v1/attachments/file/translated/${filename}`;
              logger.info(`📁 Audio sauvegardé: ${filename} (${(audioBuffer.length / 1024).toFixed(1)}KB)`);
            } catch (fileError) {
              logger.error(`   ❌ Erreur sauvegarde audio: ${fileError}`);
            }
          }

          // Ajouter/mettre à jour la traduction dans le map avec segments (format BD)
          translationsData[translation.targetLanguage] = {
            type: 'audio',
            transcription: translation.translatedText,
            path: localAudioPath,
            url: localAudioUrl,
            durationMs: translation.durationMs,
            format: 'mp3',
            cloned: translation.voiceCloned,
            quality: translation.voiceQuality,
            voiceModelId: data.userId || undefined,
            ttsModel: 'xtts',
            segments: translation.segments,  // Segments de la transcription de l'audio traduit
            createdAt: new Date(),
            updatedAt: new Date()
          };

          logger.info(`✅ Audio traduit sauvegardé: ${translation.targetLanguage} | segments=${translation.segments?.length || 0}`);
        }

        // Convertir les traductions BD vers format Socket.IO en utilisant la fonction officielle
        const savedTranslatedAudios = Object.entries(translationsData).map(([lang, translation]) =>
          toSocketIOTranslation(jobMetadata.attachmentId, lang, translation)
        );

        // 4. Mettre à jour l'attachment avec transcription et translations JSON
        await this.prisma.messageAttachment.update({
          where: { id: jobMetadata.attachmentId },
          data: {
            transcription: transcriptionData as any,
            translations: translationsData as any
          }
        });

        logger.info(`✅ Attachment mis à jour avec transcription et ${Object.keys(translationsData).length} traduction(s)`);

        // Log confirmation sauvegarde speakers en BDD
        if (transcriptionData && transcriptionData.speakerCount) {
          logger.info(
            `💾 [GATEWAY] Sauvegarde BDD avec diarisation: ` +
            `${transcriptionData.speakerCount} speaker(s), ` +
            `primary=${transcriptionData.primarySpeakerId}, ` +
            `sender_identified=${transcriptionData.senderVoiceIdentified}, ` +
            `sender_speaker=${transcriptionData.senderSpeakerId}, ` +
            `segments=${transcriptionData.segments?.length || 0}`
          );
        }

        // 4. Émettre l'événement audioTranslationReady pour diffusion Socket.IO
        this.emit('audioTranslationReady', {
          taskId: data.jobId,
          messageId: jobMetadata.messageId,
          attachmentId: jobMetadata.attachmentId,
          transcription: data.result.originalAudio ? {
            text: data.result.originalAudio.transcription,
            language: data.result.originalAudio.language,
            confidence: data.result.originalAudio.confidence,
            durationMs: data.result.originalAudio.durationMs
          } : undefined,
          translatedAudios: savedTranslatedAudios,
          processingTimeMs: data.result.processingTimeMs
        });

        logger.info(`📡 Événement audioTranslationReady émis vers Socket.IO`);
      } else {
        // Job standalone (pas d'attachment) - juste émettre l'événement de job
        logger.info(`📋 [TranslationService] Job standalone (pas d'attachment)`);
        this.emit('voiceTranslationJobCompleted', {
          jobId: data.jobId,
          userId: data.userId,
          status: data.status,
          timestamp: data.timestamp,
          result: data.result
        });
      }

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur traitement job vocal: ${error}`);
      this.stats.incrementErrors();
    }
  }

  /**
   * Gère les échecs de jobs de traduction vocale asynchrones
   */
  private async _handleVoiceTranslationFailed(data: {
    jobId: string;
    status: string;
    userId: string;
    timestamp: number;
    error?: string;
    errorCode?: string;
  }) {
    logger.error(
      `❌ [TranslationService] Voice job failed: ${data.jobId} | ` +
      `User: ${data.userId} | Code: ${data.errorCode} | Error: ${data.error}`
    );

    // Émettre événement d'erreur pour notifier les clients
    this.emit('voiceTranslationJobFailed', {
      jobId: data.jobId,
      userId: data.userId,
      status: data.status,
      timestamp: data.timestamp,
      error: data.error,
      errorCode: data.errorCode
    });

    this.stats.incrementErrors();
  }

  // ============================================================================
  // END AUDIO ATTACHMENT HANDLERS
  // ============================================================================

  // ============================================================================
  // PUBLIC AUDIO PROCESSING API

  // ==========================================================
  // MÉTHODES PUBLIQUES AUDIO - Implémentations complètes
  // ==========================================================

  async processAudioAttachment(params: {
    messageId: string;
    attachmentId: string;
    conversationId: string;
    senderId: string;
    audioUrl: string;
    audioPath: string;
    audioDurationMs: number;
    mobileTranscription?: {
      text: string;
      language: string;
      confidence: number;
      source: string;
      segments?: Array<{ text: string; startMs: number; endMs: number }>;
    };
    generateVoiceClone?: boolean;
    modelType?: string;
    userLanguage?: string;
  }): Promise<string | null> {
    try {
      if (!this.zmqClient) {
        logger.error('[TranslationService] ZMQ Client non disponible pour le traitement audio');
        return null;
      }

      // Récupérer la langue de l'utilisateur si non fournie
      let userLanguage = params.userLanguage;
      if (!userLanguage) {
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: params.senderId },
            select: { systemLanguage: true }
          });
          userLanguage = user?.systemLanguage || undefined;
        } catch (error) {
          logger.warn(`⚠️ Impossible de récupérer la langue de l'utilisateur ${params.senderId}: ${error}`);
        }
      }

      logger.info(
        `🎤 [TranslationService] Traitement audio | ` +
        `Msg: ${params.messageId} | Att: ${params.attachmentId} | ` +
        `Sender: ${params.senderId} | Duration: ${params.audioDurationMs}ms | ` +
        `UserLang: ${userLanguage || 'N/A'}`
      );

      // ═══════════════════════════════════════════════════════════════════════════
      // VÉRIFICATION DES CONSENTEMENTS VOCAUX
      // ═══════════════════════════════════════════════════════════════════════════
      const bypassConsentCheck = process.env.BYPASS_VOICE_CONSENT_CHECK === 'true';
      logger.info(
        `🔍 [VOICE-PROFILE-TRACE] Vérification consentements | ` +
        `Sender: ${params.senderId} | GenerateClone: ${params.generateVoiceClone} | Bypass: ${bypassConsentCheck}`
      );

      let hasVoiceCloningConsent = false;
      let hasVoiceProfileConsent = false;
      let canGenerateTranslatedAudio = true;

      try {
        logger.info(`🔍 [VOICE-PROFILE-TRACE] Vérification consentements...`);

        if (bypassConsentCheck) {
          logger.warn(`🔍 [VOICE-PROFILE-TRACE] ⚠️ BYPASS activé - force consentements à TRUE`);
          hasVoiceCloningConsent = true;
          hasVoiceProfileConsent = true;
          canGenerateTranslatedAudio = true;
        } else {
          // Utilisation du ConsentValidationService pour vérifier les consentements
          const consentService = new ConsentValidationService(this.prisma);
          const consentStatus = await consentService.getConsentStatus(params.senderId);

          logger.info(`🔍 [VOICE-PROFILE-TRACE] Statut des consentements récupéré:`, {
            canTranscribeAudio: consentStatus.canTranscribeAudio,
            canTranslateAudio: consentStatus.canTranslateAudio,
            canGenerateTranslatedAudio: consentStatus.canGenerateTranslatedAudio,
            canUseVoiceCloning: consentStatus.canUseVoiceCloning
          });

          // Vérifier que l'utilisateur a les consentements de base pour le traitement audio
          if (!consentStatus.canTranscribeAudio) {
            logger.error(`❌ User ${params.senderId} lacks voice data consent for audio transcription`);
            logger.error(`   Required: dataProcessingConsentAt + voiceDataConsentAt + audioTranscriptionEnabledAt`);
            return null;
          }

          if (!consentStatus.canTranslateAudio) {
            logger.warn(`⚠️ User ${params.senderId} lacks consent for audio translation`);
            logger.warn(`   Required: audioTranslationEnabledAt + audioTranscriptionEnabledAt + textTranslationEnabledAt`);
          }

          // Définir les consentements pour le profil vocal et le clonage
          hasVoiceProfileConsent = consentStatus.hasVoiceDataConsent;
          hasVoiceCloningConsent = consentStatus.canUseVoiceCloning;
          canGenerateTranslatedAudio = consentStatus.canGenerateTranslatedAudio;

          if (!canGenerateTranslatedAudio) {
            logger.warn(`⚠️ User ${params.senderId} lacks consent for translated audio generation`);
            logger.warn(`   Required: translatedAudioGenerationEnabledAt + audioTranslationEnabledAt`);
            logger.warn(`   → Audio sera transcrit mais pas traduit en fichiers audio`);
          }
        }

        logger.info(
          `🔍 [VOICE-PROFILE-TRACE] Consentements finaux: ` +
          `voiceProfile=${hasVoiceProfileConsent} | voiceCloning=${hasVoiceCloningConsent}`
        );

      } catch (consentError) {
        logger.error(`🔍 [VOICE-PROFILE-TRACE] ❌ ERREUR vérification consentements: ${consentError}`);
        logger.error(`🔍 [VOICE-PROFILE-TRACE] Stack: ${consentError instanceof Error ? consentError.stack : 'N/A'}`);
        // En cas d'erreur, on continue sans clonage vocal par sécurité
        if (bypassConsentCheck) {
          hasVoiceCloningConsent = true;
          hasVoiceProfileConsent = true;
        } else {
          // Par sécurité, désactiver le clonage vocal en cas d'erreur
          hasVoiceCloningConsent = false;
          hasVoiceProfileConsent = false;
        }
      }

      // Déterminer si on génère le clonage vocal
      const shouldGenerateVoiceClone = (params.generateVoiceClone ?? true) && hasVoiceCloningConsent;

      if (!shouldGenerateVoiceClone && (params.generateVoiceClone ?? true)) {
        logger.info(`   ℹ️ Clonage vocal désactivé (pas de consentement)`);
      }

      // 1. Récupérer les langues cibles de la conversation
      let targetLanguages = await this._extractConversationLanguages(params.conversationId);

      if (targetLanguages.length === 0) {
        logger.warn(`[TranslationService] Aucune langue cible pour la conversation ${params.conversationId}`);
        // Fallback: utiliser en + fr
        targetLanguages.push('en', 'fr');
      }

      logger.info(`🌍 Target languages (extracted): [${targetLanguages.join(', ')}]`);

      // Si l'utilisateur n'a pas le consentement pour générer des audios traduits,
      // on vide le tableau targetLanguages pour que seule la transcription soit faite
      if (!canGenerateTranslatedAudio) {
        logger.warn(`⚠️ Génération d'audios traduits désactivée (pas de consentement) - transcription uniquement`);
        targetLanguages = [];
      }

      logger.info(`🌍 Target languages (final): [${targetLanguages.join(', ')}]`);

      // 2. Récupérer le profil vocal existant de l'utilisateur (si disponible)
      let existingVoiceProfile: any = null;
      try {
        const voiceModel = await this.prisma.userVoiceModel.findUnique({
          where: { userId: params.senderId },
          select: {
            userId: true,
            profileId: true,
            embedding: true,
            qualityScore: true,
            fingerprint: true,
            voiceCharacteristics: true,
            version: true,
            audioCount: true,
            totalDurationMs: true,
            // Conditionals Chatterbox pour multi-speaker TTS
            chatterboxConditionals: true,
            referenceAudioId: true,
            referenceAudioUrl: true
          }
        });

        if (voiceModel && voiceModel.embedding) {
          existingVoiceProfile = {
            profileId: voiceModel.profileId,
            userId: voiceModel.userId,
            embedding: Buffer.from(voiceModel.embedding).toString('base64'),
            qualityScore: voiceModel.qualityScore,
            fingerprint: voiceModel.fingerprint as Record<string, any> || undefined,
            voiceCharacteristics: voiceModel.voiceCharacteristics as Record<string, any> || undefined,
            version: voiceModel.version,
            audioCount: voiceModel.audioCount,
            totalDurationMs: voiceModel.totalDurationMs
          };

          // Ajouter les conditionals Chatterbox si présents
          if (voiceModel.chatterboxConditionals) {
            existingVoiceProfile.chatterbox_conditionals_base64 =
              Buffer.from(voiceModel.chatterboxConditionals).toString('base64');
          }
          if (voiceModel.referenceAudioId) {
            existingVoiceProfile.reference_audio_id = voiceModel.referenceAudioId;
          }
          if (voiceModel.referenceAudioUrl) {
            existingVoiceProfile.reference_audio_url = voiceModel.referenceAudioUrl;
          }

          logger.info(`   🎙️ Existing voice profile found (quality: ${voiceModel.qualityScore})`);
          if (voiceModel.chatterboxConditionals) {
            logger.info(`   📦 With Chatterbox conditionals: ${(voiceModel.chatterboxConditionals.length / 1024).toFixed(1)}KB`);
          }
        }
      } catch (profileError) {
        logger.debug(`   ℹ️ No existing voice profile for user ${params.senderId}`);
      }

      logger.info(
        `🔍 [VOICE-PROFILE-TRACE] Envoi requête Translator | ` +
        `Msg: ${params.messageId} | Att: ${params.attachmentId} | Conv: ${params.conversationId} | ` +
        `Sender: ${params.senderId} | Duration: ${params.audioDurationMs}ms | ` +
        `Langs: [${targetLanguages.join(', ')}] | Clone: ${shouldGenerateVoiceClone} | ` +
        `Model: ${params.modelType || 'medium'} | ExistingProfile: ${existingVoiceProfile ? 'OUI' : 'NON'}`
      );

      if (existingVoiceProfile) {
        logger.info(
          `🔍 [VOICE-PROFILE-TRACE] Profil existant: ${existingVoiceProfile.profileId} | ` +
          `User: ${existingVoiceProfile.userId} | Quality: ${existingVoiceProfile.qualityScore} | ` +
          `Embedding: ${existingVoiceProfile.embedding?.length || 0} chars`
        );
      }

      // 3. Envoyer la requête au Translator (multipart binaire, pas d'URL)
      // Note: On n'envoie le profil vocal que si le clonage est autorisé
      const taskId = await this.zmqClient.sendAudioProcessRequest({
        messageId: params.messageId,
        attachmentId: params.attachmentId,
        conversationId: params.conversationId,
        senderId: params.senderId,
        audioPath: params.audioPath,  // Le fichier sera chargé et envoyé en binaire
        audioDurationMs: params.audioDurationMs,
        mobileTranscription: params.mobileTranscription,
        targetLanguages: targetLanguages,
        generateVoiceClone: shouldGenerateVoiceClone,
        modelType: params.modelType || 'medium',
        originalSenderId: params.senderId,
        existingVoiceProfile: shouldGenerateVoiceClone ? existingVoiceProfile : undefined,
        useOriginalVoice: shouldGenerateVoiceClone,
        userLanguage: userLanguage  // Langue de l'utilisateur pour fallback sur messages courts
      });

      logger.info(`🔍 [VOICE-PROFILE-TRACE] ✅ Requête envoyée avec succès`);
      logger.info(`🔍 [VOICE-PROFILE-TRACE] Task ID: ${taskId}`);
      logger.info(`🔍 [VOICE-PROFILE-TRACE] ======== FIN ENVOI REQUÊTE ========`);
      this.stats.incrementRequestsSent();

      return taskId;

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur traitement audio: ${error}`);
      this.stats.incrementErrors();
      return null;
    }
  }

  /**
   * Transcrit un attachement audio (sans traduction ni TTS).
   * Récupère l'attachement, déclenche la transcription et retourne le taskId.
   *
   * @param attachmentId ID de l'attachement à transcrire
   * @returns Promise avec les données de transcription ou null si erreur
   */
  async transcribeAttachment(attachmentId: string): Promise<{
    taskId: string;
    attachment: {
      id: string;
      messageId: string;
      fileName: string;
      fileUrl: string;
      duration: number | null;
      mimeType: string;
    };
  } | null> {
    try {
      logger.info(`🔍 [GATEWAY-TRACE] ======== DÉBUT TRANSCRIPTION ========`);
      logger.info(`🔍 [GATEWAY-TRACE] Attachment ID: ${attachmentId}`);

      if (!this.zmqClient) {
        logger.error('[GATEWAY-TRACE] ❌ ZMQ Client non disponible pour la transcription');
        return null;
      }

      logger.info(`🔍 [GATEWAY-TRACE] Étape 1: Récupération attachment depuis BDD...`);

      // 1. Récupérer l'attachement depuis la BDD
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          fileName: true,
          fileUrl: true,
          duration: true,
          mimeType: true,
          // Récupérer le chemin du fichier pour le traitement
          metadata: true
        }
      });

      if (!attachment) {
        logger.error(`🔍 [GATEWAY-TRACE] ❌ Attachment non trouvé: ${attachmentId}`);
        return null;
      }

      logger.info(
        `🔍 [GATEWAY-TRACE] Attachment récupéré: ${attachment.id} | ` +
        `Msg: ${attachment.messageId} | File: ${attachment.fileName} | ` +
        `MIME: ${attachment.mimeType} | Duration: ${attachment.duration}ms`
      );

      // Vérifier que c'est un fichier audio
      if (!attachment.mimeType.startsWith('audio/')) {
        logger.error(`🔍 [GATEWAY-TRACE] ❌ Pas un fichier audio: ${attachment.mimeType}`);
        return null;
      }

      logger.info(`🔍 [GATEWAY-TRACE] Étape 2: Construction du chemin audio absolu...`);

      // 2. Construire le chemin ABSOLU du fichier audio
      // Le fileUrl est de la forme /api/v1/attachments/file/2026%2F01%2F.../audio.m4a (URL-encoded)
      // On doit extraire le chemin relatif, le décoder, et le convertir en chemin absolu
      const relativePath = `uploads/attachments${decodeURIComponent(attachment.fileUrl.replace('/api/v1/attachments/file', ''))}`;
      const audioPath = path.resolve(process.cwd(), relativePath);

      const fileExists = require('fs').existsSync(audioPath);
      const fileSize = fileExists ? require('fs').statSync(audioPath).size : 0;

      logger.info(
        `🔍 [GATEWAY-TRACE] Chemins: ${audioPath} | ` +
        `Exists: ${fileExists}${fileExists ? ` | Size: ${(fileSize / 1024).toFixed(2)} KB` : ''}`
      );

      if (!fileExists) {
        logger.error(`🔍 [GATEWAY-TRACE] ❌ FICHIER AUDIO INTROUVABLE: ${audioPath}`);
      }

      logger.info(`🔍 [GATEWAY-TRACE] Étape 3: Envoi requête ZMQ vers Translator...`);

      // 3. Envoyer la requête de transcription au Translator (multipart binaire)
      const taskId = await this.zmqClient.sendTranscriptionOnlyRequest({
        messageId: attachment.messageId,
        attachmentId: attachment.id,
        audioPath: audioPath
      });

      logger.info(`🔍 [GATEWAY-TRACE] ✅ Requête ZMQ envoyée avec succès`);
      logger.info(`🔍 [GATEWAY-TRACE] Task ID: ${taskId}`);
      this.stats.incrementRequestsSent();

      logger.info(`🔍 [GATEWAY-TRACE] ======== FIN TRANSCRIPTION (requête envoyée) ========`);

      return {
        taskId,
        attachment: {
          id: attachment.id,
          messageId: attachment.messageId,
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          duration: attachment.duration,
          mimeType: attachment.mimeType
        }
      };

    } catch (error) {
      logger.error(`🔍 [GATEWAY-TRACE] ❌ ERREUR TRANSCRIPTION: ${error}`);
      logger.error(`🔍 [GATEWAY-TRACE] Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
      this.stats.incrementErrors();
      return null;
    }
  }

  /**
   * Récupère un attachement avec sa transcription et ses traductions audio.
   *
   * @param attachmentId ID de l'attachement
   * @returns Attachement enrichi avec transcription et traductions
   */
  async getAttachmentWithTranscription(attachmentId: string): Promise<{
    attachment: any;
    transcription: any | null;
    translatedAudios: any[];
  } | null> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          fileName: true,
          originalName: true,
          fileUrl: true,
          mimeType: true,
          fileSize: true,
          duration: true,
          bitrate: true,
          sampleRate: true,
          codec: true,
          channels: true,
          createdAt: true,
          transcription: true,
          translations: true
        }
      });

      if (!attachment) {
        return null;
      }

      // Convertir transcription JSON → ancien format
      const transcriptionData = attachment.transcription as unknown as AttachmentTranscription | null;
      const transcription = transcriptionData ? {
        id: attachmentId,
        text: transcriptionData.text,
        language: transcriptionData.language,
        confidence: transcriptionData.confidence,
        source: transcriptionData.source,
        segments: transcriptionData.segments,
        durationMs: transcriptionData.durationMs,
        createdAt: attachment.createdAt
      } : null;

      // Convertir translations JSON → ancien format
      const translationsData = attachment.translations as unknown as AttachmentTranslations | undefined;
      const translatedAudios = translationsData ? Object.entries(translationsData).map(([lang, t]) => ({
        id: `${attachmentId}_${lang}`,
        targetLanguage: lang,
        translatedText: t.transcription,
        audioUrl: t.url || '',
        audioPath: t.path || '',
        durationMs: t.durationMs || 0,
        format: t.format || 'mp3',
        voiceCloned: t.cloned || false,
        voiceQuality: t.quality || 0,
        createdAt: typeof t.createdAt === 'string' ? new Date(t.createdAt) : t.createdAt
      })) : [];

      return {
        attachment: {
          id: attachment.id,
          messageId: attachment.messageId,
          fileName: attachment.fileName,
          originalName: attachment.originalName,
          fileUrl: attachment.fileUrl,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          duration: attachment.duration,
          bitrate: attachment.bitrate,
          sampleRate: attachment.sampleRate,
          codec: attachment.codec,
          channels: attachment.channels,
          createdAt: attachment.createdAt
        },
        transcription,
        translatedAudios
      };

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur get attachment: ${error}`);
      return null;
    }
  }

  /**
   * Traduit un attachement audio (transcription + traduction + TTS).
   * Récupère l'attachement, déclenche le traitement complet et retourne le taskId.
   *
   * @param attachmentId ID de l'attachement à traduire
   * @param options Options de traduction
   * @returns Promise avec les données de traduction ou null si erreur
   */
  async translateAttachment(
    attachmentId: string,
    options: {
      targetLanguages?: string[];
      generateVoiceClone?: boolean;
      modelType?: string;
    } = {}
  ): Promise<{
    taskId: string;
    attachment: {
      id: string;
      messageId: string;
      fileName: string;
      fileUrl: string;
      duration: number | null;
      mimeType: string;
    };
  } | null> {
    try {
      if (!this.zmqClient) {
        logger.error('[TranslationService] ZMQ Client non disponible pour la traduction');
        return null;
      }

      // 1. Récupérer l'attachement avec ses relations
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          fileName: true,
          fileUrl: true,
          duration: true,
          mimeType: true,
          uploadedBy: true,
          message: {
            select: {
              conversationId: true,
              senderId: true
            }
          }
        }
      });

      if (!attachment) {
        logger.error(`[TranslationService] Attachment non trouvé: ${attachmentId}`);
        return null;
      }

      // Vérifier que c'est un fichier audio
      if (!attachment.mimeType?.startsWith('audio/')) {
        logger.error(`[TranslationService] Attachment n'est pas un audio: ${attachment.mimeType}`);
        return null;
      }

      logger.info(
        `🎤 [TranslationService] Traduction attachment: ${attachmentId} | ` +
        `File: ${attachment.fileName} | Duration: ${attachment.duration}ms`
      );

      // 2. Construire le chemin ABSOLU du fichier audio (décoder l'URL encodée)
      const relativePath = `uploads/attachments${decodeURIComponent(attachment.fileUrl.replace('/api/v1/attachments/file', ''))}`;
      const audioPath = path.resolve(process.cwd(), relativePath);

      // 3. Déterminer les langues cibles
      let targetLanguages = options.targetLanguages;
      if (!targetLanguages || targetLanguages.length === 0) {
        // Récupérer les langues de la conversation
        targetLanguages = await this._extractConversationLanguages(attachment.message.conversationId);
      }

      if (!targetLanguages || targetLanguages.length === 0) {
        logger.warn(`[TranslationService] Aucune langue cible pour la traduction`);
        targetLanguages = ['en']; // Fallback à l'anglais
      }

      // 4. Appeler processAudioAttachment avec toutes les infos
      const taskId = await this.processAudioAttachment({
        messageId: attachment.messageId,
        attachmentId: attachment.id,
        conversationId: attachment.message.conversationId,
        senderId: attachment.message.senderId,
        audioUrl: attachment.fileUrl,
        audioPath: audioPath,
        audioDurationMs: attachment.duration || 0,
        generateVoiceClone: options.generateVoiceClone ?? false,
        modelType: options.modelType || 'medium'
      });

      if (!taskId) {
        logger.error(`[TranslationService] Échec du lancement de la traduction`);
        return null;
      }

      logger.info(`✅ Translation request sent: taskId=${taskId}`);

      return {
        taskId,
        attachment: {
          id: attachment.id,
          messageId: attachment.messageId,
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          duration: attachment.duration,
          mimeType: attachment.mimeType
        }
      };

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur traduction attachment: ${error}`);
      return null;
    }
  }

  // ============================================================================
  // END PUBLIC AUDIO PROCESSING API
  // ============================================================================

  /**
   * @deprecated Use translationCache.set instead
   */
  private _addToCache(key: string, result: TranslationResult) {
    this.translationCache.set(key, result);
  }


  /**
   * Incrémente le compteur de traductions pour l'utilisateur qui a envoyé le message
   */
  private async _incrementUserTranslationStats(messageId: string) {
    try {
      // Récupérer le message pour obtenir l'ID de l'utilisateur
      const message = await this.prisma.message.findFirst({
        where: { id: messageId },
        select: { senderId: true }
      });
      
      if (message && message.senderId) {
        // Incrémenter le compteur de traductions utilisées
        await this.prisma.userStats.upsert({
          where: { userId: message.senderId },
          update: {
            translationsUsed: {
              increment: 1
            }
          },
          create: {
            userId: message.senderId,
            translationsUsed: 1
          }
        });
        
      }
    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur lors de l'incrémentation des stats: ${error}`);
    }
  }

  /**
   * Extrait les informations techniques du champ translationModel
   * Format: "modelType|workerId|poolType|translationTime|queueTime|memoryUsage|cpuUsage"
   */


  /**
   * OPTIMISATION: Sauvegarde une traduction avec upsert simple
   * Au lieu de findMany + deleteMany + update/create (3-5 requêtes),
   * on utilise directement upsert (1 requête)
   *
   * SECURITY: Encrypts translation content for server/hybrid mode conversations
   * using the same encryption key as the parent message
   */
  private async _saveTranslationToDatabase(result: TranslationResult, metadata?: any): Promise<string> {
    try {
      const startTime = Date.now();

      // Extraire les informations techniques du modèle
      const modelInfo = result.translatorModel || result.modelType || 'basic';
      const confidenceScore = result.confidenceScore || 0.9;

      // SECURITY: Check if translation should be encrypted
      const { shouldEncrypt, conversationId } = await this._shouldEncryptTranslation(result.messageId);

      let contentToStore = result.translatedText;
      let encryptionData: TranslationEncryptionData = {
        isEncrypted: false,
        encryptionKeyId: null,
        encryptionIv: null,
        encryptionAuthTag: null
      };

      if (shouldEncrypt && conversationId) {
        const encrypted = await this._encryptTranslation(result.translatedText, conversationId);
        contentToStore = encrypted.encryptedContent;
        encryptionData = {
          isEncrypted: encrypted.isEncrypted,
          encryptionKeyId: encrypted.encryptionKeyId,
          encryptionIv: encrypted.encryptionIv,
          encryptionAuthTag: encrypted.encryptionAuthTag
        };
        logger.debug('Translation encrypted before storage', {
          messageId: result.messageId,
          targetLanguage: result.targetLanguage,
          isEncrypted: encryptionData.isEncrypted
        });
      }

      // OPTIMISATION: Nettoyer les doublons existants d'abord (si présents)
      // Ceci évite les conflits de contrainte unique
      const duplicates = await this.prisma.messageTranslation.findMany({
        where: {
          messageId: result.messageId,
          targetLanguage: result.targetLanguage
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });

      // S'il y a plusieurs traductions, supprimer toutes sauf la plus récente
      if (duplicates.length > 1) {
        const idsToDelete = duplicates.slice(1).map(d => d.id);
        await this.prisma.messageTranslation.deleteMany({
          where: {
            id: { in: idsToDelete }
          }
        });
      }

      // OPTIMISATION: Utiliser upsert avec une clé unique composée
      // Note: Ceci requiert une contrainte unique sur (messageId, targetLanguage) dans le schema
      const translation = await this.prisma.messageTranslation.upsert({
        where: {
          // Utiliser la contrainte unique composée si disponible
          messageId_targetLanguage: {
            messageId: result.messageId,
            targetLanguage: result.targetLanguage
          }
        },
        update: {
          translatedContent: contentToStore,
          translationModel: modelInfo,
          confidenceScore: confidenceScore,
          // Encryption fields
          isEncrypted: encryptionData.isEncrypted,
          encryptionKeyId: encryptionData.encryptionKeyId,
          encryptionIv: encryptionData.encryptionIv,
          encryptionAuthTag: encryptionData.encryptionAuthTag
        },
        create: {
          messageId: result.messageId,
          targetLanguage: result.targetLanguage,
          translatedContent: contentToStore,
          translationModel: modelInfo,
          confidenceScore: confidenceScore,
          // Encryption fields
          isEncrypted: encryptionData.isEncrypted,
          encryptionKeyId: encryptionData.encryptionKeyId,
          encryptionIv: encryptionData.encryptionIv,
          encryptionAuthTag: encryptionData.encryptionAuthTag
        }
      });

      const queryTime = Date.now() - startTime;

      return translation.id;

    } catch (error: any) {
      logger.error(`❌ [TranslationService] Erreur sauvegarde traduction: ${error.message}`);

      // Fallback: Si l'erreur est due à une contrainte manquante, utiliser l'ancienne méthode
      if (error.code === 'P2025' || error.message?.includes('messageId_targetLanguage')) {
        logger.warn(`⚠️ [TranslationService] Contrainte unique manquante, fallback vers méthode legacy`);
        return await this._saveTranslationToDatabase_Legacy(result, metadata);
      }

      throw error; // Remonter l'erreur pour la gestion dans _handleTranslationCompleted
    }
  }

  /**
   * Méthode legacy de sauvegarde (fallback si upsert échoue)
   * SECURITY: Also supports encrypted translation storage
   */
  private async _saveTranslationToDatabase_Legacy(result: TranslationResult, metadata?: any): Promise<string> {
    try {
      const modelInfo = result.translatorModel || result.modelType || 'basic';
      const confidenceScore = result.confidenceScore || 0.9;

      // SECURITY: Check if translation should be encrypted
      const { shouldEncrypt, conversationId } = await this._shouldEncryptTranslation(result.messageId);

      let contentToStore = result.translatedText;
      let encryptionData: TranslationEncryptionData = {
        isEncrypted: false,
        encryptionKeyId: null,
        encryptionIv: null,
        encryptionAuthTag: null
      };

      if (shouldEncrypt && conversationId) {
        const encrypted = await this._encryptTranslation(result.translatedText, conversationId);
        contentToStore = encrypted.encryptedContent;
        encryptionData = {
          isEncrypted: encrypted.isEncrypted,
          encryptionKeyId: encrypted.encryptionKeyId,
          encryptionIv: encrypted.encryptionIv,
          encryptionAuthTag: encrypted.encryptionAuthTag
        };
      }

      // Chercher une traduction existante
      const existing = await this.prisma.messageTranslation.findFirst({
        where: {
          messageId: result.messageId,
          targetLanguage: result.targetLanguage
        }
      });

      if (existing) {
        // Mettre à jour
        const updated = await this.prisma.messageTranslation.update({
          where: { id: existing.id },
          data: {
            translatedContent: contentToStore,
            translationModel: modelInfo,
            confidenceScore: confidenceScore,
            // Encryption fields
            isEncrypted: encryptionData.isEncrypted,
            encryptionKeyId: encryptionData.encryptionKeyId,
            encryptionIv: encryptionData.encryptionIv,
            encryptionAuthTag: encryptionData.encryptionAuthTag
          }
        });
        return updated.id;
      } else {
        // Créer
        const created = await this.prisma.messageTranslation.create({
          data: {
            messageId: result.messageId,
            targetLanguage: result.targetLanguage,
            translatedContent: contentToStore,
            translationModel: modelInfo,
            confidenceScore: confidenceScore,
            // Encryption fields
            isEncrypted: encryptionData.isEncrypted,
            encryptionKeyId: encryptionData.encryptionKeyId,
            encryptionIv: encryptionData.encryptionIv,
            encryptionAuthTag: encryptionData.encryptionAuthTag
          }
        });
        return created.id;
      }
    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur legacy: ${error}`);
      throw error;
    }
  }


  /**
   * Get a translation from cache or database
   * SECURITY: Automatically decrypts encrypted translations
   */
  async getTranslation(messageId: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult | null> {
    try {
      // Vérifier d'abord le cache mémoire
      const cacheKey = TranslationCache.generateKey(messageId, targetLanguage, sourceLanguage);
      const cachedResult = this.translationCache.get(cacheKey);

      if (cachedResult) {
        return cachedResult;
      }

      // Si pas en cache, chercher dans la base de données
      // Include message relation to get sourceLanguage
      const dbTranslation = await this.prisma.messageTranslation.findFirst({
        where: {
          messageId: messageId,
          targetLanguage: targetLanguage
        },
        include: {
          message: {
            select: { originalLanguage: true }
          }
        }
      });

      if (dbTranslation) {
        // SECURITY: Decrypt translation if encrypted
        let translatedText = dbTranslation.translatedContent;

        if (dbTranslation.isEncrypted &&
            dbTranslation.encryptionKeyId &&
            dbTranslation.encryptionIv &&
            dbTranslation.encryptionAuthTag) {
          try {
            translatedText = await this._decryptTranslation(
              dbTranslation.translatedContent,
              dbTranslation.encryptionKeyId,
              dbTranslation.encryptionIv,
              dbTranslation.encryptionAuthTag
            );
            logger.debug('Translation decrypted successfully', {
              messageId,
              targetLanguage
            });
          } catch (decryptError) {
            logger.error('Failed to decrypt translation, returning encrypted content', {
              messageId,
              targetLanguage,
              error: decryptError
            });
            // Return null if decryption fails for security
            return null;
          }
        }

        // Convertir la traduction de la base en format TranslationResult
        // sourceLanguage is derived from message.originalLanguage
        const result: TranslationResult = {
          messageId: dbTranslation.messageId,
          sourceLanguage: dbTranslation.message.originalLanguage,
          targetLanguage: dbTranslation.targetLanguage,
          translatedText: translatedText,
          translatorModel: dbTranslation.translationModel,
          confidenceScore: dbTranslation.confidenceScore || 0.9,
          processingTime: 0, // Pas disponible depuis la base
          modelType: dbTranslation.translationModel || 'basic'
        };

        // Mettre en cache pour les prochaines requêtes
        this._addToCache(cacheKey, result);

        return result;
      }

      return null;

    } catch (error) {
      logger.error(`❌ Erreur récupération traduction: ${error}`);
      return null;
    }
  }

  /**
   * Méthode pour les requêtes REST de traduction directe
   */
  async translateTextDirectly(
    text: string, 
    sourceLanguage: string, 
    targetLanguage: string, 
    modelType: string = 'basic'
  ): Promise<TranslationResult> {
    try {
      
      // Créer une requête de traduction
      const request: TranslationRequest = {
        messageId: `rest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: text,
        sourceLanguage: sourceLanguage,
        targetLanguages: [targetLanguage],
        conversationId: 'rest-request',
        modelType: modelType
      };
      
      // Envoyer la requête et attendre la réponse
      const taskId = await this.zmqClient.sendTranslationRequest(request);
      this.stats.incrementRequestsSent();
      
      
      // Attendre la réponse via un événement
      const response = await new Promise<TranslationResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for translation response'));
        }, 10000); // 10 secondes de timeout

        const handleResponse = (data: any) => {
          if (data.taskId === taskId) {
            clearTimeout(timeout);
            this.zmqClient.removeListener('translationCompleted', handleResponse);
            this.zmqClient.removeListener('translationError', handleError);
            
            
            resolve(data.result);
          }
        };

        const handleError = (data: any) => {
          if (data.taskId === taskId) {
            clearTimeout(timeout);
            this.zmqClient.removeListener('translationCompleted', handleResponse);
            this.zmqClient.removeListener('translationError', handleError);
            reject(new Error(`Translation error: ${data.error}`));
          }
        };

        this.zmqClient.on('translationCompleted', handleResponse);
        this.zmqClient.on('translationError', handleError);
      });

      return response;
      
    } catch (error) {
      logger.error(`❌ [REST] Erreur traduction directe: ${error}`);
      this.stats.incrementErrors();
      
      // Fallback en cas d'erreur
      return {
        messageId: `fallback_${Date.now()}`,
        translatedText: `[${targetLanguage.toUpperCase()}] ${text}`,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        confidenceScore: 0.1,
        processingTime: 0.001,
        modelType: 'fallback'
      };
    }
  }

}

// Ré-exports pour compatibilité avec les tests
export type { TranslationServiceStats } from './TranslationStats';
