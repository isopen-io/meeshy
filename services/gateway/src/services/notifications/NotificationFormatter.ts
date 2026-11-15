/**
 * NotificationFormatter - Formatage pour API responses
 *
 * Simple et direct car la structure DB correspond déjà à l'interface.
 * Pas de mapping complexe nécessaire.
 */

import type { Prisma } from '@meeshy/shared/prisma/client';
import type {
  Notification,
  NotificationActor,
  NotificationContext,
  NotificationDelivery,
  NotificationMetadata,
} from '@meeshy/shared/types/notification';
import { encodeCursor } from '../../utils/keyset-cursor.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'NotificationFormatter' });

/**
 * La forme brute que ce formateur sait lire — un sous-ensemble du modèle
 * Prisma `Notification` généré, plutôt que le modèle entier : les tests
 * unitaires (et certains appelants) construisent des fixtures sans `title`,
 * `subtitle` ni `messageId`, absents plutôt que `null` — ce que le modèle
 * généré n'autorise pas (chaque champ scalaire y est requis, même nullable).
 */
type RawNotificationInput = {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly priority?: string | null;
  readonly title?: string | null;
  readonly subtitle?: string | null;
  readonly content: string;
  readonly actor?: Prisma.JsonValue | null;
  readonly context?: Prisma.JsonValue | null;
  readonly metadata?: Prisma.JsonValue | null;
  readonly isRead?: boolean;
  readonly readAt?: DateLike;
  readonly createdAt?: DateLike;
  readonly expiresAt?: DateLike;
  readonly delivery?: Prisma.JsonValue | null;
};

/** Les formes qu'une date brute (DB, JSON désérialisé) peut effectivement prendre. */
type DateLike = Date | string | number | null | undefined;

/**
 * La forme qu'une PAGE de notifications doit satisfaire pour être paginée :
 * la pagination par curseur lit `createdAt`/`id` de la DERNIÈRE ligne pour
 * offrir une suite (`nextCursorFrom` → `encodeCursor`), qui exige une date
 * exploitable — là où `formatNotification` seul tolère l'absence
 * (`sanitizeDate` y a un repli vers `defaultValue`).
 */
type RawNotificationRow = RawNotificationInput & {
  readonly createdAt: Date | string;
};

export class NotificationFormatter {
  /**
   * Sanitize une date pour éviter "Invalid time value"
   * Retourne la date valide ou la valeur par défaut
   */
  private static sanitizeDate(value: DateLike, defaultValue: Date | null = null): Date | null {
    // Cas 1: valeur null/undefined/false/empty
    if (!value) return defaultValue;

    try {
      // Cas 2: déjà un objet Date (vérifier qu'il est valide)
      if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          logger.warn('Invalid Date object detected', {
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
        logger.warn('Invalid date value detected', {
          value,
          valueType: typeof value,
          defaultValue
        });
        return defaultValue;
      }

      return date;
    } catch (error) {
      logger.error('Error sanitizing date', {
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
  static formatNotification(raw: RawNotificationInput): Notification {
    return {
      // CORE
      id: raw.id,
      userId: raw.userId,
      type: raw.type,
      priority: raw.priority || 'normal',

      // CONTENT — title/subtitle localisés & persistés côté serveur (source unique)
      title: raw.title ?? null,
      subtitle: raw.subtitle ?? null,
      content: raw.content,

      // ACTOR — Json Prisma, forme validée en amont par le producteur (cf.
      // doc-comment `NotificationActor`) ; passage par `unknown` requis, le
      // type Json n'ayant structurellement aucun recouvrement avec le domaine.
      actor: (raw.actor || undefined) as unknown as NotificationActor | undefined,

      // CONTEXT (Json Prisma)
      context: (raw.context || {}) as unknown as NotificationContext,

      // METADATA (Json Prisma)
      metadata: (raw.metadata || {}) as unknown as NotificationMetadata,

      // STATE - avec sanitization des dates - PAS de fallback new Date() !
      state: {
        isRead: raw.isRead ?? false,
        readAt: this.sanitizeDate(raw.readAt, null),
        createdAt: this.sanitizeDate(raw.createdAt, null)!,
        expiresAt: this.sanitizeDate(raw.expiresAt, null) || undefined,
      },

      // DELIVERY (Json Prisma)
      delivery: (raw.delivery || { emailSent: false, pushSent: false }) as unknown as NotificationDelivery,
    };
  }

  /**
   * Formate une liste de notifications
   */
  static formatNotifications(rawList: readonly RawNotificationInput[]): Notification[] {
    return rawList.map((raw) => this.formatNotification(raw));
  }

  /**
   * L'ancre de reprise d'une page : sa DERNIÈRE ligne servie.
   *
   * `null` dès qu'il n'y a plus de suite — un curseur rendu sur une page finale
   * invite le client à un aller-retour qui ne peut rien rapporter.
   */
  private static nextCursorFrom(rows: readonly RawNotificationRow[], hasMore: boolean): string | null {
    const last = rows[rows.length - 1];
    return hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  }

  /**
   * Formate une réponse paginée par OFFSET.
   *
   * Rend malgré tout `nextCursor` : c'est ainsi qu'un client démarre sur la
   * page 1 (dont il veut le `total` pour son en-tête) puis passe au curseur
   * pour la suite, sans jamais avoir à demander deux fois la même page.
   */
  static formatPaginatedResponse(params: {
    notifications: readonly RawNotificationRow[];
    total: number;
    offset: number;
    limit: number;
    unreadCount: number;
  }) {
    const hasMore = params.offset + params.notifications.length < params.total;

    return {
      success: true,
      data: this.formatNotifications(params.notifications),
      pagination: {
        total: params.total,
        offset: params.offset,
        limit: params.limit,
        hasMore,
        nextCursor: this.nextCursorFrom(params.notifications, hasMore),
      },
      unreadCount: params.unreadCount,
    };
  }

  /**
   * Formate une réponse paginée par CURSEUR keyset.
   *
   * Ni `total` ni `offset` : la fenêtre n'est plus un rang dans une liste — la
   * question « combien en tout » n'a pas à être reposée à chaque page, et
   * l'offset d'une inbox qui reçoit pendant qu'on la lit est un rang périmé
   * (une ligne insérée décale toutes les suivantes : la page suivante re-sert
   * la dernière ligne déjà vue et saute la première jamais vue).
   *
   * `hasMore` est DIT par la ligne sonde (`take: limit + 1`), pas déduit d'un
   * compte — c'est ce qui retire le `count()` du chemin de chaque page.
   */
  static formatCursorPaginatedResponse(params: {
    notifications: readonly RawNotificationRow[];
    limit: number;
    hasMore: boolean;
    unreadCount: number;
  }) {
    return {
      success: true,
      data: this.formatNotifications(params.notifications),
      pagination: {
        limit: params.limit,
        hasMore: params.hasMore,
        nextCursor: this.nextCursorFrom(params.notifications, params.hasMore),
      },
      unreadCount: params.unreadCount,
    };
  }

  /**
   * Formate pour Socket.IO (même structure que API)
   */
  static formatForSocket(raw: RawNotificationInput): Notification {
    return this.formatNotification(raw);
  }
}
