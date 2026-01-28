/**
 * Singleton pour gérer les notifications Socket.IO
 * Évite les connexions multiples et les notifications en double
 */

import { io, Socket } from 'socket.io-client';
import { APP_CONFIG } from '@/lib/config';
import type { Notification } from '@/types/notification';

type NotificationCallback = (notification: Notification) => void;
type NotificationReadCallback = (notificationId: string) => void;
type NotificationDeletedCallback = (notificationId: string) => void;
type CountsCallback = (counts: any) => void;

class NotificationSocketIOSingleton {
  private socket: Socket | null = null;
  private isConnecting = false;
  private isConnected = false;
  private authToken: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;

  // Callbacks
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private readCallbacks: Set<NotificationReadCallback> = new Set();
  private deletedCallbacks: Set<NotificationDeletedCallback> = new Set();
  private countsCallbacks: Set<CountsCallback> = new Set();
  private connectCallbacks: Set<() => void> = new Set();
  private disconnectCallbacks: Set<(reason: string) => void> = new Set();

  /**
   * Initialise la connexion Socket.IO
   */
  public async connect(token: string): Promise<void> {
    // Si déjà connecté avec le même token, ne rien faire
    if (this.socket?.connected && this.authToken === token) {
      console.log('[NotificationSocketIO] Already connected');
      return;
    }

    // Si connexion en cours, attendre
    if (this.isConnecting) {
      console.log('[NotificationSocketIO] Connection already in progress');
      return;
    }

    // Déconnecter l'ancienne socket si elle existe
    if (this.socket) {
      console.log('[NotificationSocketIO] Disconnecting old socket');
      this.disconnect();
    }

    this.isConnecting = true;
    this.authToken = token;

    console.log('[NotificationSocketIO] Initializing Socket.IO connection...');

    this.socket = io(APP_CONFIG.getBackendUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay
    });

    this.setupEventListeners();
  }

  /**
   * Configure les listeners d'événements
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connexion établie
    this.socket.on('connect', () => {
      console.log('[NotificationSocketIO] Connected');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Notifier tous les callbacks de connexion
      this.connectCallbacks.forEach(cb => cb());
    });

    // Déconnexion
    this.socket.on('disconnect', (reason) => {
      console.warn('[NotificationSocketIO] Disconnected:', reason);
      this.isConnected = false;

      // Notifier tous les callbacks de déconnexion
      this.disconnectCallbacks.forEach(cb => cb(reason));
    });

    // Erreur de connexion
    this.socket.on('connect_error', (error) => {
      console.error('[NotificationSocketIO] Connection error:', error);
      this.reconnectAttempts++;
      this.isConnecting = false;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[NotificationSocketIO] Max reconnection attempts reached');
      }
    });

    // Nouvelle notification (écoute 'notification:new' et 'notification' pour compatibilité)
    const handleNotification = (data: any) => {
      console.log('[NotificationSocketIO] Received notification:', data);

      // Parser la notification avec la nouvelle structure groupée
      const notification: Notification = {
        id: data.id,
        userId: data.userId,
        type: data.type,
        priority: data.priority || 'normal',
        content: data.content,

        // Actor (qui a déclenché)
        actor: data.actor,

        // Context (où c'est arrivé)
        context: data.context || {},

        // Metadata (données type-spécifiques)
        metadata: data.metadata || {},

        // State (statut lecture + dates)
        // IMPORTANT: Le backend envoie isRead, readAt, createdAt à la racine (pas dans state)
        // car ces champs sont à la racine dans le schema Prisma pour performance des indexes
        state: {
          isRead: data.isRead ?? false,
          readAt: data.readAt ? new Date(data.readAt) : null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
        },

        // Delivery (suivi multi-canal)
        delivery: data.delivery || { emailSent: false, pushSent: false }
      };

      // Notifier tous les callbacks
      this.notificationCallbacks.forEach(cb => cb(notification));
    };

    this.socket.on('notification:new', handleNotification);
    this.socket.on('notification', handleNotification); // Legacy support

    // Notification marquée comme lue
    this.socket.on('notification:read', (data: { notificationId: string }) => {
      console.log('[NotificationSocketIO] Notification read:', data.notificationId);
      this.readCallbacks.forEach(cb => cb(data.notificationId));
    });

    // Notification supprimée
    this.socket.on('notification:deleted', (data: { notificationId: string }) => {
      console.log('[NotificationSocketIO] Notification deleted:', data.notificationId);
      this.deletedCallbacks.forEach(cb => cb(data.notificationId));
    });

    // Mise à jour des compteurs
    this.socket.on('notification:counts', (counts: any) => {
      console.log('[NotificationSocketIO] Counts updated:', counts);
      this.countsCallbacks.forEach(cb => cb(counts));
    });
  }

  /**
   * Déconnecte la socket
   */
  public disconnect(): void {
    if (this.socket) {
      console.log('[NotificationSocketIO] Disconnecting...');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.authToken = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Vérifie si la socket est connectée
   */
  public getConnectionStatus(): { isConnected: boolean; isConnecting: boolean } {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting
    };
  }

  /**
   * Enregistre un callback pour les nouvelles notifications
   */
  public onNotification(callback: NotificationCallback): () => void {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour les notifications lues
   */
  public onNotificationRead(callback: NotificationReadCallback): () => void {
    this.readCallbacks.add(callback);
    return () => this.readCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour les notifications supprimées
   */
  public onNotificationDeleted(callback: NotificationDeletedCallback): () => void {
    this.deletedCallbacks.add(callback);
    return () => this.deletedCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour les compteurs
   */
  public onCounts(callback: CountsCallback): () => void {
    this.countsCallbacks.add(callback);
    return () => this.countsCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour la connexion
   */
  public onConnect(callback: () => void): () => void {
    this.connectCallbacks.add(callback);
    return () => this.connectCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour la déconnexion
   */
  public onDisconnect(callback: (reason: string) => void): () => void {
    this.disconnectCallbacks.add(callback);
    return () => this.disconnectCallbacks.delete(callback);
  }

  /**
   * Réinitialise complètement le singleton
   */
  public reset(): void {
    this.disconnect();
    this.notificationCallbacks.clear();
    this.readCallbacks.clear();
    this.deletedCallbacks.clear();
    this.countsCallbacks.clear();
    this.connectCallbacks.clear();
    this.disconnectCallbacks.clear();
  }
}

// Exporter l'instance unique
export const notificationSocketIO = new NotificationSocketIOSingleton();
