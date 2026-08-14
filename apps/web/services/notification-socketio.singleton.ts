/**
 * Singleton pour gérer les notifications Socket.IO
 * Évite les connexions multiples et les notifications en double
 */

import { io, Socket } from 'socket.io-client';
import { APP_CONFIG } from '@/lib/config';
import {
  SERVER_EVENTS,
  type NotificationDeletedBulkEventData,
  type NotificationReadBulkEventData,
} from '@meeshy/shared/types/socketio-events';
import { initialSyncSeqState, observeSyncSeq, type SyncSeqState } from '@/lib/sync/sync-seq-state';
import { decodeNotificationSocketPayload } from '@/utils/notification-socket-payload';
import type { Notification } from '@/types/notification';

type NotificationCallback = (notification: Notification) => void;
type NotificationReadCallback = (notificationId: string) => void;
type NotificationDeletedCallback = (notificationId: string) => void;
type NotificationReadBulkCallback = (data: NotificationReadBulkEventData) => void;
type NotificationDeletedBulkCallback = (data: NotificationDeletedBulkEventData) => void;
type CountsCallback = (counts: any) => void;

/**
 * Pourquoi le client a perdu de vue l'état serveur :
 * - `gap` : un `_seq` a sauté (events reçus, mais pas tous) ;
 * - `reconnect` : la socket s'est rétablie après une coupure, fenêtre pendant
 *   laquelle AUCUN event n'est arrivé — la détection de gap ne couvre que les
 *   events reçus, elle est donc aveugle à la coupure elle-même.
 */
export type SyncDesyncReason = 'gap' | 'reconnect';
type SyncDesyncCallback = (reason: SyncDesyncReason) => void;

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
  private readBulkCallbacks: Set<NotificationReadBulkCallback> = new Set();
  private deletedBulkCallbacks: Set<NotificationDeletedBulkCallback> = new Set();
  private countsCallbacks: Set<CountsCallback> = new Set();
  private connectCallbacks: Set<() => void> = new Set();
  private disconnectCallbacks: Set<(reason: string) => void> = new Set();
  private desyncCallbacks: Set<SyncDesyncCallback> = new Set();

  // SyncEngine — curseur `_seq` per-user (miroir de `SyncSeqTracker` iOS).
  private syncSeq: SyncSeqState = initialSyncSeqState;
  // Distingue le PREMIER `connect` d'un RE-connect : seul le second prouve une
  // fenêtre aveugle. Au premier, les écrans montent avec `refetchOnMount:
  // 'always'` — resynchroniser en plus ne ferait que doubler le fetch initial.
  private hasConnectedBefore = false;

  /**
   * Initialise la connexion Socket.IO
   */
  public async connect(token: string): Promise<void> {
    // Si déjà connecté avec le même token, ne rien faire
    if (this.socket?.connected && this.authToken === token) {
      return;
    }

    // Si connexion en cours, attendre
    if (this.isConnecting) {
      return;
    }

    // Déconnecter l'ancienne socket si elle existe
    if (this.socket) {
      this.disconnect();
    }

    this.isConnecting = true;
    this.authToken = token;

    const backendUrl = APP_CONFIG.getBackendUrl();

    this.socket = io(backendUrl, {
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
      const isReconnect = this.hasConnectedBefore;
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.hasConnectedBefore = true;

      // Notifier tous les callbacks de connexion
      this.connectCallbacks.forEach(cb => cb());

      // SyncEngine — la coupure a créé une fenêtre aveugle : aucun event n'est
      // arrivé, donc aucun `_seq` n'a pu révéler le trou. Signal inconditionnel.
      if (isReconnect) this.emitDesync('reconnect');
    });

    // Déconnexion
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;

      // Notifier tous les callbacks de déconnexion
      this.disconnectCallbacks.forEach(cb => cb(reason));
    });

    // Erreur de connexion
    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      this.isConnecting = false;
    });

    // Nouvelle notification
    const handleNotification = (data: any) => {
      // SyncEngine — observer le `_seq` AVANT de livrer l'event : un trou prouve
      // que des notifications ont été manquées, et le client web n'a aucune
      // autre voie de rattrapage (`staleTime: Infinity` côté React Query).
      const observed = observeSyncSeq(this.syncSeq, data?._seq);
      this.syncSeq = observed.state;
      if (observed.gap) this.emitDesync('gap');

      const notification = decodeNotificationSocketPayload(data);
      if (!notification) return;

      // Notifier tous les callbacks
      this.notificationCallbacks.forEach(cb => cb(notification));
    };

    this.socket.on(SERVER_EVENTS.NOTIFICATION_NEW, handleNotification);

    // Écouter l'événement d'authentification
    this.socket.on(SERVER_EVENTS.AUTHENTICATED, (data: any) => {
      // Silently handle authentication
    });

    // Écouter les erreurs
    this.socket.on(SERVER_EVENTS.ERROR, (error: any) => {
      // Silently handle errors
    });

    // Notification marquée comme lue
    this.socket.on(SERVER_EVENTS.NOTIFICATION_READ, (data: { notificationId: string }) => {
      this.readCallbacks.forEach(cb => cb(data.notificationId));
    });

    // Lot de notifications marquées lues, décrit par son prédicat : les
    // chemins bulk de la gateway ne renvoient aucun id à égrener.
    this.socket.on(SERVER_EVENTS.NOTIFICATION_READ_BULK, (data: NotificationReadBulkEventData) => {
      this.readBulkCallbacks.forEach(cb => cb(data));
    });

    // Notification supprimée
    this.socket.on(SERVER_EVENTS.NOTIFICATION_DELETED, (data: { notificationId: string }) => {
      this.deletedCallbacks.forEach(cb => cb(data.notificationId));
    });

    // Lot de notifications purgées, décrit par son prédicat : `deleteMany` ne
    // renvoie aucun id, et `notification:counts` est MUET sur cette purge
    // (les lignes qui partent sont déjà lues).
    this.socket.on(SERVER_EVENTS.NOTIFICATION_DELETED_BULK, (data: NotificationDeletedBulkEventData) => {
      this.deletedBulkCallbacks.forEach(cb => cb(data));
    });

    // Mise à jour des compteurs
    this.socket.on(SERVER_EVENTS.NOTIFICATION_COUNTS, (counts: any) => {
      this.countsCallbacks.forEach(cb => cb(counts));
    });
  }

  /**
   * Déconnecte la socket
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.authToken = null;
    this.reconnectAttempts = 0;
    // `_seq` est alloué PAR USER et persiste côté serveur : le curseur d'un
    // compte ne veut rien dire pour le suivant. `disconnect()` n'est appelé que
    // sur un changement de token, un logout ou un `reset()` — la reconnexion
    // automatique de socket.io ne passe pas par ici, et c'est précisément ce
    // qui permet au curseur de survivre à une coupure pour révéler son trou.
    this.syncSeq = initialSyncSeqState;
    this.hasConnectedBefore = false;
  }

  private emitDesync(reason: SyncDesyncReason): void {
    this.desyncCallbacks.forEach(cb => cb(reason));
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
   * Enregistre un callback pour les marquages en masse (`notification:read-bulk`)
   */
  public onNotificationReadBulk(callback: NotificationReadBulkCallback): () => void {
    this.readBulkCallbacks.add(callback);
    return () => this.readBulkCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour les notifications supprimées
   */
  public onNotificationDeleted(callback: NotificationDeletedCallback): () => void {
    this.deletedCallbacks.add(callback);
    return () => this.deletedCallbacks.delete(callback);
  }

  /**
   * Enregistre un callback pour les purges en masse (`notification:deleted-bulk`)
   */
  public onNotificationDeletedBulk(callback: NotificationDeletedBulkCallback): () => void {
    this.deletedBulkCallbacks.add(callback);
    return () => this.deletedBulkCallbacks.delete(callback);
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
   * SyncEngine — s'abonne aux pertes de synchronisation détectées par le
   * transport (trou de `_seq`, ou reconnexion après coupure). Le transport
   * SIGNALE ; la décision « quoi refetch » vit côté consommateur, miroir du
   * découpage SDK/app iOS (`SyncSeqTracker.gapDetected` →
   * `NotificationGapResyncCoordinator`).
   */
  public onSyncDesync(callback: SyncDesyncCallback): () => void {
    this.desyncCallbacks.add(callback);
    return () => this.desyncCallbacks.delete(callback);
  }

  /**
   * Réinitialise complètement le singleton
   */
  public reset(): void {
    this.disconnect();
    this.desyncCallbacks.clear();
    this.notificationCallbacks.clear();
    this.readCallbacks.clear();
    this.readBulkCallbacks.clear();
    this.deletedCallbacks.clear();
    this.countsCallbacks.clear();
    this.connectCallbacks.clear();
    this.disconnectCallbacks.clear();
  }
}

// Exporter l'instance unique
export const notificationSocketIO = new NotificationSocketIOSingleton();
