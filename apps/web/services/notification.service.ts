/**
 * Service de gestion des notifications
 * Centralise toutes les notifications (messages, système, etc.)
 */

import { io, Socket } from 'socket.io-client';
import { APP_CONFIG, API_CONFIG } from '@/lib/config';

import type { Attachment } from '@meeshy/shared/types/attachment';

export interface Notification {
  id: string;
  type: 'message' | 'system' | 'user_action' | 'conversation' | 'translation' | 'new_message' | 'missed_call' | 'new_conversation';
  title: string;
  message: string;
  data?: any;
  conversationId?: string;
  conversationType?: string;
  conversationTitle?: string;
  messageId?: string;
  callSessionId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  senderAvatar?: string;
  messagePreview?: string;
  attachments?: Attachment[];
  timestamp: Date;
  isRead: boolean;
  translations?: {
    fr?: string;
    en?: string;
    es?: string;
  };
}

export interface NotificationCounts {
  total: number;
  unread: number;
  byType: {
    message: number;
    system: number;
    user_action: number;
    conversation: number;
    translation: number;
  };
}

export interface NotificationServiceConfig {
  token: string;
  userId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onNotificationReceived?: (notification: Notification) => void;
  onCountsUpdated?: (counts: NotificationCounts) => void;
}

export class NotificationService {
  private static instance: NotificationService;
  private socket: Socket | null = null;
  private isConnected = false;
  private isInitializing = false; // Prevent race conditions
  private config: NotificationServiceConfig | null = null;
  private notifications: Map<string, Notification> = new Map();
  private readonly MAX_NOTIFICATIONS = 500; // Prevent unbounded growth
  private counts: NotificationCounts = {
    total: 0,
    unread: 0,
    byType: {
      message: 0,
      system: 0,
      user_action: 0,
      conversation: 0,
      translation: 0
    }
  };

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Charge les notifications initiales depuis l'API
   */
  private async loadInitialNotifications(token: string): Promise<void> {
    try {
      console.log('📥 Chargement des notifications initiales...');

      const response = await fetch(`${API_CONFIG.getApiUrl()}/notifications?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erreur HTTP lors du chargement des notifications:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });

        // Continue initialization even if loading fails (will use Socket.IO notifications)
        console.warn('⚠️ Continuant sans notifications initiales - les nouvelles notifications seront reçues via Socket.IO');
        return;
      }

      const data = await response.json();

      if (data.success && data.data && data.data.notifications) {
        // Charger les notifications dans le Map
        data.data.notifications.forEach((notif: any) => {
          // Parser le champ data s'il est stocké en JSON
          let parsedData = notif.data;
          if (typeof notif.data === 'string') {
            try {
              parsedData = JSON.parse(notif.data);
            } catch (e) {
              console.error('❌ Erreur parsing notification data:', e);
              parsedData = null;
            }
          }

          console.log('📥 Notification chargée depuis API:', {
            id: notif.id,
            conversationId: notif.conversationId,
            rawData: notif.data,
            parsedData,
            conversationType: parsedData?.conversationType,
            conversationTitle: parsedData?.conversationTitle
          });

          const notification: Notification = {
            id: notif.id,
            type: notif.type,
            title: notif.title,
            message: notif.content || notif.message || '',
            conversationId: notif.conversationId,
            conversationType: parsedData?.conversationType,
            conversationTitle: parsedData?.conversationTitle,
            messageId: notif.messageId,
            callSessionId: notif.callSessionId,
            senderId: notif.senderId,
            senderUsername: notif.senderUsername,
            senderAvatar: notif.senderAvatar,
            messagePreview: notif.messagePreview,
            attachments: notif.message?.attachments || [],
            timestamp: new Date(notif.createdAt),
            isRead: notif.isRead || false,
            data: parsedData
          };
          this.notifications.set(notification.id, notification);
        });

        // Mettre à jour les compteurs
        this.updateCountsFromNotifications();

        console.log(`✅ ${data.data.notifications.length} notifications chargées (${data.data.unreadCount} non lues)`);
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des notifications initiales:', error);
    }
  }

  /**
   * Initialise le service de notifications
   */
  public async initialize(config: NotificationServiceConfig): Promise<void> {
    // Prevent race conditions - check if already connected or initializing
    if (this.isConnected || this.isInitializing) {
      console.log('🔔 Service de notifications déjà initialisé ou en cours d\'initialisation');
      return;
    }

    this.isInitializing = true;
    this.config = config;

    try {
      // Disconnect any existing socket first
      if (this.socket) {
        this.cleanupSocket();
      }

      // Charger les notifications initiales depuis l'API
      await this.loadInitialNotifications(config.token);

      this.socket = io(APP_CONFIG.getBackendUrl(), {
        auth: { token: config.token },
        transports: ['websocket', 'polling'], // Permettre polling comme fallback
        autoConnect: true,
        timeout: 30000, // 30 secondes au lieu de 20 par défaut
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.setupEventListeners();

      console.log('🔔 Service de notifications initialisé');
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation du service de notifications:', error);
      config.onError?.(error as Error);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Configure les écouteurs d'événements
   */
  private setupEventListeners(): void {
    if (!this.socket || !this.config) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.config?.onConnect?.();
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.config?.onDisconnect?.();
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('❌ Erreur de connexion aux notifications:', error);
      this.config?.onError?.(error);
    });

    // Événement générique pour toutes les notifications (nouveau système)
    this.socket.on('notification', (data: any) => {
      this.handleGenericNotification(data);
    });

    // Événement pour les notifications de messages
    this.socket.on('newMessageNotification', (data: any) => {
      this.handleMessageNotification(data);
    });

    // Événement pour les notifications système
    this.socket.on('systemNotification', (data: any) => {
      this.handleSystemNotification(data);
    });

    // Événement pour les notifications de conversation
    this.socket.on('conversationNotification', (data: any) => {
      this.handleConversationNotification(data);
    });

    // Événement pour les notifications de traduction
    this.socket.on('translationNotification', (data: any) => {
      this.handleTranslationNotification(data);
    });

    // Événement pour les mises à jour de compteurs
    this.socket.on('notificationCountsUpdate', (data: any) => {
      this.updateCounts(data);
    });
  }

  /**
   * Traite une notification générique (nouveau système avec avatar et preview)
   */
  private handleGenericNotification(data: any): void {
    console.log('🔔 Notification reçue via Socket.IO:', {
      id: data.id,
      type: data.type,
      conversationId: data.conversationId,
      dataObject: data.data,
      conversationType: data.data?.conversationType,
      conversationTitle: data.data?.conversationTitle
    });

    const notification: Notification = {
      id: data.id,
      type: data.type,
      title: data.title,
      message: data.content || data.message,
      data: data.data,
      conversationId: data.conversationId,
      conversationType: data.data?.conversationType,
      conversationTitle: data.data?.conversationTitle,
      messageId: data.messageId,
      callSessionId: data.callSessionId,
      senderId: data.senderId,
      senderName: data.senderUsername,
      senderUsername: data.senderUsername,
      senderAvatar: data.senderAvatar,
      messagePreview: data.messagePreview,
      attachments: data.message?.attachments || data.attachments || [],
      timestamp: new Date(data.createdAt || Date.now()),
      isRead: data.isRead || false,
      translations: data.translations
    };

    this.addNotification(notification);
  }

  /**
   * Traite une notification de message
   */
  private handleMessageNotification(data: any): void {
    const notification: Notification = {
      id: `msg-${data.messageId}`,
      type: 'message',
      title: this.getNotificationTitle('message', data.conversationType, data.senderName),
      message: this.buildMultilingualMessage(data.content, data.translations),
      data: {
        messageId: data.messageId,
        conversationId: data.conversationId,
        conversationType: data.conversationType,
        senderId: data.senderId,
        senderName: data.senderName,
        content: data.content,
        translations: data.translations
      },
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderName: data.senderName,
      timestamp: new Date(data.timestamp),
      isRead: false,
      translations: data.translations
    };

    this.addNotification(notification);
  }

  /**
   * Traite une notification système
   */
  private handleSystemNotification(data: any): void {
    const notification: Notification = {
      id: `sys-${Date.now()}`,
      type: 'system',
      title: data.title || 'Notification système',
      message: data.message || '',
      data: data,
      timestamp: new Date(),
      isRead: false
    };

    this.addNotification(notification);
  }

  /**
   * Traite une notification de conversation
   */
  private handleConversationNotification(data: any): void {
    const notification: Notification = {
      id: `conv-${data.conversationId}-${data.type}`,
      type: 'conversation',
      title: this.getConversationNotificationTitle(data),
      message: data.message || '',
      data: data,
      conversationId: data.conversationId,
      timestamp: new Date(),
      isRead: false
    };

    this.addNotification(notification);
  }

  /**
   * Traite une notification de traduction
   */
  private handleTranslationNotification(data: any): void {
    const notification: Notification = {
      id: `trans-${data.messageId}`,
      type: 'translation',
      title: 'Traduction disponible',
      message: this.buildMultilingualMessage(data.content, data.translations),
      data: data,
      conversationId: data.conversationId,
      timestamp: new Date(),
      isRead: false,
      translations: data.translations
    };

    this.addNotification(notification);
  }

  /**
   * Ajoute une notification et met à jour les compteurs
   * Implémente une éviction LRU pour éviter la croissance illimitée
   */
  private addNotification(notification: Notification): void {
    this.notifications.set(notification.id, notification);

    // LRU eviction: if we exceed MAX_NOTIFICATIONS, remove oldest read notifications
    if (this.notifications.size > this.MAX_NOTIFICATIONS) {
      const notificationsArray = Array.from(this.notifications.values());

      // Sort by: read first (prioritize removing read), then by oldest timestamp
      const sorted = notificationsArray.sort((a, b) => {
        // Read notifications first
        if (a.isRead !== b.isRead) {
          return a.isRead ? -1 : 1;
        }
        // Then by oldest timestamp
        return a.timestamp.getTime() - b.timestamp.getTime();
      });

      // Calculate how many to remove (20% of MAX for batch efficiency)
      const toRemoveCount = Math.ceil(this.MAX_NOTIFICATIONS * 0.2);

      // Remove oldest notifications
      for (let i = 0; i < toRemoveCount && i < sorted.length; i++) {
        this.notifications.delete(sorted[i].id);
      }

      console.log(`🗑️ Éviction LRU: ${toRemoveCount} anciennes notifications supprimées`);
    }

    this.updateCountsFromNotifications();
    this.config?.onNotificationReceived?.(notification);

    // DEPRECATED: Les toasts sont maintenant gérés par le système V2
    // via use-notifications-v2.tsx avec NotificationV2 et i18n
    // Cette ligne est commentée pour éviter les doublons de toasts
    // if (!notification.isRead && typeof window !== 'undefined') {
    //   showNotificationToast(notification);
    // }
  }

  /**
   * Met à jour les compteurs à partir des notifications
   */
  private updateCountsFromNotifications(): void {
    const notifications = Array.from(this.notifications.values());

    this.counts = {
      total: notifications.length,
      unread: notifications.filter(n => !n.isRead).length,
      byType: {
        message: notifications.filter(n => n.type === 'message' || n.type === 'new_message').length,
        system: notifications.filter(n => n.type === 'system' || n.type === 'missed_call').length,
        user_action: notifications.filter(n => n.type === 'user_action').length,
        conversation: notifications.filter(n => n.type === 'conversation' || n.type === 'new_conversation').length,
        translation: notifications.filter(n => n.type === 'translation').length
      }
    };

    this.config?.onCountsUpdated?.(this.counts);
  }

  /**
   * Met à jour les compteurs depuis le serveur
   */
  private updateCounts(data: any): void {
    this.counts = data;
    this.config?.onCountsUpdated?.(this.counts);
  }

  /**
   * Construit un message multilingue
   */
  private buildMultilingualMessage(content: string, translations?: any): string {
    const baseMessage = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    
    if (translations && (translations.fr || translations.en || translations.es)) {
      const messages = [];
      
      messages.push(`🇫🇷 ${baseMessage}`);
      
      if (translations.en) {
        const enMessage = translations.en.substring(0, 30) + (translations.en.length > 30 ? '...' : '');
        messages.push(`🇺🇸 ${enMessage}`);
      }
      
      if (translations.es) {
        const esMessage = translations.es.substring(0, 30) + (translations.es.length > 30 ? '...' : '');
        messages.push(`🇪🇸 ${esMessage}`);
      }
      
      return messages.join('\n');
    }
    
    return baseMessage;
  }

  /**
   * Génère un titre de notification
   */
  private getNotificationTitle(type: string, conversationType: string, senderName: string): string {
    switch (type) {
      case 'message':
        switch (conversationType) {
          case 'direct':
            return `Message direct de ${senderName}`;
          case 'group':
            return `Message de groupe de ${senderName}`;
          case 'public':
            return `Message public de ${senderName}`;
          default:
            return `Nouveau message de ${senderName}`;
        }
      default:
        return 'Nouvelle notification';
    }
  }

  /**
   * Génère un titre de notification de conversation
   */
  private getConversationNotificationTitle(data: any): string {
    switch (data.type) {
      case 'user_joined':
        return `${data.username} a rejoint la conversation`;
      case 'user_left':
        return `${data.username} a quitté la conversation`;
      default:
        return 'Mise à jour de conversation';
    }
  }

  /**
   * Marque une notification comme lue
   */
  public async markAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      console.warn(`⚠️ Notification ${notificationId} introuvable dans la Map locale`);
      return;
    }

    if (notification.isRead) {
      console.log(`ℹ️ Notification ${notificationId} déjà marquée comme lue`);
      return;
    }

    console.log(`📖 Marquage notification ${notificationId} comme lue...`);

    // Synchroniser d'abord avec le backend
    if (this.config?.token) {
      try {
        const response = await fetch(`${API_CONFIG.getApiUrl()}/notifications/${notificationId}/read`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.config.token}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Erreur HTTP ${response.status} lors du marquage:`, errorText);
          return;
        }

        console.log(`✅ Notification ${notificationId} marquée comme lue sur le backend`);
      } catch (error) {
        console.error('❌ Erreur réseau lors de la synchronisation:', error);
        return;
      }
    }

    // Mettre à jour localement après succès backend
    notification.isRead = true;
    this.updateCountsFromNotifications();

    // Notifier les callbacks pour forcer le re-render
    if (this.config?.onCountsUpdated) {
      this.config.onCountsUpdated(this.counts);
    }

    console.log(`✅ Notification ${notificationId} marquée comme lue localement`);
  }

  /**
   * Marque toutes les notifications comme lues
   */
  public async markAllAsRead(): Promise<void> {
    console.log('📖 Marquage de toutes les notifications comme lues...');

    // Synchroniser d'abord avec le backend
    if (this.config?.token) {
      try {
        const response = await fetch(`${API_CONFIG.getApiUrl()}/notifications/read-all`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.config.token}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Erreur HTTP ${response.status} lors du marquage global:`, errorText);
          return;
        }

        console.log('✅ Toutes les notifications marquées comme lues sur le backend');
      } catch (error) {
        console.error('❌ Erreur réseau lors de la synchronisation globale:', error);
        return;
      }
    }

    // Mettre à jour localement après succès backend
    for (const notification of this.notifications.values()) {
      notification.isRead = true;
    }
    this.updateCountsFromNotifications();

    // Notifier les callbacks pour forcer le re-render
    if (this.config?.onCountsUpdated) {
      this.config.onCountsUpdated(this.counts);
    }

    console.log('✅ Toutes les notifications marquées comme lues localement');
  }

  /**
   * Supprime une notification
   */
  public async removeNotification(notificationId: string): Promise<void> {
    this.notifications.delete(notificationId);
    this.updateCountsFromNotifications();

    // Synchroniser avec le backend
    if (this.config?.token) {
      try {
        await fetch(`${API_CONFIG.getApiUrl()}/notifications/${notificationId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('❌ Erreur lors de la suppression de la notification:', error);
      }
    }
  }

  /**
   * Supprime toutes les notifications
   */
  public clearAll(): void {
    this.notifications.clear();
    this.updateCountsFromNotifications();
  }

  /**
   * Obtient toutes les notifications
   */
  public getNotifications(): Notification[] {
    return Array.from(this.notifications.values()).sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Obtient les notifications non lues
   */
  public getUnreadNotifications(): Notification[] {
    return this.getNotifications().filter(n => !n.isRead);
  }

  /**
   * Obtient les compteurs de notifications
   */
  public getCounts(): NotificationCounts {
    return { ...this.counts };
  }

  /**
   * Nettoie les listeners du socket (prévient les memory leaks)
   */
  private cleanupSocket(): void {
    if (this.socket) {
      // Remove all event listeners to prevent memory leaks
      this.socket.removeAllListeners('connect');
      this.socket.removeAllListeners('disconnect');
      this.socket.removeAllListeners('connect_error');
      this.socket.removeAllListeners('notification');
      this.socket.removeAllListeners('newMessageNotification');
      this.socket.removeAllListeners('systemNotification');
      this.socket.removeAllListeners('conversationNotification');
      this.socket.removeAllListeners('translationNotification');
      this.socket.removeAllListeners('notificationCountsUpdate');

      // Disconnect the socket
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Déconnecte le service
   */
  public disconnect(): void {
    if (this.socket) {
      this.cleanupSocket();
      this.isConnected = false;
      this.isInitializing = false;
      this.config = null;
    }
  }

  /**
   * Vérifie si le service est connecté
   */
  public isServiceConnected(): boolean {
    return this.isConnected && this.socket?.connected;
  }
}

// Export de l'instance singleton
export const notificationService = NotificationService.getInstance();

