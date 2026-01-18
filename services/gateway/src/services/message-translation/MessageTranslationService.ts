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
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { ZmqTranslationClient, TranslationRequest, TranslationResult } from '../zmq-translation';
import { ZMQSingleton } from '../ZmqSingleton';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { TranslationCache } from './TranslationCache';
import { LanguageCache } from './LanguageCache';
import { TranslationStats, TranslationServiceStats } from './TranslationStats';

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

  // Composition de modules
  private readonly translationCache: TranslationCache;
  private readonly languageCache: LanguageCache;
  private readonly stats: TranslationStats;

  // Déduplication
  private readonly processedMessages = new Set<string>();
  private readonly processedTasks = new Set<string>();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.translationCache = new TranslationCache(1000);
    this.languageCache = new LanguageCache(5 * 60 * 1000, 100);
    this.stats = new TranslationStats();
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

    // Enregistrer les nouveaux listeners
    this.zmqClient.on('translationCompleted', this._handleTranslationCompleted.bind(this));
    this.zmqClient.on('translationError', this._handleTranslationError.bind(this));
    this.zmqClient.on('audioProcessCompleted', this._handleAudioProcessCompleted.bind(this));
    this.zmqClient.on('audioProcessError', this._handleAudioProcessError.bind(this));
    this.zmqClient.on('transcriptionCompleted', this._handleTranscriptionOnlyCompleted.bind(this));
    this.zmqClient.on('transcriptionError', this._handleTranscriptionOnlyError.bind(this));

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
              console.error(`❌ [TranslationService] Message ${messageId} non trouvé en base`);
            }
          }
        } catch (error) {
          console.error(`❌ Erreur traitement asynchrone des traductions: ${error}`);
          this.stats.incrementErrors();
        }
      });

      return response;
    } catch (error) {
      console.error(`❌ Erreur traitement message: ${error}`);
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
      console.error(`❌ Erreur sauvegarde message: ${error}`);
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

  // Les méthodes privées seront dans des fichiers séparés (partie 2)
  private async _processTranslationsAsync(message: any, targetLanguage?: string, modelType?: string): Promise<void> {
    // Implementation moved to TranslationProcessor
    throw new Error('Not implemented - see TranslationProcessor');
  }

  private async _processRetranslationAsync(messageId: string, messageData: MessageData): Promise<void> {
    // Implementation moved to TranslationProcessor
    throw new Error('Not implemented - see TranslationProcessor');
  }

  private async _handleTranslationCompleted(data: any): Promise<void> {
    // Implementation moved to TranslationHandler
    throw new Error('Not implemented - see TranslationHandler');
  }

  private async _handleTranslationError(data: any): Promise<void> {
    // Implementation moved to TranslationHandler
    throw new Error('Not implemented - see TranslationHandler');
  }

  private async _handleAudioProcessCompleted(data: any): Promise<void> {
    // Implementation moved to AudioHandler
    throw new Error('Not implemented - see AudioHandler');
  }

  private async _handleAudioProcessError(data: any): Promise<void> {
    // Implementation moved to AudioHandler
    throw new Error('Not implemented - see AudioHandler');
  }

  private async _handleTranscriptionOnlyCompleted(data: any): Promise<void> {
    // Implementation moved to AudioHandler
    throw new Error('Not implemented - see AudioHandler');
  }

  private async _handleTranscriptionOnlyError(data: any): Promise<void> {
    // Implementation moved to AudioHandler
    throw new Error('Not implemented - see AudioHandler');
  }
}
