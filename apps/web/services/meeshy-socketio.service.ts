/**
 * Service Socket.IO pour Meeshy
 * Gestion des connexions temps réel avec le serveur Gateway
 *
 * REFACTORED: Now uses modular architecture with specialized services
 * This file maintains backward compatibility while delegating to the orchestrator
 */

'use client';

import type { Socket } from 'socket.io-client';
import type {
  Message,
  User,
  SocketIOMessage,
  TypingEvent,
  UserStatusEvent,
  TranslationEvent,
  ServerToClientEvents,
  ClientToServerEvents,
  SocketIOResponse
} from '@/types';
import type { EncryptedPayload, EncryptionMode } from '@meeshy/shared/types/encryption';
import type { AudioTranslationReadyEventData } from '@meeshy/shared/types/socketio-events';

import { SocketIOOrchestrator } from './socketio/orchestrator.service';

class MeeshySocketIOService {
  private static instance: MeeshySocketIOService | null = null;

  // Delegate to orchestrator
  private orchestrator: SocketIOOrchestrator;

  constructor() {
    // CORRECTION CRITIQUE: Le constructeur ne doit s'exécuter QU'UNE SEULE FOIS
    // Protection contre React StrictMode qui monte les composants 2 fois en dev
    if (MeeshySocketIOService.instance) {
      return MeeshySocketIOService.instance;
    }

    // Initialize orchestrator
    this.orchestrator = SocketIOOrchestrator.getInstance();

    // Setup message converter
    this.orchestrator.setMessageConverter((socketMessage) => this.convertSocketMessageToMessage(socketMessage));

    // Setup auto-join callback
    this.orchestrator.setAutoJoinCallback(() => this._autoJoinLastConversation());
  }

  /**
   * Obtenir l'instance singleton du service Socket.IO
   */
  static getInstance(): MeeshySocketIOService {
    if (!MeeshySocketIOService.instance) {
      MeeshySocketIOService.instance = new MeeshySocketIOService();
    }
    return MeeshySocketIOService.instance;
  }

  /**
   * Définit le callback pour récupérer un message par ID
   */
  public setGetMessageByIdCallback(callback: (messageId: string) => Message | undefined): void {
    this.orchestrator.setGetMessageByIdCallback(callback);
  }

  /**
   * Set encryption handlers for E2EE support
   */
  public setEncryptionHandlers(handlers: {
    encrypt: (content: string, conversationId: string) => Promise<EncryptedPayload | null>;
    decrypt: (payload: EncryptedPayload, senderUserId?: string) => Promise<string>;
    getConversationMode: (conversationId: string) => Promise<EncryptionMode | null>;
  }): void {
    this.orchestrator.setEncryptionHandlers(handlers);
  }

  /**
   * Clear encryption handlers (on logout)
   */
  public clearEncryptionHandlers(): void {
    this.orchestrator.clearEncryptionHandlers();
  }

  /**
   * Check if conversation has encryption enabled
   */
  public async isConversationEncrypted(conversationId: string): Promise<boolean> {
    return this.orchestrator.isConversationEncrypted(conversationId);
  }

  /**
   * Définit l'utilisateur actuel et initialise la connexion
   */
  public setCurrentUser(user: User): void {
    this.orchestrator.setCurrentUser(user);
  }

  /**
   * Force un auto-join manuel
   */
  public triggerAutoJoin(): void {
    this.orchestrator.triggerAutoJoin();
  }

  /**
   * Rejoint automatiquement la dernière conversation active après authentification
   */
  private _autoJoinLastConversation(): void {
    // Vérifier si une conversation est mémorisée
    const currentConversationId = this.orchestrator.getCurrentConversationId();
    if (currentConversationId) {
      this.joinConversation(currentConversationId);
      return;
    }

    // Essayer de détecter la conversation depuis l'URL
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;

      // 1. Page d'accueil "/" → Conversation globale "meeshy"
      if (path === '/' || path === '') {
        this.joinConversation('meeshy');
        return;
      }

      // 2. Page chat anonyme "/chat"
      if (path === '/chat' || path.startsWith('/chat?')) {
        const { authManager } = require('./auth-manager.service');
        const sessionToken = authManager.getAnonymousSession()?.token;
        if (sessionToken) {
          const chatData = localStorage.getItem('anonymous_chat_data');
          if (chatData) {
            try {
              const parsedData = JSON.parse(chatData);
              const conversationId = parsedData.conversationId || parsedData.conversation?.id;

              if (conversationId) {
                this.joinConversation(conversationId);
                return;
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      // 3. Pages conversations avec ID
      const conversationMatch = path.match(/\/(conversations|chat)\/([^\/\?]+)/);
      if (conversationMatch && conversationMatch[2]) {
        const detectedConversationId = conversationMatch[2];
        this.joinConversation(detectedConversationId);
        return;
      }
    }
  }

  /**
   * Rejoint une conversation
   */
  public joinConversation(conversationOrId: any): void {
    this.orchestrator.joinConversation(conversationOrId);
  }

  /**
   * Quitte une conversation
   */
  public leaveConversation(conversationOrId: any): void {
    this.orchestrator.leaveConversation(conversationOrId);
  }

  /**
   * Envoie un message
   */
  public async sendMessage(
    conversationOrId: any,
    content: string,
    originalLanguage?: string,
    replyToId?: string,
    mentionedUserIds?: string[],
    attachmentIds?: string[],
    attachmentMimeTypes?: string[]
  ): Promise<boolean> {
    return this.orchestrator.sendMessage(
      conversationOrId,
      content,
      originalLanguage,
      replyToId,
      mentionedUserIds,
      attachmentIds,
      attachmentMimeTypes
    );
  }

  /**
   * Modifie un message
   */
  public async editMessage(messageId: string, content: string): Promise<boolean> {
    return this.orchestrator.editMessage(messageId, content);
  }

  /**
   * Supprime un message
   */
  public async deleteMessage(messageId: string): Promise<boolean> {
    return this.orchestrator.deleteMessage(messageId);
  }

  /**
   * Démarre l'indicateur de frappe
   */
  public startTyping(conversationId: string): void {
    this.orchestrator.startTyping(conversationId);
  }

  /**
   * Arrête l'indicateur de frappe
   */
  public stopTyping(conversationId: string): void {
    this.orchestrator.stopTyping(conversationId);
  }

  /**
   * Force une reconnexion
   */
  public reconnect(): void {
    this.orchestrator.reconnect();
  }

  /**
   * Gestionnaires d'événements
   */
  public onNewMessage(listener: (message: Message) => void): () => void {
    return this.orchestrator.onNewMessage(listener);
  }

  public onMessageEdited(listener: (message: Message) => void): () => void {
    return this.orchestrator.onMessageEdited(listener);
  }

  public onMessageDeleted(listener: (messageId: string) => void): () => void {
    return this.orchestrator.onMessageDeleted(listener);
  }

  public onTranslation(listener: (data: TranslationEvent) => void): () => void {
    return this.orchestrator.onTranslation(listener);
  }

  public onAudioTranslation(listener: (data: AudioTranslationReadyEventData) => void): () => void {
    return this.orchestrator.onAudioTranslation(listener);
  }

  public onTranscription(listener: (data: any) => void): () => void {
    return this.orchestrator.onTranscription(listener);
  }

  public onAudioTranslationsProgressive(listener: (data: any) => void): () => void {
    return this.orchestrator.onAudioTranslationsProgressive(listener);
  }

  public onAudioTranslationsCompleted(listener: (data: any) => void): () => void {
    return this.orchestrator.onAudioTranslationsCompleted(listener);
  }

  public onTyping(listener: (event: TypingEvent) => void): () => void {
    return this.orchestrator.onTyping(listener);
  }

  public onTypingStart(listener: (event: TypingEvent) => void): () => void {
    return this.orchestrator.onTypingStart(listener);
  }

  public onTypingStop(listener: (event: TypingEvent) => void): () => void {
    return this.orchestrator.onTypingStop(listener);
  }

  public onUserStatus(listener: (event: UserStatusEvent) => void): () => void {
    return this.orchestrator.onUserStatus(listener);
  }

  public onConversationStats(listener: (data: { conversationId: string; stats: any }) => void): () => void {
    return this.orchestrator.onConversationStats(listener);
  }

  public onConversationOnlineStats(listener: (data: { conversationId: string; onlineUsers: any[]; updatedAt: Date }) => void): () => void {
    return this.orchestrator.onConversationOnlineStats(listener);
  }

  public onReactionAdded(listener: (data: any) => void): () => void {
    return this.orchestrator.onReactionAdded(listener);
  }

  public onReactionRemoved(listener: (data: any) => void): () => void {
    return this.orchestrator.onReactionRemoved(listener);
  }

  public onConversationJoined(listener: (data: { conversationId: string; userId: string }) => void): () => void {
    return this.orchestrator.onConversationJoined(listener);
  }

  /**
   * Obtient le statut de connexion
   */
  public getConnectionStatus(): {
    isConnected: boolean;
    hasSocket: boolean;
    currentUser: string;
  } {
    return this.orchestrator.getConnectionStatus();
  }

  /**
   * Obtient l'ID de conversation actuel normalisé (ObjectId)
   */
  public getCurrentConversationId(): string | null {
    return this.orchestrator.getCurrentConversationId();
  }

  /**
   * Obtient l'instance Socket directe (pour usage avancé)
   */
  public getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return this.orchestrator.getSocket();
  }

  /**
   * Obtient des diagnostics de connexion
   */
  public getConnectionDiagnostics(): any {
    return this.orchestrator.getConnectionDiagnostics();
  }

  /**
   * Nettoie les ressources
   */
  public cleanup(): void {
    this.orchestrator.cleanup();
  }

  /**
   * Convertit un message Socket.IO en Message standard
   */
  private convertSocketMessageToMessage(socketMessage: SocketIOMessage): Message {
    // CORRECTION CRITIQUE: Utiliser replyTo depuis le backend si disponible
    let replyTo: Message | undefined = undefined;

    // 1. D'abord vérifier si le backend envoie déjà replyTo complet
    if ((socketMessage as any).replyTo) {
      const replyToMsg = (socketMessage as any).replyTo;
      const replyToSender = replyToMsg.sender;
      const replyToAnonymousSender = replyToMsg.anonymousSender;

      // Construire le sender pour replyTo (gérer utilisateurs authentifiés ET anonymes)
      let replyToFinalSender;
      if (replyToSender) {
        replyToFinalSender = {
          id: String(replyToSender.id || 'unknown'),
          username: String(replyToSender.username || 'Unknown'),
          displayName: String(replyToSender.displayName || replyToSender.username || 'Unknown'),
          firstName: String(replyToSender.firstName || ''),
          lastName: String(replyToSender.lastName || ''),
          email: String(replyToSender.email || ''),
          phoneNumber: '',
          role: 'USER' as const,
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: false,
          avatar: replyToSender.avatar,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          isActive: true,
          updatedAt: new Date()
        };
      } else if (replyToAnonymousSender) {
        const displayName = `${String(replyToAnonymousSender.firstName || '')} ${String(replyToAnonymousSender.lastName || '')}`.trim() ||
                           String(replyToAnonymousSender.username) ||
                           'Utilisateur anonyme';
        replyToFinalSender = {
          id: String(replyToAnonymousSender.id || 'unknown'),
          username: String(replyToAnonymousSender.username || 'Anonymous'),
          displayName: displayName,
          firstName: String(replyToAnonymousSender.firstName || ''),
          lastName: String(replyToAnonymousSender.lastName || ''),
          email: '',
          phoneNumber: '',
          role: 'USER' as const,
          systemLanguage: String(replyToAnonymousSender.language || 'fr'),
          regionalLanguage: String(replyToAnonymousSender.language || 'fr'),
          autoTranslateEnabled: false,
          translateToSystemLanguage: false,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: false,
          avatar: undefined,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          isActive: true,
          updatedAt: new Date()
        };
      } else {
        replyToFinalSender = {
          id: String(replyToMsg.senderId || replyToMsg.anonymousSenderId || 'unknown'),
          username: 'Unknown',
          displayName: 'Utilisateur Inconnu',
          firstName: '',
          lastName: '',
          email: '',
          phoneNumber: '',
          role: 'USER' as const,
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: false,
          avatar: undefined,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          isActive: true,
          updatedAt: new Date()
        };
      }

      replyTo = {
        id: String(replyToMsg.id),
        content: String(replyToMsg.content),
        senderId: String(replyToMsg.senderId || replyToMsg.anonymousSenderId || ''),
        conversationId: String(replyToMsg.conversationId),
        originalLanguage: String(replyToMsg.originalLanguage || 'fr'),
        messageType: String(replyToMsg.messageType || 'text') as any,
        createdAt: new Date(replyToMsg.createdAt),
        timestamp: new Date(replyToMsg.createdAt),
        sender: replyToFinalSender,
        translations: [],
        isEdited: false,
        isDeleted: false,
        updatedAt: new Date(replyToMsg.updatedAt || replyToMsg.createdAt),
      };
    }

    // Définir le sender par défaut
    const defaultSender = {
      id: socketMessage.senderId || (socketMessage as any).anonymousSenderId || 'unknown',
      username: 'Utilisateur inconnu',
      firstName: '',
      lastName: '',
      displayName: 'Utilisateur inconnu',
      email: '',
      phoneNumber: '',
      role: 'USER' as const,
      systemLanguage: 'fr',
      regionalLanguage: 'fr',
      customDestinationLanguage: undefined,
      autoTranslateEnabled: true,
      translateToSystemLanguage: true,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      isOnline: false,
      avatar: undefined,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isActive: true,
      updatedAt: new Date()
    };

    // Construire l'objet sender
    let sender;
    if (socketMessage.sender) {
      sender = socketMessage.sender;
    } else if ((socketMessage as any).anonymousSender) {
      const anonymousSender = (socketMessage as any).anonymousSender;
      const displayName = `${anonymousSender.firstName || ''} ${anonymousSender.lastName || ''}`.trim() ||
                         anonymousSender.username ||
                         'Utilisateur anonyme';
      sender = {
        id: anonymousSender.id || defaultSender.id,
        username: anonymousSender.username || 'Anonymous',
        firstName: anonymousSender.firstName || '',
        lastName: anonymousSender.lastName || '',
        displayName: displayName,
        email: '',
        phoneNumber: '',
        role: 'USER' as const,
        systemLanguage: anonymousSender.language || 'fr',
        regionalLanguage: anonymousSender.language || 'fr',
        customDestinationLanguage: undefined,
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        isOnline: false,
        avatar: undefined,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        isActive: true,
        updatedAt: new Date()
      };
    } else {
      sender = defaultSender;
    }

    // Transformer les attachments si présents
    console.log('🔍 [convertSocketMessage] Raw attachments:', {
      hasAttachments: !!(socketMessage as any).attachments,
      isArray: Array.isArray((socketMessage as any).attachments),
      count: Array.isArray((socketMessage as any).attachments) ? (socketMessage as any).attachments.length : 0,
      rawAttachments: (socketMessage as any).attachments,
    });
    const attachments = Array.isArray((socketMessage as any).attachments)
      ? (socketMessage as any).attachments.map((att: any) => {
          return {
            id: String(att.id || ''),
            messageId: socketMessage.id,
            fileName: String(att.fileName || ''),
            originalName: String(att.originalName || att.fileName || ''),
            fileUrl: att.fileUrl ? String(att.fileUrl) : '',
            mimeType: String(att.mimeType || ''),
            fileSize: Number(att.fileSize) || 0,
            thumbnailUrl: att.thumbnailUrl ? String(att.thumbnailUrl) : undefined,
            width: att.width ? Number(att.width) : undefined,
            height: att.height ? Number(att.height) : undefined,
            duration: att.duration ? Number(att.duration) : undefined,
            bitrate: att.bitrate ? Number(att.bitrate) : undefined,
            sampleRate: att.sampleRate ? Number(att.sampleRate) : undefined,
            codec: att.codec ? String(att.codec) : undefined,
            channels: att.channels ? Number(att.channels) : undefined,
            fps: att.fps ? Number(att.fps) : undefined,
            videoCodec: att.videoCodec ? String(att.videoCodec) : undefined,
            pageCount: att.pageCount ? Number(att.pageCount) : undefined,
            lineCount: att.lineCount ? Number(att.lineCount) : undefined,
            uploadedBy: String(att.uploadedBy || socketMessage.senderId || (socketMessage as any).anonymousSenderId || ''),
            isAnonymous: Boolean(att.isAnonymous),
            createdAt: String(att.createdAt || new Date().toISOString()),
            metadata: att.metadata || undefined,
          };
        })
      : [];

    return {
      id: socketMessage.id,
      conversationId: socketMessage.conversationId,
      senderId: socketMessage.senderId || (socketMessage as any).anonymousSenderId || '',
      content: socketMessage.content,
      originalContent: (socketMessage as any).originalContent || socketMessage.content,
      originalLanguage: socketMessage.originalLanguage || 'fr',
      messageType: socketMessage.messageType,
      timestamp: socketMessage.createdAt,
      createdAt: socketMessage.createdAt,
      updatedAt: socketMessage.updatedAt,
      isEdited: false,
      isDeleted: false,
      translations: [],
      replyTo: replyTo,
      sender: sender,
      attachments: attachments.length > 0 ? attachments : undefined,
      validatedMentions: (socketMessage as any).validatedMentions || []
    } as Message;
  }
}

// Fonction pour obtenir le service de manière lazy
export const getSocketIOService = (): MeeshySocketIOService => {
  return MeeshySocketIOService.getInstance();
};

// Export pour compatibilité avec le code existant
// Utilise un Proxy pour lazy loading
export const meeshySocketIOService = new Proxy({} as MeeshySocketIOService, {
  get: (target, prop) => {
    const instance = MeeshySocketIOService.getInstance();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});
