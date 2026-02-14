/**
 * Push Notification Service
 *
 * Handles sending push notifications via:
 * - Firebase Cloud Messaging (FCM) - iOS, Android, Web
 * - Apple Push Notification Service (APNS) - iOS native, VoIP calls
 *
 * @module services/PushNotificationService
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreference as NotifPrefs,
} from '@meeshy/shared/types/preferences';

// ============================================
// TYPES
// ============================================

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  // For iOS
  category?: string;
  threadId?: string;
  // For VoIP calls
  callId?: string;
  callerName?: string;
  callerAvatar?: string;
}

export interface PushResult {
  success: boolean;
  tokenId: string;
  error?: string;
}

export interface SendPushOptions {
  userId: string;
  payload: PushNotificationPayload;
  // Optional: target specific token types
  types?: ('apns' | 'fcm' | 'voip')[];
  // Optional: target specific platforms
  platforms?: ('ios' | 'android' | 'web')[];
}

// ============================================
// CONFIGURATION
// ============================================

const config = {
  // Feature flags
  enabled: process.env.ENABLE_PUSH_NOTIFICATIONS !== 'false',
  apnsEnabled: process.env.ENABLE_APNS_PUSH !== 'false',
  fcmEnabled: process.env.ENABLE_FCM_PUSH !== 'false',
  voipEnabled: process.env.ENABLE_VOIP_PUSH !== 'false',

  // Firebase
  firebaseCredentialsPath: process.env.FIREBASE_ADMIN_CREDENTIALS_PATH,

  // APNS
  apns: {
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    keyPath: process.env.APNS_KEY_PATH,
    keyContent: process.env.APNS_KEY_CONTENT,
    bundleId: process.env.APNS_BUNDLE_ID || 'com.meeshy.app',
    voipBundleId: process.env.APNS_VOIP_BUNDLE_ID || 'com.meeshy.app.voip',
    environment: (process.env.APNS_ENVIRONMENT || 'development') as 'development' | 'production',
  },
};

// ============================================
// SERVICE CLASS
// ============================================

export class PushNotificationService {
  private prisma: PrismaClient;
  private firebaseAdmin: any = null;
  private apnsClient: any = null;
  private initialized = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initialize push notification providers
   * Called lazily on first use
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!config.enabled) {
      console.log('[PUSH] Push notifications disabled');
      this.initialized = true;
      return;
    }

    // Initialize Firebase Admin SDK
    if (config.fcmEnabled && config.firebaseCredentialsPath) {
      try {
        const admin = await import('firebase-admin');
        const fs = await import('fs');
        const path = await import('path');

        const credentialsPath = path.resolve(config.firebaseCredentialsPath);

        if (fs.existsSync(credentialsPath)) {
          const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
          }

          this.firebaseAdmin = admin;
          console.log('[PUSH] Firebase Admin SDK initialized');
        } else {
          console.warn(`[PUSH] Firebase credentials not found at ${credentialsPath}`);
        }
      } catch (error) {
        console.error('[PUSH] Failed to initialize Firebase:', error);
      }
    }

    // Initialize APNS client
    if (config.apnsEnabled && config.apns.keyId && config.apns.teamId) {
      try {
        // Using @parse/node-apn or similar library
        // Note: You may need to install: npm install @parse/node-apn
        const apn = await import('@parse/node-apn').catch(() => null);

        if (apn) {
          const apnOptions: any = {
            token: {
              key: config.apns.keyPath || config.apns.keyContent,
              keyId: config.apns.keyId,
              teamId: config.apns.teamId,
            },
            production: config.apns.environment === 'production',
          };

          this.apnsClient = new apn.Provider(apnOptions);
          console.log('[PUSH] APNS client initialized');
        } else {
          console.warn('[PUSH] @parse/node-apn not installed, APNS push disabled');
        }
      } catch (error) {
        console.error('[PUSH] Failed to initialize APNS:', error);
      }
    }

    this.initialized = true;
  }

  /**
   * Vérifie si les push sont autorisés selon UserPreferences.notification
   */
  private async isPushAllowed(userId: string): Promise<boolean> {
    try {
      const userPrefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { notification: true },
      });
      const raw = (userPrefs?.notification ?? {}) as Record<string, unknown>;
      const prefs: NotifPrefs = { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...raw };

      if (!prefs.pushEnabled) return false;

      // Vérifier DND
      if (prefs.dndEnabled) {
        const now = new Date();
        if (prefs.dndDays && prefs.dndDays.length > 0) {
          const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
          const today = dayMap[now.getUTCDay()];
          if (!prefs.dndDays.includes(today as any)) return true; // pas DND aujourd'hui
        }
        const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
        const start = prefs.dndStartTime;
        const end = prefs.dndEndTime;
        if (start > end) {
          if (currentTime >= start || currentTime < end) return false;
        } else {
          if (currentTime >= start && currentTime < end) return false;
        }
      }

      return true;
    } catch {
      return true; // fail open
    }
  }

  /**
   * Send push notification to a user
   */
  async sendToUser(options: SendPushOptions): Promise<PushResult[]> {
    await this.initialize();

    if (!config.enabled) {
      return [];
    }

    const { userId, payload, types, platforms } = options;

    // Vérifier les préférences push utilisateur (UserPreferences.notification)
    const pushAllowed = await this.isPushAllowed(userId);
    if (!pushAllowed) {
      console.log(`[PUSH] Push blocked by user preferences for user ${userId}`);
      return [];
    }

    // Build query for user's push tokens
    const whereClause: any = {
      userId,
      isActive: true,
    };

    if (types && types.length > 0) {
      whereClause.type = { in: types };
    }

    if (platforms && platforms.length > 0) {
      whereClause.platform = { in: platforms };
    }

    // Get user's active push tokens
    const tokens = await this.prisma.pushToken.findMany({
      where: whereClause,
      select: {
        id: true,
        token: true,
        type: true,
        platform: true,
        bundleId: true,
      },
    });

    if (tokens.length === 0) {
      console.log(`[PUSH] No active tokens found for user ${userId}`);
      return [];
    }

    const results: PushResult[] = [];

    // Send to each token
    for (const tokenRecord of tokens) {
      try {
        let result: PushResult;

        if (tokenRecord.type === 'fcm') {
          result = await this.sendViaFCM(tokenRecord, payload);
        } else if (tokenRecord.type === 'apns') {
          result = await this.sendViaAPNS(tokenRecord, payload, false);
        } else if (tokenRecord.type === 'voip') {
          result = await this.sendViaAPNS(tokenRecord, payload, true);
        } else {
          result = { success: false, tokenId: tokenRecord.id, error: `Unknown token type: ${tokenRecord.type}` };
        }

        results.push(result);

        // Handle failed tokens
        if (!result.success) {
          await this.handleFailedToken(tokenRecord.id, result.error || 'Unknown error');
        } else {
          // Update last used timestamp
          await this.prisma.pushToken.update({
            where: { id: tokenRecord.id },
            data: {
              lastUsedAt: new Date(),
              failedAttempts: 0,
              lastError: null,
            },
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ success: false, tokenId: tokenRecord.id, error: errorMsg });
        await this.handleFailedToken(tokenRecord.id, errorMsg);
      }
    }

    return results;
  }

  /**
   * Send VoIP push notification for incoming calls
   */
  async sendVoIPPush(userId: string, callData: {
    callId: string;
    callerName: string;
    callerAvatar?: string;
    conversationId?: string;
  }): Promise<PushResult[]> {
    if (!config.voipEnabled) {
      return [];
    }

    return this.sendToUser({
      userId,
      payload: {
        title: 'Incoming Call',
        body: `${callData.callerName} is calling...`,
        callId: callData.callId,
        callerName: callData.callerName,
        callerAvatar: callData.callerAvatar,
        data: {
          type: 'voip_call',
          callId: callData.callId,
          callerName: callData.callerName,
          conversationId: callData.conversationId || '',
        },
      },
      types: ['voip'],
      platforms: ['ios'],
    });
  }

  /**
   * Send notification via Firebase Cloud Messaging
   */
  private async sendViaFCM(
    tokenRecord: { id: string; token: string; platform: string },
    payload: PushNotificationPayload
  ): Promise<PushResult> {
    if (!this.firebaseAdmin) {
      return { success: false, tokenId: tokenRecord.id, error: 'Firebase not initialized' };
    }

    try {
      const message: any = {
        token: tokenRecord.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
      };

      // Platform-specific options
      if (tokenRecord.platform === 'ios') {
        message.apns = {
          payload: {
            aps: {
              badge: payload.badge,
              sound: payload.sound || 'default',
              category: payload.category,
              'thread-id': payload.threadId,
            },
          },
        };
      } else if (tokenRecord.platform === 'android') {
        message.android = {
          priority: 'high',
          notification: {
            sound: payload.sound || 'default',
            channelId: 'meeshy_notifications',
          },
        };
      } else if (tokenRecord.platform === 'web') {
        message.webpush = {
          notification: {
            icon: '/android-chrome-192x192.png',
            badge: '/badge-72x72.png',
          },
        };
      }

      await this.firebaseAdmin.messaging().send(message);
      return { success: true, tokenId: tokenRecord.id };
    } catch (error: any) {
      // Handle specific FCM errors
      const errorCode = error?.code || error?.errorInfo?.code;

      if (errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token') {
        // Token is invalid, mark for removal
        return { success: false, tokenId: tokenRecord.id, error: 'TOKEN_INVALID' };
      }

      return { success: false, tokenId: tokenRecord.id, error: error.message || 'FCM error' };
    }
  }

  /**
   * Send notification via Apple Push Notification Service
   */
  private async sendViaAPNS(
    tokenRecord: { id: string; token: string; bundleId?: string | null },
    payload: PushNotificationPayload,
    isVoIP: boolean
  ): Promise<PushResult> {
    if (!this.apnsClient) {
      return { success: false, tokenId: tokenRecord.id, error: 'APNS not initialized' };
    }

    try {
      const apn = await import('@parse/node-apn');
      const notification = new apn.Notification();

      notification.alert = {
        title: payload.title,
        body: payload.body,
      };

      if (payload.badge !== undefined) {
        notification.badge = payload.badge;
      }

      notification.sound = payload.sound || 'default';
      notification.topic = isVoIP
        ? config.apns.voipBundleId
        : (tokenRecord.bundleId || config.apns.bundleId);

      if (isVoIP) {
        notification.pushType = 'voip';
        notification.priority = 10; // Immediate delivery for calls
      }

      if (payload.category) {
        (notification as any).category = payload.category;
      }

      if (payload.threadId) {
        notification.threadId = payload.threadId;
      }

      if (payload.data) {
        notification.payload = payload.data;
      }

      const result = await this.apnsClient.send(notification, tokenRecord.token);

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        return {
          success: false,
          tokenId: tokenRecord.id,
          error: failure.response?.reason || 'APNS delivery failed',
        };
      }

      return { success: true, tokenId: tokenRecord.id };
    } catch (error: any) {
      return { success: false, tokenId: tokenRecord.id, error: error.message || 'APNS error' };
    }
  }

  /**
   * Handle failed token delivery
   */
  private async handleFailedToken(tokenId: string, error: string): Promise<void> {
    const token = await this.prisma.pushToken.findUnique({
      where: { id: tokenId },
      select: { failedAttempts: true },
    });

    if (!token) return;

    const newFailedAttempts = token.failedAttempts + 1;

    // Deactivate token after 3 consecutive failures or if explicitly invalid
    const shouldDeactivate = newFailedAttempts >= 3 ||
      error === 'TOKEN_INVALID' ||
      error.includes('NotRegistered') ||
      error.includes('InvalidRegistration');

    await this.prisma.pushToken.update({
      where: { id: tokenId },
      data: {
        failedAttempts: newFailedAttempts,
        lastError: error,
        isActive: !shouldDeactivate,
      },
    });

    if (shouldDeactivate) {
      console.log(`[PUSH] Deactivated token ${tokenId} after ${newFailedAttempts} failures: ${error}`);
    }
  }

  /**
   * Clean up old/inactive tokens
   * Should be run periodically (e.g., daily cron job)
   */
  async cleanupInactiveTokens(daysInactive: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const result = await this.prisma.pushToken.deleteMany({
      where: {
        OR: [
          // Inactive tokens not used in X days
          {
            isActive: false,
            updatedAt: { lt: cutoffDate },
          },
          // Active tokens not used in X days (stale)
          {
            lastUsedAt: { lt: cutoffDate },
          },
          // Tokens with too many failures
          {
            failedAttempts: { gte: 5 },
          },
        ],
      },
    });

    console.log(`[PUSH] Cleaned up ${result.count} inactive/stale tokens`);
    return result.count;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.apnsClient) {
      await this.apnsClient.shutdown();
    }
    this.initialized = false;
  }
}

// Singleton instance
let pushNotificationServiceInstance: PushNotificationService | null = null;

export function getPushNotificationService(prisma: PrismaClient): PushNotificationService {
  if (!pushNotificationServiceInstance) {
    pushNotificationServiceInstance = new PushNotificationService(prisma);
  }
  return pushNotificationServiceInstance;
}
