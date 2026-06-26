/**
 * FirebaseNotificationService - Gestion des notifications push Firebase
 *
 * Responsabilités :
 * - Vérifier la disponibilité de Firebase Admin SDK
 * - Envoyer des notifications push via Firebase Cloud Messaging
 * - Gérer les erreurs de manière gracieuse sans crasher l'application
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import type { NotificationEventData } from './types';

// Firebase Admin SDK (optionnel)
let admin: any = null;
let firebaseInitialized = false;

try {
  admin = require('firebase-admin');
} catch (error) {
  logger.warn('[Notifications] firebase-admin not installed - Push notifications disabled');
  logger.warn('[Notifications] Install with: npm install firebase-admin');
}

/**
 * Vérifie et initialise Firebase Admin SDK
 */
export class FirebaseStatusChecker {
  private static firebaseAvailable = false;
  private static checked = false;

  /**
   * Vérifie si Firebase Admin SDK est disponible et configuré
   * CRITICAL: Cette vérification ne doit JAMAIS crasher l'application
   */
  static checkFirebase(): boolean {
    if (this.checked) {
      return this.firebaseAvailable;
    }

    this.checked = true;

    try {
      // 1. Vérifier que le module firebase-admin est installé
      if (!admin) {
        logger.warn('[Notifications] Firebase Admin SDK not installed');
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 2. Vérifier la variable d'environnement
      const credPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
      if (!credPath) {
        logger.warn('[Notifications] FIREBASE_ADMIN_CREDENTIALS_PATH not configured');
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 3. Vérifier que le fichier de credentials existe
      if (!fs.existsSync(credPath)) {
        logger.warn(`[Notifications] Firebase credentials file not found: ${credPath}`);
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 4. Vérifier que le fichier est lisible et valide JSON
      try {
        const credContent = fs.readFileSync(credPath, 'utf8');
        JSON.parse(credContent);
      } catch (parseError) {
        logger.error('[Notifications] Firebase credentials file is invalid JSON:', parseError);
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 5. Initialiser Firebase Admin SDK
      try {
        if (!firebaseInitialized) {
          admin.initializeApp({
            credential: admin.credential.cert(credPath)
          });
          firebaseInitialized = true;
        }

        this.firebaseAvailable = true;
        logger.info('[Notifications] ✅ Firebase Admin SDK initialized successfully');
        logger.info('[Notifications] → Push notifications ENABLED (WebSocket + Firebase)');
        return true;

      } catch (initError) {
        logger.error('[Notifications] Firebase initialization failed:', initError);
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

    } catch (error) {
      logger.error('[Notifications] Unexpected error during Firebase check:', error);
      logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
      this.firebaseAvailable = false;
      return false;
    }
  }

  /**
   * Vérifie si Firebase est disponible (sans réinitialiser)
   */
  static isFirebaseAvailable(): boolean {
    if (!this.checked) {
      this.checkFirebase();
    }
    return this.firebaseAvailable;
  }
}

/**
 * Service d'envoi de notifications push Firebase
 */
export class FirebaseNotificationService {
  constructor(private prisma: PrismaClient) {
    // Vérifier Firebase au démarrage
    FirebaseStatusChecker.checkFirebase();
  }

  /**
   * Envoyer une notification push Firebase (avec fallback gracieux)
   * CRITICAL: Ne JAMAIS crasher si Firebase échoue
   */
  async sendPushNotification(
    userId: string,
    notification: NotificationEventData
  ): Promise<boolean> {
    // 1. Vérifier si Firebase est disponible
    if (!FirebaseStatusChecker.isFirebaseAvailable()) {
      return false;
    }

    try {
      // 2. Retrieve all FCM push tokens for this user (multi-device support)
      const pushTokens = await this.prisma.pushToken.findMany({
        where: { userId, type: 'fcm' },
        select: { id: true, token: true }
      });

      const tokens = pushTokens.map(t => t.token).filter(Boolean);
      if (tokens.length === 0) {
        logger.debug(`[Notifications] No FCM tokens for user ${userId}`);
        return false;
      }

      // 3. Build the multicast message
      const messagePayload = {
        notification: {
          title: notification.title,
          body: notification.content
        },
        data: {
          notificationId: notification.id,
          type: notification.type,
          conversationId: notification.conversationId || '',
          messageId: notification.messageId || '',
          ...(notification.data && { additionalData: JSON.stringify(notification.data) })
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'meeshy_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        },
        tokens
      };

      // 4. Send to all devices with timeout
      const sendResult = await Promise.race([
        admin.messaging().sendEachForMulticast(messagePayload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firebase timeout')), 5000)
        )
      ]) as { responses: Array<{ success: boolean; error?: { code?: string } }> };

      // 5. Prune stale tokens that are no longer registered
      const staleTokenIds: string[] = [];
      sendResult.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          (resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered')
        ) {
          const tokenRecord = pushTokens[idx];
          if (tokenRecord) staleTokenIds.push(tokenRecord.id);
        }
      });

      if (staleTokenIds.length > 0) {
        await this.prisma.pushToken.deleteMany({ where: { id: { in: staleTokenIds } } }).catch(() => {});
        logger.debug(`[Notifications] Pruned ${staleTokenIds.length} stale FCM token(s) for user ${userId}`);
      }

      const successCount = sendResult.responses.filter(r => r.success).length;
      logger.debug(`[Notifications] FCM push: ${successCount}/${tokens.length} delivered for user ${userId}`);
      return successCount > 0;

    } catch (error: any) {
      logger.error(`[Notifications] Firebase push failed for user ${userId}:`, error.message);
      return false;
    }
  }

  /**
   * Vérifier si Firebase est disponible
   */
  isAvailable(): boolean {
    return FirebaseStatusChecker.isFirebaseAvailable();
  }
}
