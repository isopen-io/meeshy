/**
 * NotificationFormatter - Formatage pour API responses
 *
 * Simple et direct car la structure DB correspond déjà à l'interface.
 * Pas de mapping complexe nécessaire.
 */

import type { Notification } from '@meeshy/shared/types/notification';

export class NotificationFormatter {
  /**
   * Sanitize une date pour éviter "Invalid time value"
   * Retourne la date valide ou la valeur par défaut
   */
  private static sanitizeDate(value: any, defaultValue: Date | null = null): Date | null {
    // Cas 1: valeur null/undefined/false/empty
    if (!value) return defaultValue;

    try {
      // Cas 2: déjà un objet Date (vérifier qu'il est valide)
      if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          console.warn('[NotificationFormatter] Invalid Date object detected', {
            value: value.toString(),
            defaultValue
          });
          return defaultValue;
        }
        return value;
      }

      // Cas 3: convertir en Date et vérifier
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        console.warn('[NotificationFormatter] Invalid date value detected', {
          value,
          valueType: typeof value,
          defaultValue
        });
        return defaultValue;
      }

      return date;
    } catch (error) {
      console.error('[NotificationFormatter] Error sanitizing date', {
        error,
        value,
        defaultValue
      });
      return defaultValue;
    }
  }

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

      // STATE - avec sanitization des dates
      state: {
        isRead: raw.isRead ?? false,
        readAt: this.sanitizeDate(raw.readAt, null),
        createdAt: this.sanitizeDate(raw.createdAt, new Date())!,
        expiresAt: this.sanitizeDate(raw.expiresAt, null) || undefined,
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
