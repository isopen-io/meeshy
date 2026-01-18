/**
 * Service de traduction haute performance pour Meeshy
 * Utilise l'architecture ZMQ PUB/SUB + REQ/REP avec pool de connexions
 *
 * SECURITY: Translations are encrypted for server/hybrid mode conversations
 * to prevent plaintext exposure in the database.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import { promises as fs } from 'fs';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { ZMQTranslationClient, TranslationRequest, TranslationResult } from './ZmqTranslationClient';
import { ZMQSingleton } from './ZmqSingleton';
import * as crypto from 'crypto';
import { enhancedLogger } from '../utils/logger-enhanced';

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
  targetLanguage?: string; // Langue cible spécifique pour la traduction
  // Encryption fields from parent message
  isEncrypted?: boolean;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid' | null;
}

/**
 * Encryption metadata for translated content
 */
interface TranslationEncryptionData {
  isEncrypted: boolean;
  encryptionKeyId: string | null;
  encryptionIv: string | null;
  encryptionAuthTag: string | null;
}

export interface TranslationServiceStats {
  messages_saved: number;
  translation_requests_sent: number;
  translations_received: number;
  errors: number;
  pool_full_rejections: number;
  avg_processing_time: number;
  uptime_seconds: number;
  memory_usage_mb: number;
}

export class MessageTranslationService extends EventEmitter {
  private prisma: PrismaClient;
  private zmqClient: ZMQTranslationClient | null = null;
  private startTime: number = Date.now();
  private isInitialized: boolean = false; // Flag pour éviter la double initialisation
  
  // Cache mémoire pour les résultats récents
  private memoryCache: Map<string, TranslationResult> = new Map();
  private readonly CACHE_SIZE = 1000;
  
  // OPTIMISATION: Cache des langues par conversation (TTL 5 minutes)
  private conversationLanguagesCache: Map<string, { languages: string[], timestamp: number }> = new Map();
  private readonly LANGUAGES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Statistiques
  private stats: TranslationServiceStats = {
    messages_saved: 0,
    translation_requests_sent: 0,
    translations_received: 0,
    errors: 0,
    pool_full_rejections: 0,
    avg_processing_time: 0,
    uptime_seconds: 0,
    memory_usage_mb: 0
  };

  private processedMessages = new Set<string>();
  private processedTasks = new Set<string>();

  constructor(prisma: PrismaClient) {
    super(); // Appel au constructeur EventEmitter
    this.prisma = prisma;
  }

  /**
   * Expose le client ZMQ pour permettre la création du VoiceAPIService
   */
  getZmqClient(): ZMQTranslationClient | null {
    return this.zmqClient;
  }

  // ============================================================================
  // ENCRYPTION HELPERS FOR TRANSLATION STORAGE
  // ============================================================================

  /**
   * Get the encryption key for a conversation from ServerEncryptionKey table
   * Returns the decrypted key for use in translation encryption
   * OPTIMIZED: Uses Prisma relation to fetch in a single query (JOIN)
   */
  private async _getConversationEncryptionKey(conversationId: string): Promise<{ keyId: string; key: Buffer } | null> {
    try {
      // OPTIMIZED: Single query with include instead of 2 sequential queries
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          serverEncryptionKeyId: true,
          encryptionMode: true,
          serverEncryptionKey: true // JOIN via Prisma relation
        }
      });

      if (!conversation?.serverEncryptionKeyId || !conversation.serverEncryptionKey) {
        return null;
      }

      const keyRecord = conversation.serverEncryptionKey;

      // Decrypt the key using master key
      const masterKeyB64 = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKeyB64) {
        logger.warn('ENCRYPTION_MASTER_KEY not set, cannot decrypt conversation key');
        return null;
      }

      const masterKey = Buffer.from(masterKeyB64, 'base64');
      const encryptedKey = Buffer.from(keyRecord.encryptedKey, 'base64');
      const iv = Buffer.from(keyRecord.iv, 'base64');
      const authTag = Buffer.from(keyRecord.authTag, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
      decipher.setAuthTag(authTag);
      const key = Buffer.concat([decipher.update(encryptedKey), decipher.final()]);

      return { keyId: conversation.serverEncryptionKeyId, key };
    } catch (error) {
      logger.error('Failed to get conversation encryption key', { conversationId, error });
      return null;
    }
  }

  /**
   * Encrypt translation content using conversation's encryption key
   */
  private async _encryptTranslation(
    plaintext: string,
    conversationId: string
  ): Promise<TranslationEncryptionData & { encryptedContent: string }> {
    const keyData = await this._getConversationEncryptionKey(conversationId);

    if (!keyData) {
      // No encryption key available, store unencrypted
      return {
        encryptedContent: plaintext,
        isEncrypted: false,
        encryptionKeyId: null,
        encryptionIv: null,
        encryptionAuthTag: null
      };
    }

    // Generate IV (12 bytes for AES-GCM)
    const iv = crypto.randomBytes(12);

    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', keyData.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    logger.debug('Translation encrypted', { conversationId, keyId: keyData.keyId });

    return {
      encryptedContent: ciphertext.toString('base64'),
      isEncrypted: true,
      encryptionKeyId: keyData.keyId,
      encryptionIv: iv.toString('base64'),
      encryptionAuthTag: authTag.toString('base64')
    };
  }

  /**
   * Decrypt translation content
   */
  private async _decryptTranslation(
    encryptedContent: string,
    encryptionKeyId: string,
    encryptionIv: string,
    encryptionAuthTag: string
  ): Promise<string> {
    try {
      // Get the encryption key
      const keyRecord = await this.prisma.serverEncryptionKey.findUnique({
        where: { id: encryptionKeyId }
      });

      if (!keyRecord) {
        throw new Error(`Encryption key not found: ${encryptionKeyId}`);
      }

      // Decrypt the key using master key
      const masterKeyB64 = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKeyB64) {
        throw new Error('ENCRYPTION_MASTER_KEY not set');
      }

      const masterKey = Buffer.from(masterKeyB64, 'base64');
      const encryptedKey = Buffer.from(keyRecord.encryptedKey, 'base64');
      const keyIv = Buffer.from(keyRecord.iv, 'base64');
      const keyAuthTag = Buffer.from(keyRecord.authTag, 'base64');

      const keyDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, keyIv);
      keyDecipher.setAuthTag(keyAuthTag);
      const key = Buffer.concat([keyDecipher.update(encryptedKey), keyDecipher.final()]);

      // Decrypt the translation
      const iv = Buffer.from(encryptionIv, 'base64');
      const authTag = Buffer.from(encryptionAuthTag, 'base64');
      const ciphertext = Buffer.from(encryptedContent, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      return plaintext.toString('utf8');
    } catch (error) {
      logger.error('Failed to decrypt translation', { encryptionKeyId, error });
      throw error;
    }
  }

  /**
   * Check if a message requires encrypted translation storage
   */
  private async _shouldEncryptTranslation(messageId: string): Promise<{ shouldEncrypt: boolean; conversationId: string | null }> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          conversationId: true,
          encryptionMode: true,
          isEncrypted: true
        }
      });

      if (!message) {
        return { shouldEncrypt: false, conversationId: null };
      }

      // E2EE messages should NOT have translations (they should be skipped entirely)
      // Server and Hybrid mode messages should have encrypted translations
      const shouldEncrypt = message.encryptionMode === 'server' || message.encryptionMode === 'hybrid';

      return { shouldEncrypt, conversationId: message.conversationId };
    } catch (error) {
      logger.error('Failed to check encryption requirement', { messageId, error });
      return { shouldEncrypt: false, conversationId: null };
    }
  }

  // ============================================================================
  // END ENCRYPTION HELPERS
  // ============================================================================

  /**
   * Génère un identifiant unique pour une conversation
   * Format: mshy_<titre_sanitisé>-YYYYMMDDHHMMSS ou mshy_<unique_id>-YYYYMMDDHHMMSS si pas de titre
   */
  private generateConversationIdentifier(title?: string): string {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    
    if (title) {
      // Sanitiser le titre : enlever les caractères spéciaux, remplacer les espaces par des tirets
      const sanitizedTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Garder seulement lettres, chiffres, espaces et tirets
        .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
        .replace(/-+/g, '-') // Remplacer les tirets multiples par un seul
        .replace(/^-|-$/g, ''); // Enlever les tirets en début/fin
      
      if (sanitizedTitle.length > 0) {
        return `mshy_${sanitizedTitle}-${timestamp}`;
      }
    }
    
    // Si pas de titre ou titre vide après sanitisation, utiliser un ID unique
    const uniqueId = Math.random().toString(36).slice(2, 10);
    return `mshy_${uniqueId}-${timestamp}`;
  }

  async initialize(): Promise<void> {
    try {
      // ⚠️ IMPORTANT: Éviter la double initialisation qui créerait des listeners multiples
      if (this.isInitialized) {
        return;
      }
      
      
      // Utiliser le singleton ZMQ
      this.zmqClient = await ZMQSingleton.getInstance();
      
      // ⚠️ CORRECTION DOUBLONS: Retirer les anciens listeners AVANT d'en ajouter de nouveaux
      this.zmqClient.removeAllListeners('translationCompleted');
      this.zmqClient.removeAllListeners('translationError');
      this.zmqClient.removeAllListeners('audioProcessCompleted');
      this.zmqClient.removeAllListeners('audioProcessError');

      // Écouter les événements de traduction terminée
      this.zmqClient.on('translationCompleted', this._handleTranslationCompleted.bind(this));
      this.zmqClient.on('translationError', this._handleTranslationError.bind(this));

      // Écouter les événements de traduction audio (attachements)
      this.zmqClient.on('audioProcessCompleted', this._handleAudioProcessCompleted.bind(this));
      this.zmqClient.on('audioProcessError', this._handleAudioProcessError.bind(this));

      // Écouter les événements de transcription seule
      this.zmqClient.on('transcriptionCompleted', this._handleTranscriptionOnlyCompleted.bind(this));
      this.zmqClient.on('transcriptionError', this._handleTranscriptionOnlyError.bind(this));


      // Test de réception après initialisation
      setTimeout(async () => {
        try {
          await this.zmqClient.testReception();
        } catch (error) {
          console.error('[GATEWAY] ❌ Erreur test réception:', error);
        }
      }, 3000);
      
      this.isInitialized = true;
    } catch (error) {
      console.error('[GATEWAY] ❌ Erreur initialisation TranslationService:', error);
      throw error;
    }
  }

  /**
   * Traite un nouveau message selon l'architecture spécifiée :
   * 1. Sauvegarde le message avec Prisma
   * 2. Libère le client immédiatement
   * 3. Traite les traductions en asynchrone
   */
  async handleNewMessage(messageData: MessageData): Promise<{ messageId: string; status: string }> {
    try {
      const startTime = Date.now();

      // SECURITY: Skip translation for E2EE messages
      // E2EE messages have encrypted content that the server cannot read
      // Translating "[Encrypted]" placeholder is useless and wastes resources
      if (messageData.encryptionMode === 'e2ee') {
        logger.debug('Skipping translation for E2EE message', {
          conversationId: messageData.conversationId,
          encryptionMode: messageData.encryptionMode
        });

        // Still save the message if it's new, but skip translation
        if (!messageData.id) {
          const savedMessage = await this._saveMessageToDatabase(messageData);
          this.stats.messages_saved++;
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

      // Vérifier si c'est une retraduction (message avec ID existant)
      if (messageData.id) {
        messageId = messageData.id;
        isRetranslation = true;
        
        // Vérifier que le message existe en base
        const existingMessage = await this.prisma.message.findFirst({
          where: { id: messageData.id }
        });
        
        if (!existingMessage) {
          throw new Error(`Message ${messageData.id} non trouvé en base de données`);
        }
        
      } else {
        // Nouveau message - sauvegarder en base
        const savedMessage = await this._saveMessageToDatabase(messageData);
        messageId = savedMessage.id;
        this.stats.messages_saved++;
      }
      
      // 2. LIBÉRER LE CLIENT IMMÉDIATEMENT
      const processingTime = Date.now() - startTime;
      
      const response = {
        messageId: messageId,
        status: isRetranslation ? 'retranslation_queued' : 'message_saved',
        translation_queued: true
      };
      
      // 3. TRAITER LES TRADUCTIONS EN ASYNCHRONE (non-bloquant)
      setImmediate(async () => {
        try {
          if (isRetranslation) {
            // Pour une retraduction, on utilise les données du message existant
            await this._processRetranslationAsync(messageId, messageData);
          } else {
            // Pour un nouveau message, on récupère les données complètes
            const savedMessage = await this.prisma.message.findFirst({
              where: { id: messageId }
            });
            if (savedMessage) {
              // Passer la langue cible ET le modelType spécifiés par le client
              const requestedModelType = (messageData as any).modelType;
              await this._processTranslationsAsync(savedMessage, messageData.targetLanguage, requestedModelType);
            } else {
              console.error(`❌ [TranslationService] Message ${messageId} non trouvé en base`);
            }
          }
        } catch (error) {
          console.error(`❌ Erreur traitement asynchrone des traductions: ${error}`);
          this.stats.errors++;
        }
      });
      
      return response;
      
    } catch (error) {
      console.error(`❌ Erreur traitement message: ${error}`);
      this.stats.errors++;
      throw error;
    }
  }

  private async _saveMessageToDatabase(messageData: MessageData) {
    try {
      // Vérifier si la conversation existe, sinon la créer
      const existingConversation = await this.prisma.conversation.findFirst({
        where: { id: messageData.conversationId }
      });
      
      if (!existingConversation) {
        
        // Générer un identifiant unique pour la conversation
        const conversationIdentifier = this.generateConversationIdentifier(`Conversation ${messageData.conversationId}`);
        
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
      
      // Mettre à jour lastMessageAt de la conversation
      await this.prisma.conversation.update({
        where: { id: messageData.conversationId },
        data: { lastMessageAt: new Date() }
      });
      
      return message;
      
    } catch (error) {
      console.error(`❌ Erreur sauvegarde message: ${error}`);
      throw error;
    }
  }

  /**
   * Traite les traductions d'un nouveau message de manière asynchrone
   * OPTIMISATION: Filtre automatiquement les langues cibles identiques à la langue source
   * pour éviter les traductions inutiles (ex: fr → fr)
   */
  private async _processTranslationsAsync(message: any, targetLanguage?: string, modelType?: string) {
    try {
      const startTime = Date.now();
      
      if (!this.zmqClient) {
        console.error('[GATEWAY] ❌ ZMQ Client non disponible pour les traductions');
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
      this.stats.translation_requests_sent++;
      
      const processingTime = Date.now() - startTime;
      
    } catch (error) {
      console.error(`❌ Erreur traitement asynchrone: ${error}`);
      this.stats.errors++;
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
      this.stats.translation_requests_sent++;
      
      
    } catch (error) {
      console.error(`❌ Erreur retraduction: ${error}`);
      this.stats.errors++;
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
      const now = Date.now();
      const cached = this.conversationLanguagesCache.get(conversationId);
      
      if (cached && (now - cached.timestamp) < this.LANGUAGES_CACHE_TTL) {
        return cached.languages;
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
                customDestinationLanguage: true,
                userFeature: {
                  select: {
                    autoTranslateEnabled: true,
                    translateToSystemLanguage: true,
                    translateToRegionalLanguage: true,
                    useCustomDestination: true
                  }
                }
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
      // On extrait toujours systemLanguage, et les autres langues selon les préférences
      for (const member of members) {
        const userPrefs = member.user.userFeature;

        // Toujours ajouter la langue système du participant
        if (member.user.systemLanguage) {
          languages.add(member.user.systemLanguage);
        }

        // Ajouter les langues additionnelles si l'utilisateur a activé la traduction automatique
        if (userPrefs?.autoTranslateEnabled) {
          // Langue régionale si activée
          if (userPrefs.translateToRegionalLanguage && member.user.regionalLanguage) {
            languages.add(member.user.regionalLanguage);
          }
          // Langue personnalisée si activée
          if (userPrefs.useCustomDestination && member.user.customDestinationLanguage) {
            languages.add(member.user.customDestinationLanguage);
          }
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
      this.conversationLanguagesCache.set(conversationId, {
        languages: allLanguages,
        timestamp: now
      });
      
      // Nettoyer le cache si trop grand (garder max 100 conversations)
      if (this.conversationLanguagesCache.size > 100) {
        const firstKey = this.conversationLanguagesCache.keys().next().value;
        this.conversationLanguagesCache.delete(firstKey);
      }
      
      const queryTime = Date.now() - startTime;
      
      return allLanguages;
      
    } catch (error) {
      console.error(`❌ [TranslationService] Erreur extraction langues: ${error}`);
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
      console.error(`❌ Erreur récupération langue source: ${error}`);
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
      
      
      this.stats.translations_received++;
      
      // SAUVEGARDE EN BASE DE DONNÉES (traduction validée par le Translator)
      let translationId: string | null = null;
      try {
        translationId = await this._saveTranslationToDatabase(data.result, data.metadata);
      } catch (error) {
        console.error(`❌ [TranslationService] Erreur sauvegarde traduction: ${error}`);
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
      console.error(`❌ [TranslationService] Erreur traitement: ${error}`);
      console.error(`📋 [TranslationService] Données reçues: ${JSON.stringify(data, null, 2)}`);
      this.stats.errors++;
    }
  }

  private async _handleTranslationError(data: { taskId: string; messageId: string; error: string; conversationId: string }) {
    console.error(`❌ Erreur de traduction: ${data.error} pour ${data.messageId}`);

    if (data.error === 'translation pool full') {
      this.stats.pool_full_rejections++;
    }

    this.stats.errors++;
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
      segments?: Array<{ text: string; startMs: number; endMs: number }>;
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
    };
  }) {
    try {
      const startTime = Date.now();

      logger.info(`🎤 [TranslationService] Audio process completed: ${data.attachmentId}`);
      logger.info(`   📝 Transcription: ${data.transcription.text.substring(0, 50)}...`);
      logger.info(`   🌍 Traductions: ${data.translatedAudios.length} langues`);

      // 1. Récupérer les infos de l'attachment pour vérifier
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { id: true, messageId: true, duration: true }
      });

      if (!attachment) {
        logger.error(`❌ [TranslationService] Attachment non trouvé: ${data.attachmentId}`);
        return;
      }

      // 2. Sauvegarder la transcription (upsert)
      await this.prisma.messageAudioTranscription.upsert({
        where: { attachmentId: data.attachmentId },
        update: {
          transcribedText: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments || null,
          audioDurationMs: attachment.duration || 0
        },
        create: {
          attachmentId: data.attachmentId,
          messageId: data.messageId,
          transcribedText: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments || null,
          audioDurationMs: attachment.duration || 0
        }
      });

      logger.info(`   ✅ Transcription sauvegardée (${data.transcription.language})`);

      // 3. Sauvegarder chaque audio traduit (upsert pour éviter les doublons)
      // Les données audio arrivent en base64 depuis le Translator (pas de fichier partagé)
      const savedTranslatedAudios: typeof data.translatedAudios = [];

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

        await this.prisma.messageTranslatedAudio.upsert({
          where: {
            attachmentId_targetLanguage: {
              attachmentId: data.attachmentId,
              targetLanguage: translatedAudio.targetLanguage
            }
          },
          update: {
            translatedText: translatedAudio.translatedText,
            audioPath: localAudioPath,
            audioUrl: localAudioUrl,
            durationMs: translatedAudio.durationMs,
            voiceCloned: translatedAudio.voiceCloned,
            voiceQuality: translatedAudio.voiceQuality,
            voiceModelId: data.voiceModelUserId || null
          },
          create: {
            attachmentId: data.attachmentId,
            messageId: data.messageId,
            targetLanguage: translatedAudio.targetLanguage,
            translatedText: translatedAudio.translatedText,
            audioPath: localAudioPath,
            audioUrl: localAudioUrl,
            durationMs: translatedAudio.durationMs,
            voiceCloned: translatedAudio.voiceCloned,
            voiceQuality: translatedAudio.voiceQuality,
            voiceModelId: data.voiceModelUserId || null
          }
        });

        // Mettre à jour l'URL locale dans l'objet pour l'événement
        savedTranslatedAudios.push({
          ...translatedAudio,
          audioPath: localAudioPath,
          audioUrl: localAudioUrl
        });

        logger.info(`   ✅ Audio traduit sauvegardé: ${translatedAudio.targetLanguage}`);
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
              voiceCharacteristics: nvp.voiceCharacteristics || null
            }
          });

          logger.info(`   ✅ Profil vocal sauvegardé: ${nvp.userId} (quality=${nvp.qualityScore.toFixed(2)})`);
        } catch (voiceProfileError) {
          logger.error(`   ⚠️ Erreur sauvegarde profil vocal: ${voiceProfileError}`);
          // Ne pas faire échouer le traitement principal
        }
      }

      // 5. Émettre événement pour notifier les clients (Socket.IO)
      // Utiliser savedTranslatedAudios qui contient les URLs locales accessibles
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
      this.stats.errors++;
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

    this.stats.errors++;
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
      segments?: Array<{ text: string; startMs: number; endMs: number }>;
    };
    processingTimeMs: number;
  }) {
    try {
      const startTime = Date.now();

      logger.info(`📝 [TranslationService] Transcription only completed: ${data.attachmentId}`);
      logger.info(`   📝 Text: ${data.transcription.text.substring(0, 50)}...`);
      logger.info(`   🌍 Language: ${data.transcription.language}`);

      // 1. Récupérer les infos de l'attachment pour vérifier
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { id: true, messageId: true, duration: true }
      });

      if (!attachment) {
        logger.error(`❌ [TranslationService] Attachment non trouvé: ${data.attachmentId}`);
        return;
      }

      // 2. Sauvegarder la transcription (upsert)
      const transcription = await this.prisma.messageAudioTranscription.upsert({
        where: { attachmentId: data.attachmentId },
        update: {
          transcribedText: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments || null,
          audioDurationMs: data.transcription.durationMs || attachment.duration || 0
        },
        create: {
          attachmentId: data.attachmentId,
          messageId: data.messageId,
          transcribedText: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments || null,
          audioDurationMs: data.transcription.durationMs || attachment.duration || 0
        }
      });

      logger.info(`   ✅ Transcription sauvegardée (${data.transcription.language})`);

      // 3. Émettre événement pour notifier les clients (Socket.IO)
      this.emit('transcriptionReady', {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        transcription: {
          id: transcription.id,
          text: data.transcription.text,
          language: data.transcription.language,
          confidence: data.transcription.confidence,
          source: data.transcription.source,
          segments: data.transcription.segments,
          durationMs: data.transcription.durationMs
        },
        processingTimeMs: data.processingTimeMs
      });

      const totalTime = Date.now() - startTime;
      logger.info(`   ⏱️ Persistance transcription terminée en ${totalTime}ms`);

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur sauvegarde transcription: ${error}`);
      this.stats.errors++;
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

    this.stats.errors++;
  }

  // ============================================================================
  // END AUDIO ATTACHMENT HANDLERS
  // ============================================================================

  // ============================================================================
  // PUBLIC AUDIO PROCESSING API
  // ============================================================================

  /**
   * Envoie un attachement audio au service translator pour traitement.
   * Le translator va:
   * 1. Transcrire l'audio (ou utiliser la transcription mobile si fournie)
   * 2. Traduire vers les langues cibles de la conversation
   * 3. Générer des versions audio traduites avec clonage vocal
   *
   * @param params Paramètres du traitement audio
   * @returns taskId de la requête ZMQ
   */
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
  }): Promise<string | null> {
    try {
      if (!this.zmqClient) {
        logger.error('[TranslationService] ZMQ Client non disponible pour le traitement audio');
        return null;
      }

      logger.info(`🎤 [TranslationService] Traitement audio pour message ${params.messageId}`);
      logger.info(`   📎 Attachment: ${params.attachmentId}`);
      logger.info(`   👤 Sender: ${params.senderId}`);
      logger.info(`   ⏱️ Duration: ${params.audioDurationMs}ms`);

      // ═══════════════════════════════════════════════════════════════════════════
      // VÉRIFICATION DES CONSENTEMENTS VOCAUX
      // ═══════════════════════════════════════════════════════════════════════════
      const bypassConsentCheck = process.env.BYPASS_VOICE_CONSENT_CHECK === 'true';
      let hasVoiceCloningConsent = false;
      let hasVoiceProfileConsent = false;

      try {
        // Récupérer les consentements de l'utilisateur
        const userWithConsent = await this.prisma.user.findUnique({
          where: { id: params.senderId },
          select: {
            userFeature: {
              select: {
                voiceProfileConsentAt: true,
                voiceCloningConsentAt: true,
                voiceCloningEnabledAt: true
              }
            }
          }
        });

        if (userWithConsent?.userFeature) {
          hasVoiceProfileConsent = userWithConsent.userFeature.voiceProfileConsentAt != null;
          hasVoiceCloningConsent = userWithConsent.userFeature.voiceCloningEnabledAt != null ||
                                   userWithConsent.userFeature.voiceCloningConsentAt != null;
        }

        if (bypassConsentCheck) {
          logger.warn(`   ⚠️ BYPASS_VOICE_CONSENT_CHECK=true - Contournement des vérifications de consentement`);
          hasVoiceCloningConsent = true;
          hasVoiceProfileConsent = true;
        }

        logger.info(`   🔐 Consent check: voiceProfile=${hasVoiceProfileConsent}, voiceCloning=${hasVoiceCloningConsent}`);

      } catch (consentError) {
        logger.warn(`   ⚠️ Erreur vérification consentements: ${consentError}`);
        // En cas d'erreur, on continue sans clonage vocal par sécurité
        if (bypassConsentCheck) {
          hasVoiceCloningConsent = true;
          hasVoiceProfileConsent = true;
        }
      }

      // Déterminer si on génère le clonage vocal
      const shouldGenerateVoiceClone = (params.generateVoiceClone ?? true) && hasVoiceCloningConsent;

      if (!shouldGenerateVoiceClone && (params.generateVoiceClone ?? true)) {
        logger.info(`   ℹ️ Clonage vocal désactivé (pas de consentement)`);
      }

      // 1. Récupérer les langues cibles de la conversation
      const targetLanguages = await this._extractConversationLanguages(params.conversationId);

      if (targetLanguages.length === 0) {
        logger.warn(`[TranslationService] Aucune langue cible pour la conversation ${params.conversationId}`);
        // Fallback: utiliser en + fr
        targetLanguages.push('en', 'fr');
      }

      logger.info(`   🌍 Target languages: [${targetLanguages.join(', ')}]`);

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
            totalDurationMs: true
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
          logger.info(`   🎙️ Existing voice profile found (quality: ${voiceModel.qualityScore})`);
        }
      } catch (profileError) {
        logger.debug(`   ℹ️ No existing voice profile for user ${params.senderId}`);
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
        useOriginalVoice: shouldGenerateVoiceClone
      });

      logger.info(`   ✅ Audio process request sent: taskId=${taskId}`);
      this.stats.translation_requests_sent++;

      return taskId;

    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur traitement audio: ${error}`);
      this.stats.errors++;
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

      logger.info(`🔍 [GATEWAY-TRACE] ✅ Attachment récupéré:`);
      logger.info(`   - ID: ${attachment.id}`);
      logger.info(`   - Message ID: ${attachment.messageId}`);
      logger.info(`   - File: ${attachment.fileName}`);
      logger.info(`   - MIME: ${attachment.mimeType}`);
      logger.info(`   - Duration: ${attachment.duration}ms`);
      logger.info(`   - URL: ${attachment.fileUrl}`);

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

      logger.info(`🔍 [GATEWAY-TRACE] Chemins calculés:`);
      logger.info(`   - Relative: ${relativePath}`);
      logger.info(`   - Absolute: ${audioPath}`);
      logger.info(`   - Exists: ${require('fs').existsSync(audioPath)}`);

      if (!require('fs').existsSync(audioPath)) {
        logger.error(`🔍 [GATEWAY-TRACE] ❌ FICHIER AUDIO INTROUVABLE: ${audioPath}`);
      } else {
        const stats = require('fs').statSync(audioPath);
        logger.info(`🔍 [GATEWAY-TRACE] ✅ Fichier existant, taille: ${(stats.size / 1024).toFixed(2)} KB`);
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
      this.stats.translation_requests_sent++;

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
      this.stats.errors++;
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
        include: {
          transcription: true,
          translatedAudios: true
        }
      });

      if (!attachment) {
        return null;
      }

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
        transcription: attachment.transcription ? {
          id: attachment.transcription.id,
          text: attachment.transcription.transcribedText,
          language: attachment.transcription.language,
          confidence: attachment.transcription.confidence,
          source: attachment.transcription.source,
          segments: attachment.transcription.segments,
          durationMs: attachment.transcription.audioDurationMs,
          createdAt: attachment.transcription.createdAt
        } : null,
        translatedAudios: attachment.translatedAudios.map(ta => ({
          id: ta.id,
          targetLanguage: ta.targetLanguage,
          translatedText: ta.translatedText,
          audioUrl: ta.audioUrl,
          audioPath: ta.audioPath,
          durationMs: ta.durationMs,
          format: ta.format,
          voiceCloned: ta.voiceCloned,
          voiceQuality: ta.voiceQuality,
          createdAt: ta.createdAt
        }))
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

      logger.info(`🎤 [TranslationService] Traduction de l'attachment ${attachmentId}`);
      logger.info(`   📎 File: ${attachment.fileName}`);
      logger.info(`   ⏱️ Duration: ${attachment.duration}ms`);

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

      logger.info(`   ✅ Translation request sent: taskId=${taskId}`);

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

  private _addToCache(key: string, result: TranslationResult) {
    // Gestion du cache LRU simple
    if (this.memoryCache.size >= this.CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(key, result);
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
      console.error(`❌ [TranslationService] Erreur lors de l'incrémentation des stats: ${error}`);
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
      console.error(`❌ [TranslationService] Erreur sauvegarde traduction: ${error.message}`);

      // Fallback: Si l'erreur est due à une contrainte manquante, utiliser l'ancienne méthode
      if (error.code === 'P2025' || error.message?.includes('messageId_targetLanguage')) {
        console.warn(`⚠️ [TranslationService] Contrainte unique manquante, fallback vers méthode legacy`);
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
      console.error(`❌ [TranslationService] Erreur legacy: ${error}`);
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
      const cacheKey = sourceLanguage
        ? `${messageId}_${sourceLanguage}_${targetLanguage}`
        : `${messageId}_${targetLanguage}`;
      const cachedResult = this.memoryCache.get(cacheKey);

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
      console.error(`❌ Erreur récupération traduction: ${error}`);
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
      this.stats.translation_requests_sent++;
      
      
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
      console.error(`❌ [REST] Erreur traduction directe: ${error}`);
      this.stats.errors++;
      
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

  getStats(): TranslationServiceStats {
    const uptime = (Date.now() - this.startTime) / 1000;
    
    return {
      ...this.stats,
      uptime_seconds: uptime,
      memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const zmqHealth = await this.zmqClient.healthCheck();
      return zmqHealth;
    } catch (error) {
      console.error(`❌ Health check échoué: ${error}`);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.zmqClient.close();
    } catch (error) {
      console.error(`❌ Erreur fermeture TranslationService: ${error}`);
    }
  }
}

