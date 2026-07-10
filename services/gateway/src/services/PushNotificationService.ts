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
import { enhancedLogger, performanceLogger } from '../utils/logger-enhanced';

const pushLogger = enhancedLogger.child({ module: 'PushNotificationService' });

// ============================================
// TYPES
// ============================================

export interface PushNotificationPayload {
  title: string;
  /**
   * Optional subtitle, displayed natively by iOS between title and body on
   * lock-screen banners. Used for group/global message notifications to
   * carry the conversation name (e.g. "Meeshy Global") while keeping the
   * title focused on the sender. Survives iOS Communication Notification
   * rewriting (INSendMessageIntent.donate) which can mutate the title.
   * Android/FCM web push ignore subtitle gracefully.
   */
  subtitle?: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
  badge?: number;
  sound?: string;
  // For iOS
  category?: string;
  threadId?: string;
  // For VoIP calls
  callId?: string;
  callerName?: string;
  callerAvatar?: string;
  // APNs collapse-id: allows replacing an existing notification in Notification Center
  collapseId?: string;
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
    bundleId: process.env.APNS_BUNDLE_ID || 'me.meeshy.app',
    voipBundleId: process.env.APNS_VOIP_BUNDLE_ID || 'me.meeshy.app.voip',
    environment: (process.env.APNS_ENVIRONMENT || 'development') as 'development' | 'production',
  },
};

// ============================================
// SERVICE CLASS
// ============================================

export class PushNotificationService {
  private prisma: PrismaClient;
  private firebaseAdmin: any = null;
  // Two APNs Provider instances: one for sandbox (debug builds, aps-environment=development),
  // one for production (TestFlight/App Store, aps-environment=production). The token's
  // apnsEnvironment field decides which one is used. Same Apple p8 key works for both —
  // only the host differs (api.sandbox.push.apple.com vs api.push.apple.com), set via the
  // `production` boolean of @parse/node-apn's Provider.
  private apnsClientProduction: any = null;
  private apnsClientSandbox: any = null;
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
      pushLogger.info('Push notifications disabled');
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

        if (fs.existsSync(credentialsPath) && fs.statSync(credentialsPath).isFile()) {
          const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
          }

          this.firebaseAdmin = admin;
          pushLogger.info('Firebase Admin SDK initialized');
        } else {
          const reason = fs.existsSync(credentialsPath) ? 'path is a directory, not a file' : 'file not found';
          pushLogger.warn('Firebase credentials invalid', { credentialsPath, reason });
        }
      } catch (error) {
        pushLogger.error('Failed to initialize Firebase', { error });
      }
    }

    // Initialize APNS clients (one per environment)
    if (config.apnsEnabled && config.apns.keyId && config.apns.teamId) {
      try {
        const apn = await import('@parse/node-apn').catch(() => null);

        if (apn) {
          const baseTokenOptions = {
            token: {
              key: config.apns.keyPath || config.apns.keyContent,
              keyId: config.apns.keyId,
              teamId: config.apns.teamId,
            },
          };

          this.apnsClientProduction = new apn.Provider({
            ...baseTokenOptions,
            production: true,
          });
          this.apnsClientSandbox = new apn.Provider({
            ...baseTokenOptions,
            production: false,
          });

          pushLogger.info('APNS clients initialized');
        } else {
          pushLogger.warn('@parse/node-apn not installed, APNS push disabled');
        }
      } catch (error) {
        pushLogger.error('Failed to initialize APNS', { error });
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
      pushLogger.info('Push blocked by user preferences', { userId });
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
        apnsEnvironment: true,
      },
    });

    if (tokens.length === 0) {
      pushLogger.warn('No active tokens found for user', { userId });
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
    callerUserId?: string;
    isVideo?: boolean;
  }): Promise<PushResult[]> {
    if (!config.voipEnabled) {
      return [];
    }

    // Audit P1-14 — include `callerUserId` and `isVideo` in the data
    // payload. Without these the iOS PKPushRegistry handler defaulted to
    // `callerUserId = ""` (anonymous CXHandle) and `isVideo = false` for
    // every call routed through this code path (recovery / fallback path),
    // causing every call to be reported to CallKit as audio-only with no
    // identifiable caller.
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
          callerUserId: callData.callerUserId || '',
          isVideo: String(callData.isVideo ?? false),
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
        // `content-available: 1` wakes the app in the background even when it
        // has been swiped away, which is the only path that runs the
        // `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`
        // delegate. That delegate calls `PushDeliveryReceiptService.ack`, which
        // posts `mark-as-received` and lets the sender's checkmark flip from
        // ✓ to ✓✓ even when the recipient never foregrounds the app.
        //
        // When a `subtitle` is provided, we MUST use the structured `alert`
        // object (with title/subtitle/body) — the flat top-level
        // `notification.title/body` from FCM does NOT carry subtitle, so iOS
        // would silently drop it. Setting `aps.alert` here overrides the flat
        // one as APNs honours the more specific payload.
        const apsBase: Record<string, unknown> = {
          badge: payload.badge,
          sound: payload.sound || 'default',
          category: payload.category,
          'thread-id': payload.threadId,
          'mutable-content': 1,
          'content-available': 1,
        };
        if (payload.subtitle) {
          apsBase.alert = {
            title: payload.title,
            subtitle: payload.subtitle,
            body: payload.body,
          };
        }
        message.apns = {
          payload: {
            aps: apsBase,
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
        const link = payload.link || (payload.data?.conversationId ? `/conversations/${payload.data.conversationId}` : undefined);
        message.webpush = {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/android-chrome-192x192.png',
            badge: '/badge-72x72.png',
          },
          ...(link && {
            fcmOptions: {
              link
            }
          })
        };
      }

      if (payload.collapseId) {
        message.android = {
          ...message.android,
          collapseKey: payload.collapseId,
        };
        if (message.apns) {
          message.apns.headers = {
            ...message.apns.headers,
            'apns-collapse-id': payload.collapseId,
          };
        }
      }

      const fcmCorr = {
        tokenId: tokenRecord.id,
        platform: tokenRecord.platform,
        collapseId: payload.collapseId ?? undefined
      };
      await performanceLogger.withTiming(
        'push.sendViaFCM',
        () => this.firebaseAdmin!.messaging().send(message),
        fcmCorr
      );
      pushLogger.info('push.sendViaFCM.success', fcmCorr);
      return { success: true, tokenId: tokenRecord.id };
    } catch (error: any) {
      // Handle specific FCM errors
      const errorCode = error?.code || error?.errorInfo?.code;

      pushLogger.warn('push.sendViaFCM.failure', {
        tokenId: tokenRecord.id,
        platform: tokenRecord.platform,
        collapseId: payload.collapseId ?? undefined,
        errorCode,
        errorMessage: error?.message
      });

      if (errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token') {
        // Token is invalid, mark for removal
        return { success: false, tokenId: tokenRecord.id, error: 'TOKEN_INVALID' };
      }

      return { success: false, tokenId: tokenRecord.id, error: error.message || 'FCM error' };
    }
  }

  /**
   * Send notification via Apple Push Notification Service.
   *
   * Routes to either the sandbox or production APNs Provider based on the
   * token's `apnsEnvironment`. Sandbox tokens (from iOS debug builds) MUST
   * be sent via `api.sandbox.push.apple.com`; production tokens (TestFlight,
   * App Store) MUST be sent via `api.push.apple.com`. Cross-routing returns
   * `BadDeviceToken` from Apple — this is exactly the bug this method fixes.
   */
  private async sendViaAPNS(
    tokenRecord: {
      id: string;
      token: string;
      bundleId?: string | null;
      apnsEnvironment?: string | null;
    },
    payload: PushNotificationPayload,
    isVoIP: boolean
  ): Promise<PushResult> {
    const env = tokenRecord.apnsEnvironment === 'development' ? 'sandbox' : 'production';
    const client = env === 'sandbox' ? this.apnsClientSandbox : this.apnsClientProduction;

    if (!client) {
      return { success: false, tokenId: tokenRecord.id, error: `APNS ${env} client not initialized` };
    }

    try {
      const apn = await import('@parse/node-apn');
      const notification = new apn.Notification();

      notification.alert = {
        title: payload.title,
        body: payload.body,
        ...(payload.subtitle ? { subtitle: payload.subtitle } : {}),
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

      notification.mutableContent = true;

      if (payload.collapseId) {
        notification.collapseId = payload.collapseId;
      }

      // `content-available: 1` wakes the app in the background so the silent
      // push handler in `AppDelegate` can post the delivery receipt
      // (`PushDeliveryReceiptService.ack`). Without this, an offline recipient
      // never triggers `mark-as-received` and the sender's checkmark stays at
      // ✓ until the recipient manually foregrounds the app.
      if (!isVoIP) {
        notification.contentAvailable = true;
      }

      if (payload.data) {
        notification.payload = { ...payload.data };
      } else {
        notification.payload = {};
      }

      // Include VoIP call fields in payload for PushKit handling
      if (isVoIP) {
        if (payload.callId) notification.payload.callId = payload.callId;
        if (payload.callerName) notification.payload.callerName = payload.callerName;
        if (payload.callerAvatar) notification.payload.callerAvatar = payload.callerAvatar;
      }

      const apnsCorr = {
        tokenId: tokenRecord.id,
        apnsEnv: env,
        topic: notification.topic,
        isVoIP,
        bundleId: tokenRecord.bundleId ?? undefined,
        collapseId: payload.collapseId ?? undefined
      };
      const result = await performanceLogger.withTiming(
        'push.sendViaAPNS',
        () => client.send(notification, tokenRecord.token) as Promise<{ failed: Array<{ response?: { reason?: string }; status?: number | string }>; sent: unknown[] }>,
        apnsCorr
      );

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        const reason = failure.response?.reason || 'APNS delivery failed';
        pushLogger.warn('push.sendViaAPNS.failure', {
          ...apnsCorr,
          reason,
          statusCode: failure.status
        });
        return {
          success: false,
          tokenId: tokenRecord.id,
          error: reason,
        };
      }

      pushLogger.info('push.sendViaAPNS.success', apnsCorr);
      return { success: true, tokenId: tokenRecord.id };
    } catch (error: any) {
      pushLogger.warn('push.sendViaAPNS.failure', {
        tokenId: tokenRecord.id,
        apnsEnv: env,
        isVoIP,
        errorMessage: error?.message
      });
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
      pushLogger.warn('Token deactivated', {
        tokenId,
        failedAttempts: newFailedAttempts,
        reason: error
      });
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

    pushLogger.info('Cleaned up inactive/stale tokens', { count: result.count });
    return result.count;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.apnsClientProduction) {
      await this.apnsClientProduction.shutdown();
    }
    if (this.apnsClientSandbox) {
      await this.apnsClientSandbox.shutdown();
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
