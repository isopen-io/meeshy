/**
 * SocketNotificationService - Gestion des notifications temps réel via Socket.IO
 *
 * Responsabilités :
 * - Émettre les notifications via Socket.IO
 * - Gérer le mapping utilisateur -> sockets
 * - Garantir la livraison à tous les clients connectés d'un utilisateur
 */

import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import type { NotificationEventData } from './types';

export class SocketNotificationService {
  private io: SocketIOServer | null = null;
  private userSocketsMap: Map<string, Set<string>> = new Map();

  /**
   * Initialiser le service avec Socket.IO
   */
  setSocketIO(io: SocketIOServer, userSocketsMap: Map<string, Set<string>>): void {
    this.io = io;
    this.userSocketsMap = userSocketsMap;
    logger.info('📢 SocketNotificationService: Socket.IO initialized');
  }

  /**
   * Émettre une notification via Socket.IO
   * CRITICAL: Ne JAMAIS crasher, juste logger et continuer
   */
  emitNotification(userId: string, notification: NotificationEventData): boolean {
    try {
      if (!this.io) {
        logger.warn('⚠️ Socket.IO not initialized, cannot emit notification');
        return false;
      }

      // Récupérer tous les sockets de l'utilisateur
      const userSockets = this.userSocketsMap.get(userId);

      if (!userSockets || userSockets.size === 0) {
        logger.debug('📢 User not connected, notification saved for later', { userId });
        return false;
      }

      // Émettre la notification à tous les sockets de l'utilisateur
      userSockets.forEach(socketId => {
        this.io!.to(socketId).emit('notification', notification);
        logger.debug('📢 Notification emitted to socket', {
          socketId,
          notificationId: notification.id,
          type: notification.type
        });
      });

      logger.info('📢 Notification broadcasted to user', {
        userId,
        socketCount: userSockets.size,
        notificationId: notification.id
      });

      return true;
    } catch (error) {
      logger.error('❌ Error emitting notification via WebSocket:', error);
      return false;
    }
  }

  /**
   * Vérifier si Socket.IO est initialisé
   */
  isInitialized(): boolean {
    return this.io !== null;
  }

  /**
   * Obtenir le nombre de sockets connectés pour un utilisateur
   */
  getUserSocketCount(userId: string): number {
    const userSockets = this.userSocketsMap.get(userId);
    return userSockets ? userSockets.size : 0;
  }
}
