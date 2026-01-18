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
      // 2. Récupérer le FCM token de l'utilisateur depuis la DB
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        logger.debug(`[Notifications] User ${userId} not found for FCM push`);
        return false;
      }

      // TODO: Récupérer le fcmToken réel quand le champ existera
      const fcmToken = null;

      if (!fcmToken) {
        return false;
      }

      // 3. Préparer le message Firebase
      const message = {
        token: fcmToken,
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
        }
      };

      // 4. Envoyer via Firebase (avec timeout)
      await Promise.race([
        admin.messaging().send(message),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firebase timeout')), 5000)
        )
      ]);

      logger.debug(`[Notifications] ✅ Firebase push sent successfully to ${userId}`);
      return true;

    } catch (error: any) {
      // Logger l'erreur mais NE PAS crasher
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        logger.debug(`[Notifications] Invalid FCM token for user ${userId}, skipping`);
      } else {
        logger.error(`[Notifications] Firebase push failed for user ${userId}:`, error.message);
      }

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
