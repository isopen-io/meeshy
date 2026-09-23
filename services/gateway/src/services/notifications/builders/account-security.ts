/**
 * Les bâtisseurs de SÉCURITÉ DU COMPTE — extraits de `NotificationService.ts`
 * (#7632, budget de taille).
 *
 * Une responsabilité : dire au propriétaire du compte que quelque chose vient
 * d'arriver à SON accès. Mot de passe changé, second facteur activé ou
 * désactivé, connexion depuis un appareil inconnu.
 *
 * Trois traits les séparent des autres bâtisseurs, et ce sont eux qui font le
 * module :
 *  - le destinataire est TOUJOURS le propriétaire — pas d'acteur tiers, donc
 *    pas de `actor` ;
 *  - la priorité est `high` sans condition : une alerte de sécurité ne
 *    s'agrège pas et ne se throttle pas ;
 *  - l'horodatage se lit DANS la notification, donc dans la langue de la
 *    notification (`recipientDateLocale`), jamais dans celle du serveur.
 */
import type { Notification } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import {
  RECIPIENT_LANG_SELECT,
  recipientDateLocale,
  recipientLanguage,
} from '../../../utils/recipient-language';
import type { NotificationBuilderDependencies } from './dependencies';


export async function createPasswordChangedNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
  }
): Promise<Notification | null> {
  return deps.createNotification({
    userId: params.recipientUserId,
    type: 'password_changed',
    priority: 'high',
    content: '',
    context: {},
    metadata: { action: 'view_details' },
  });
}

// ==============================================
// SECURITY — TWO_FACTOR_ENABLED / DISABLED
// ==============================================

export async function createTwoFactorNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    enabled: boolean;
  }
): Promise<Notification | null> {
  return deps.createNotification({
    userId: params.recipientUserId,
    type: params.enabled ? 'two_factor_enabled' : 'two_factor_disabled',
    priority: 'high',
    content: '',
    context: {},
    metadata: { action: 'view_details' },
  });
}

// ==============================================
// SECURITY — LOGIN_NEW_DEVICE
// ==============================================

export async function createLoginNewDeviceNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    deviceInfo?: {
      type?: string;
      vendor?: string | null;
      model?: string | null;
      os?: string | null;
      osVersion?: string | null;
      browser?: string | null;
      browserVersion?: string | null;
    } | null;
    ipAddress?: string;
    geoData?: {
      country?: string | null;
      countryName?: string | null;
      city?: string | null;
      location?: string | null;
      timezone?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    revokeToken?: string;
  }
): Promise<Notification | null> {
  const device = params.deviceInfo;
  const geo = params.geoData;

  const deviceName = [device?.vendor, device?.model].filter(Boolean).join(' ') || null;
  const deviceOS = device?.os
    ? (device.osVersion ? `${device.os} ${device.osVersion}` : device.os)
    : null;
  const appOrBrowser = device?.browser
    ? (device.browserVersion ? `${device.browser} ${device.browserVersion}` : device.browser)
    : null;
  const location = geo?.location || [geo?.city, geo?.countryName].filter(Boolean).join(', ') || null;

  const apiBase = process.env.API_PUBLIC_URL || 'https://gate.meeshy.me';
  const revokeAllUrl = params.revokeToken
    ? `${apiBase}/api/v1/auth/revoke-all-sessions?token=${params.revokeToken}`
    : `${apiBase}`;

  let previousDeviceName: string | null = null;
  let previousLocation: string | null = null;
  let previousLoginTime: Date | null = null;

  try {
    const { getUserSessions } = await import('../../SessionService');
    const sessions = await getUserSessions(params.recipientUserId);
    const previous = sessions.find(s => !s.isCurrentSession);
    if (previous) {
      previousDeviceName = [previous.browserName, previous.osName].filter(Boolean).join(' - ');
      previousLocation = previous.location || null;
      previousLoginTime = previous.lastActivityAt ? new Date(previous.lastActivityAt) : null;
    }
  } catch {
    // Non-blocking — previous session is optional
  }

  const loginAlertData = {
    deviceName,
    deviceOS,
    appOrBrowser,
    location,
    ip: params.ipAddress || null,
    loginTime: new Date(),
    timezone: geo?.timezone || null,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    previousDeviceName,
    previousLocation,
    previousLoginTime,
    revokeAllUrl,
  };

  const user = await deps.prisma.user.findUnique({
    where: { id: params.recipientUserId },
    select: RECIPIENT_LANG_SELECT
  });
  const lang = recipientLanguage(user, 'fr');
  // Cycle 125 — l'horodatage se lit DANS la notification, donc dans la langue
  // de la notification. `systemLanguage === 'en' ? 'en-US' : 'fr-FR'` était un
  // binaire codé en dur : un lecteur allemand recevait « Neue Anmeldung
  // erkannt » — `notificationString` normalise, lui — daté à la française.
  const locale = recipientDateLocale(user, 'fr');

  const bodyParts: string[] = [];
  if (location) bodyParts.push(location);
  if (params.ipAddress) bodyParts.push(`IP : ${params.ipAddress}`);
  if (deviceName) bodyParts.push(deviceName);
  else if (deviceOS) bodyParts.push(deviceOS);
  const now = new Date();
  bodyParts.push(now.toLocaleString(locale, { timeZone: geo?.timezone || 'UTC', dateStyle: 'short', timeStyle: 'short' }));
  const content = bodyParts.join(' — ');

  const title = notificationString(lang, 'login.newDevice.title');

  return deps.createNotification({
    userId: params.recipientUserId,
    type: 'login_new_device',
    priority: 'high',
    content,
    title,
    context: {},
    metadata: {
      action: 'view_details' as const,
      deviceName,
      deviceVendor: device?.vendor || null,
      deviceOS,
      deviceOSVersion: device?.osVersion || null,
      deviceType: device?.type || null,
      ipAddress: params.ipAddress || null,
      country: geo?.country || null,
      countryName: geo?.countryName || null,
      city: geo?.city || null,
      location,
    },
    _loginAlertData: loginAlertData,
  } as any);
}
