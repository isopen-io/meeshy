/**
 * Service WebSocket Simplifié pour Meeshy
 * 
 * PRINCIPE SIMPLE:
 * 1. Connexion globale dès qu'on a une session (auth ou anonyme)
 * 2. Join conversation quand on est sur une page de conversation
 * 3. Leave conversation quand on change de page/conversation
 * 4. Reconnexion automatique
 * 
 * APPROCHE UNIFORME: Même logique partout (/, /chat, /conversations)
 */

'use client';

import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import type {
  Message,
  User,
  ServerToClientEvents,
  ClientToServerEvents,
  TranslationEvent,
  TypingEvent,
  UserStatusEvent
} from '@/types';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { authManager } from './auth-manager.service';

class WebSocketService {
  private static instance: WebSocketService | null = null;
  
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private isAuthenticated = false;
  
  // Listeners
  private messageListeners: Set<(message: Message) => void> = new Set();
  private editListeners: Set<(message: Message) => void> = new Set();
  private deleteListeners: Set<(messageId: string) => void> = new Set();
  private translationListeners: Set<(data: TranslationEvent) => void> = new Set();
  private typingListeners: Set<(event: TypingEvent) => void> = new Set();
  private statusListeners: Set<(event: UserStatusEvent) => void> = new Set();

  private constructor() {
    // Initialisation au chargement si token disponible
    if (typeof window !== 'undefined') {
      setTimeout(() => this.autoConnect(), 100);
    }
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * ÉTAPE 1: Connexion automatique si token disponible
   * → Connexion globale pour toute la plateforme
   */
  private autoConnect(): void {
    const authToken = authManager.getAuthToken();
    const sessionToken = authManager.getAnonymousSession()?.token;
    
    if (!authToken && !sessionToken) {
      return;
    }
    
    if (this.socket?.connected) {
      return;
    }
    
    this.connect();
  }

  /**
   * ÉTAPE 2: Créer et connecter le socket
   */
  private connect(): void {
    const authToken = authManager.getAuthToken();
    const sessionToken = authManager.getAnonymousSession()?.token;
    
    
    // Déterminer l'URL du gateway depuis les variables d'environnement
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';
    
    // Préparer auth
    const auth: any = {};
    if (authToken) {
      auth.authToken = authToken;
      auth.tokenType = 'jwt';
    }
    if (sessionToken) {
      auth.sessionToken = sessionToken;
      auth.sessionType = 'anonymous';
    }
    
    // Créer socket SANS auto-connect
    this.socket = io(wsUrl, {
      auth,
      transports: ['websocket', 'polling'],
      reconnection: true,
      autoConnect: false,
      path: '/socket.io/'
    });
    
    // Configurer listeners AVANT de connecter
    this.setupListeners();
    
    // Connecter
    this.socket.connect();
  }

  /**
   * ÉTAPE 3: Configurer les listeners
   */
  private setupListeners(): void {
    if (!this.socket) return;
    
    // Connexion
    this.socket.on('connect', () => {
      // Connexion établie
    });
    
    // Authentification
    this.socket.on(SERVER_EVENTS.AUTHENTICATED, (response: any) => {
      if (response?.success) {
        this.isAuthenticated = true;
        toast.success('Connexion établie');
      } else {
        console.error('❌ [WS] Auth échouée:', response?.error);
        toast.error('Échec authentification');
      }
    });
    
    // Déconnexion
    this.socket.on('disconnect', (reason) => {
      this.isAuthenticated = false;
      
      // Reconnexion auto après 2s
      if (reason !== 'io client disconnect') {
        setTimeout(() => this.reconnect(), 2000);
      }
    });
    
    // Nouveaux messages
    this.socket.on(SERVER_EVENTS.MESSAGE_NEW, (socketMessage: any) => {
      const message = this.convertToMessage(socketMessage);
      this.messageListeners.forEach(listener => listener(message));
    });
    
    // Messages édités
    this.socket.on(SERVER_EVENTS.MESSAGE_EDITED, (socketMessage: any) => {
      const message = this.convertToMessage(socketMessage);
      this.editListeners.forEach(listener => listener(message));
    });
    
    // Messages supprimés
    this.socket.on(SERVER_EVENTS.MESSAGE_DELETED, (data: any) => {
      this.deleteListeners.forEach(listener => listener(data.messageId));
    });
    
    // Traductions
    this.socket.on(SERVER_EVENTS.MESSAGE_TRANSLATION, (data: any) => {
      this.translationListeners.forEach(listener => listener(data));
    });
    
    // Frappe
    this.socket.on(SERVER_EVENTS.TYPING_START, (event: TypingEvent) => {
      this.typingListeners.forEach(listener => listener({ ...event, isTyping: true } as any));
    });
    
    this.socket.on(SERVER_EVENTS.TYPING_STOP, (event: TypingEvent) => {
      this.typingListeners.forEach(listener => listener({ ...event, isTyping: false } as any));
    });
    
    // Statut utilisateurs
    this.socket.on(SERVER_EVENTS.USER_STATUS, (event: UserStatusEvent) => {
      this.statusListeners.forEach(listener => listener(event));
    });
    
    // Erreurs
    this.socket.on(SERVER_EVENTS.ERROR, (error: any) => {
      console.error('❌ [WS] Erreur:', error);
    });
  }

  /**
   * Convertit un message Socket.IO en Message standard
   */
  private convertToMessage(socketMessage: any): Message {
    return {
      id: socketMessage.id,
      conversationId: socketMessage.conversationId,
      senderId: socketMessage.senderId || socketMessage.anonymousSenderId || '',
      content: socketMessage.content,
      originalLanguage: socketMessage.originalLanguage || 'fr',
      messageType: socketMessage.messageType || 'text',
      timestamp: socketMessage.createdAt,
      createdAt: socketMessage.createdAt,
      updatedAt: socketMessage.updatedAt,
      isEdited: socketMessage.isEdited || false,
      isDeleted: socketMessage.isDeleted || false,
      translations: socketMessage.translations || [],
      replyToId: socketMessage.replyToId,
      sender: socketMessage.sender || socketMessage.anonymousSender,
      anonymousSenderId: socketMessage.anonymousSenderId
    } as Message;
  }

  /**
   * ÉTAPE 4: Rejoindre une conversation
   * → Appelé quand on arrive sur une page de conversation
   */
  public joinConversation(conversationId: string): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ [WS] Socket non connecté, join impossible');
      return;
    }
    
    this.socket.emit(CLIENT_EVENTS.CONVERSATION_JOIN, { conversationId });
  }

  /**
   * ÉTAPE 5: Quitter une conversation
   * → Appelé quand on quitte la page de conversation
   */
  public leaveConversation(conversationId: string): void {
    if (!this.socket?.connected) {
      return;
    }
    
    this.socket.emit(CLIENT_EVENTS.CONVERSATION_LEAVE, { conversationId });
  }

  /**
   * ÉTAPE 6: Envoyer un message
   */
  public async sendMessage(conversationId: string, content: string, language: string, replyToId?: string): Promise<boolean> {
    if (!this.socket?.connected) {
      console.error('❌ [WS] Socket non connecté');
      toast.error('Connexion perdue, reconnexion...');
      this.reconnect();
      return false;
    }
    
    return new Promise((resolve) => {
      
      const timeout = setTimeout(() => {
        console.error('❌ [WS] Timeout envoi message');
        resolve(false);
      }, 10000);
      
      this.socket!.emit(CLIENT_EVENTS.MESSAGE_SEND, {
        conversationId,
        content,
        originalLanguage: language,
        replyToId
      }, (response: any) => {
        clearTimeout(timeout);
        
        if (response?.success) {
          resolve(true);
        } else {
          console.error('❌ [WS] Échec envoi:', response?.error);
          toast.error(response?.error || 'Échec envoi message');
          resolve(false);
        }
      });
    });
  }

  /**
   * Envoyer un message avec attachments
   */
  public async sendMessageWithAttachments(
    conversationId: string, 
    content: string, 
    attachmentIds: string[],
    language: string, 
    replyToId?: string
  ): Promise<boolean> {
    if (!this.socket?.connected) {
      console.error('❌ [WS] Socket non connecté');
      toast.error('Connexion perdue');
      this.reconnect();
      return false;
    }
    
    return new Promise((resolve) => {
      
      this.socket!.emit(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS, {
        conversationId,
        content,
        attachmentIds,
        originalLanguage: language,
        replyToId
      }, (response: any) => {
        if (response?.success) {
          resolve(true);
        } else {
          console.error('❌ [WS] Échec envoi attachments:', response?.error);
          toast.error(response?.error || 'Échec envoi');
          resolve(false);
        }
      });
    });
  }

  /**
   * Éditer un message
   */
  public async editMessage(messageId: string, content: string): Promise<boolean> {
    if (!this.socket?.connected) {
      console.error('❌ [WS] Socket non connecté');
      return false;
    }
    
    return new Promise((resolve) => {
      this.socket!.emit(CLIENT_EVENTS.MESSAGE_EDIT, { messageId, content }, (response: any) => {
        if (response?.success) {
          resolve(true);
        } else {
          console.error('❌ [WS] Échec édition:', response?.error);
          toast.error(response?.error || 'Échec édition');
          resolve(false);
        }
      });
    });
  }

  /**
   * Supprimer un message
   */
  public async deleteMessage(messageId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      console.error('❌ [WS] Socket non connecté');
      return false;
    }
    
    return new Promise((resolve) => {
      this.socket!.emit(CLIENT_EVENTS.MESSAGE_DELETE, { messageId }, (response: any) => {
        if (response?.success) {
          resolve(true);
        } else {
          console.error('❌ [WS] Échec suppression:', response?.error);
          toast.error(response?.error || 'Échec suppression');
          resolve(false);
        }
      });
    });
  }

  /**
   * ÉTAPE 7: Reconnexion
   */
  public reconnect(): void {
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    
    this.isAuthenticated = false;
    this.connect();
  }

  /**
   * ÉTAPE 8: Frappe
   */
  public startTyping(conversationId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(CLIENT_EVENTS.TYPING_START, { conversationId });
  }

  public stopTyping(conversationId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(CLIENT_EVENTS.TYPING_STOP, { conversationId });
  }

  /**
   * ÉTAPE 9: Listeners
   */
  public onNewMessage(listener: (message: Message) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onMessageEdited(listener: (message: Message) => void): () => void {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  public onMessageDeleted(listener: (messageId: string) => void): () => void {
    this.deleteListeners.add(listener);
    return () => this.deleteListeners.delete(listener);
  }

  public onTranslation(listener: (data: TranslationEvent) => void): () => void {
    this.translationListeners.add(listener);
    return () => this.translationListeners.delete(listener);
  }

  public onTyping(listener: (event: TypingEvent) => void): () => void {
    this.typingListeners.add(listener);
    return () => this.typingListeners.delete(listener);
  }

  public onUserStatus(listener: (event: UserStatusEvent) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * ÉTAPE 10: État
   */
  public isConnected(): boolean {
    return this.socket?.connected === true && this.isAuthenticated;
  }

  public getConnectionStatus() {
    return {
      isConnected: this.isConnected(),
      socketId: this.socket?.id,
      authenticated: this.isAuthenticated
    };
  }

  /**
   * Diagnostics de connexion (compatibilité)
   */
  public getDiagnostics() {
    return {
      isConnected: this.isConnected(),
      hasSocket: !!this.socket,
      socketId: this.socket?.id,
      authenticated: this.isAuthenticated,
      socketConnected: this.socket?.connected,
      transport: (this.socket as any)?.io?.engine?.transport?.name,
      url: this.socket ? (this.socket as any).io?.uri : 'N/A',
      listenersCount: {
        message: this.messageListeners.size,
        edit: this.editListeners.size,
        delete: this.deleteListeners.size,
        translation: this.translationListeners.size,
        typing: this.typingListeners.size,
        status: this.statusListeners.size
      }
    };
  }
}

// Export singleton
export const webSocketService = WebSocketService.getInstance();

