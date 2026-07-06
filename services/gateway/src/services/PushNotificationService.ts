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
import { CircuitBreaker } from '../utils/circuitBreaker';

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
  /**
   * Pure background push (APNs `apns-push-type: background`, priority 5,
   * `content-available: 1`, NO alert/sound/badge): a data-only wake for
   * signals the user must never see as a banner — e.g. `call_cancel`, which
   * stops CallKit ringing on a device whose socket never came up. iOS only;
   * FCM sends currently ignore this flag (alert path unchanged). NEVER use
   * the `voip` type for such signals: every VoIP push must report a new
   * incoming call to CallKit or the system kills the app.
   */
  silent?: boolean;
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
  /**
   * True when `error` represents a transient provider-side failure (APNs
   * InternalServerError/ServiceUnavailable, FCM messaging/internal-error, etc.)
   * rather than a permanently invalid token. `handleFailedToken` uses this to
   * avoid deactivating healthy tokens during an Apple/Google outage.
   */
  transient?: boolean;
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
// TRANSIENT ERROR CLASSIFICATION
// ============================================

// Apple-reported reasons that indicate a provider-side hiccup, not a bad
// device token. Worth a short retry before counting as a delivery failure.
const APNS_TRANSIENT_REASONS = new Set(['InternalServerError', 'ServiceUnavailable', 'TooManyRequests', 'Shutdown']);

// FCM error codes for the same class of provider-side issue (as opposed to
// `messaging/registration-token-not-registered` / `invalid-registration-token`,
// which mean the token itself is dead).
const FCM_TRANSIENT_ERROR_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unavailable',
  'messaging/quota-exceeded',
]);

function isTransientApnsReason(reason: string | undefined): boolean {
  return !!reason && APNS_TRANSIENT_REASONS.has(reason);
}

function isTransientFcmErrorCode(code: string | undefined): boolean {
  return !!code && FCM_TRANSIENT_ERROR_CODES.has(code);
}

// Up to 2 retries (3 attempts total) with exponential backoff before a
// transient failure is surfaced as a real delivery failure.
const PUSH_RETRY_MAX_ATTEMPTS = 2;
const PUSH_RETRY_BASE_DELAY_MS = 200;

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

  // Circuit breakers prevent hammering FCM/APNs during outages.
  // OPEN after 5 consecutive failures; recovers after 60s with 2 probe successes.
  private fcmCircuitBreaker = new CircuitBreaker({
    name: 'FCM',
    failureThreshold: 5,
    failureWindowMs: 60_000,
    resetTimeoutMs: 60_000,
    successThreshold: 2,
    timeout: 10_000,
    fallback: () => ({ success: false, tokenId: '', error: 'FCM circuit breaker OPEN' }),
  });
  private apnsCircuitBreaker = new CircuitBreaker({
    name: 'APNS',
    failureThreshold: 5,
    failureWindowMs: 60_000,
    resetTimeoutMs: 60_000,
    successThreshold: 2,
    timeout: 10_000,
    fallback: () => ({ success: false, tokenId: '', error: 'APNS circuit breaker OPEN' }),
  });

  // In-flight deactivation guard: prevents duplicate DB writes when the same
  // token fails multiple concurrent sends (e.g. a burst of push requests).
  private deactivatingTokenIds = new Set<string>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Sleep helper, broken out so tests can stub it to skip real backoff delays.
   */
  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Fan out to every device token in parallel: a user's devices are
    // independent, and each provider call is wrapped in a CircuitBreaker with a
    // 10s timeout plus retries. A sequential loop lets one slow/timing-out token
    // stall delivery to all the user's other healthy devices. Each token's
    // follow-up DB write targets a distinct row and handleFailedToken is guarded
    // per-tokenId, so concurrent execution is safe.
    const results = await Promise.all(
      tokens.map(async (tokenRecord): Promise<PushResult> => {
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

          // Handle failed tokens
          if (!result.success) {
            await this.handleFailedToken(tokenRecord.id, result.error || 'Unknown error', result.transient);
            return result;
          }

          // The push was delivered. Bookkeeping (lastUsedAt / failure reset) is
          // best-effort: a DB hiccup here must not flip a delivered push to
          // failed, which would make callers retry and double-send.
          try {
            await this.prisma.pushToken.update({
              where: { id: tokenRecord.id },
              data: {
                lastUsedAt: new Date(),
                failedAttempts: 0,
                lastError: null,
              },
            });
          } catch (updateError) {
            pushLogger.warn('Failed to update push token bookkeeping after successful send', {
              tokenId: tokenRecord.id,
              error: updateError instanceof Error ? updateError.message : 'Unknown error',
            });
          }

          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          await this.handleFailedToken(tokenRecord.id, errorMsg);
          return { success: false, tokenId: tokenRecord.id, error: errorMsg };
        }
      })
    );

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
        // `notificationCount` is the Android analog of `aps.badge`: launchers
        // that support badging render it on the app icon. Forwarding it keeps
        // the Android launcher badge in sync with the unread count carried by
        // the push payload — the same F1 guarantee already wired for iOS above,
        // which otherwise leaves the Android badge frozen when the app is closed.
        message.android = {
          priority: 'high',
          notification: {
            sound: payload.sound || 'default',
            channelId: 'meeshy_notifications',
            ...(payload.badge !== undefined ? { notificationCount: payload.badge } : {}),
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
      await this.fcmCircuitBreaker.execute(() =>
        performanceLogger.withTiming(
          'push.sendViaFCM',
          () => this.sendFcmWithRetry(message, fcmCorr),
          fcmCorr
        )
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

      return {
        success: false,
        tokenId: tokenRecord.id,
        error: error.message || 'FCM error',
        transient: isTransientFcmErrorCode(errorCode),
      };
    }
  }

  /**
   * Sends via FCM, retrying transient provider errors (`messaging/internal-error`,
   * etc.) with exponential backoff. Permanent errors (bad/unregistered token)
   * throw immediately on the first attempt — retrying them would just waste
   * round-trips and delay the TOKEN_INVALID classification.
   */
  private async sendFcmWithRetry(message: unknown, corr: Record<string, unknown>): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.firebaseAdmin!.messaging().send(message);
      } catch (error: any) {
        const code = error?.code || error?.errorInfo?.code;
        if (!isTransientFcmErrorCode(code) || attempt >= PUSH_RETRY_MAX_ATTEMPTS) {
          throw error;
        }
        pushLogger.warn('push.sendViaFCM.retry', { ...corr, attempt: attempt + 1, code });
        await this.wait(PUSH_RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
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

      const isSilent = payload.silent === true && !isVoIP;
      if (isSilent) {
        // Explicitly strip every user-visible field — a background push that
        // carries an alert/sound/badge is rejected or displayed by APNs.
        notification.alert = undefined as never;
        notification.sound = undefined as never;
        notification.badge = undefined as never;
      } else {
        notification.alert = {
          title: payload.title,
          body: payload.body,
          ...(payload.subtitle ? { subtitle: payload.subtitle } : {}),
        };

        if (payload.badge !== undefined) {
          notification.badge = payload.badge;
        }

        notification.sound = payload.sound || 'default';
      }
      notification.topic = isVoIP
        ? config.apns.voipBundleId
        : (tokenRecord.bundleId || config.apns.bundleId);

      if (isVoIP) {
        notification.pushType = 'voip';
        notification.priority = 10; // Immediate delivery for calls
      } else if (isSilent) {
        // Apple requires `apns-push-type: background` + priority 5 for pure
        // content-available pushes; priority 10 on a background push is
        // rejected/deprioritized by APNs.
        notification.pushType = 'background';
        notification.priority = 5;
      }

      if (payload.category) {
        (notification as any).category = payload.category;
      }

      if (payload.threadId) {
        notification.threadId = payload.threadId;
      }

      // mutable-content routes ALERT pushes through the Notification Service
      // Extension; it has no meaning on a background push (Apple rejects the
      // combination), so only set it on visible notifications.
      if (!isSilent) {
        notification.mutableContent = true;
      }

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
      const result = await this.apnsCircuitBreaker.execute(() =>
        performanceLogger.withTiming(
          'push.sendViaAPNS',
          () => this.sendApnsWithRetry(client, notification, tokenRecord.token, apnsCorr),
          apnsCorr
        )
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
          transient: isTransientApnsReason(reason),
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
   * Sends via APNs, retrying transient provider reasons (`InternalServerError`,
   * `ServiceUnavailable`, `TooManyRequests`, `Shutdown`) with exponential
   * backoff. Permanent reasons (`BadDeviceToken`, `Unregistered`, ...) are
   * returned on the first attempt — retrying a dead token wastes round-trips.
   */
  private async sendApnsWithRetry(
    client: { send: (notification: unknown, token: string) => Promise<unknown> },
    notification: unknown,
    token: string,
    corr: Record<string, unknown>
  ): Promise<{ failed: Array<{ response?: { reason?: string }; status?: number | string }>; sent: unknown[] }> {
    for (let attempt = 0; ; attempt++) {
      const result = (await client.send(notification, token)) as {
        failed: Array<{ response?: { reason?: string }; status?: number | string }>;
        sent: unknown[];
      };
      const reason = result.failed[0]?.response?.reason;
      if (result.failed.length === 0 || !isTransientApnsReason(reason) || attempt >= PUSH_RETRY_MAX_ATTEMPTS) {
        return result;
      }
      pushLogger.warn('push.sendViaAPNS.retry', { ...corr, attempt: attempt + 1, reason });
      await this.wait(PUSH_RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  /**
   * Handle failed token delivery.
   * Uses an in-flight guard to prevent duplicate DB writes when the same
   * token fails multiple concurrent sends in a burst scenario.
   *
   * `transient` failures (Apple/Google provider-side outages, already retried
   * by `sendApnsWithRetry`/`sendFcmWithRetry`) are logged but never count
   * toward the 3-strike deactivation threshold — the token itself is fine,
   * only the provider had a hiccup.
   */
  private async handleFailedToken(tokenId: string, error: string, transient = false): Promise<void> {
    if (this.deactivatingTokenIds.has(tokenId)) {
      pushLogger.debug('handleFailedToken skipped (already in-flight)', { tokenId });
      return;
    }
    if (transient) {
      pushLogger.warn('Push delivery failed transiently, token left active', { tokenId, error });
      return;
    }
    this.deactivatingTokenIds.add(tokenId);
    try {
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
    } finally {
      this.deactivatingTokenIds.delete(tokenId);
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
