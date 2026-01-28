/**
 * NotificationFormatter - Formatage pour API responses
 *
 * Simple et direct car la structure DB correspond déjà à l'interface.
 * Pas de mapping complexe nécessaire.
 */

import type { Notification } from '@meeshy/shared/types/notification';

export class NotificationFormatter {
  /**
   * Formate une notification brute de la DB vers l'interface Notification
   *
   * IMPORTANT: Pas de génération de title - fait côté frontend
   */
  static formatNotification(raw: any): Notification {
    return {
      // CORE
      id: raw.id,
      userId: raw.userId,
      type: raw.type,
      priority: raw.priority || 'normal',

      // CONTENT
      content: raw.content,

      // ACTOR (cast car Prisma Json type)
      actor: (raw.actor || undefined) as any,

      // CONTEXT (cast car Prisma Json type)
      context: (raw.context || {}) as any,

      // METADATA (cast car Prisma Json type)
      metadata: (raw.metadata || {}) as any,

      // STATE
      state: {
        isRead: raw.isRead ?? false,
        readAt: raw.readAt ? new Date(raw.readAt) : null,
        createdAt: new Date(raw.createdAt),
        expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
      },

      // DELIVERY (cast car Prisma Json type)
      delivery: (raw.delivery || { emailSent: false, pushSent: false }) as any,
    } as any; // Cast global pour compilation avant régénération Prisma
  }

  /**
   * Formate une liste de notifications
   */
  static formatNotifications(rawList: any[]): Notification[] {
    return rawList.map((raw) => this.formatNotification(raw));
  }

  /**
   * Formate une réponse paginée
   */
  static formatPaginatedResponse(params: {
    notifications: any[];
    total: number;
    offset: number;
    limit: number;
    unreadCount: number;
  }) {
    return {
      success: true,
      data: this.formatNotifications(params.notifications),
      pagination: {
        total: params.total,
        offset: params.offset,
        limit: params.limit,
        hasMore: params.offset + params.notifications.length < params.total,
      },
      unreadCount: params.unreadCount,
    };
  }

  /**
   * Formate pour Socket.IO (même structure que API)
   */
  static formatForSocket(raw: any): Notification {
    return this.formatNotification(raw);
  }
}
