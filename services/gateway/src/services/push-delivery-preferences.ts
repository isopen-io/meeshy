/**
 * Les préférences de l'utilisateur, appliquées au chokepoint de `PushNotificationService.sendToUser` — extraites
 * de ce service (#10267) pour qu'il repasse sous le seuil de taille avant d'y ajouter le filtre de routage.
 * Comportement inchangé : `PushNotificationService.test.ts` (§ isPushAllowed, GW6, GW8) les garde par l'API
 * publique.
 *
 * @module services/push-delivery-preferences
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreference as NotifPrefs,
} from '@meeshy/shared/types/preferences';
import { isWithinDnd } from '@meeshy/shared/utils/notification-dnd';
import { isNotificationRevocationPush } from './notifications/notificationRevocationPush';
import type { PushNotificationPayload, SendPushOptions } from './PushNotificationService';

/**
 * Les types de données des pushes d'APPEL : la sonnerie et ses deux stop-ring.
 * C'est le TYPE qui classe un push en appel — pas `silent`, qu'un second
 * producteur (`notification_revoked`) pose désormais aussi, et qui n'a ni la
 * fenêtre de sonnerie ni sa préférence `callsEnabled`.
 */
const CALL_PUSH_DATA_TYPES: ReadonlySet<string> = new Set(['call', 'call_cancel', 'call_answered_elsewhere']);

export function isCallPushDataType(type: string | undefined): boolean {
  return type !== undefined && CALL_PUSH_DATA_TYPES.has(type);
}

/**
 * GW6 — a call push is any send targeting a `voip` token OR carrying a
 * call-management data type (`call` ring, `call_cancel` / `call_answered_elsewhere`
 * stop-ring). `missed_call` is deliberately NOT in this set: it is a regular
 * notification governed by missedCallEnabled/pushEnabled.
 */
function isCallRelatedPush(options: SendPushOptions): boolean {
  if (options.types?.includes('voip')) return true;
  return isCallPushDataType(options.payload.data?.type);
}

/**
 * Charge UserPreferences.notification fusionnées avec les défauts.
 * Fail open : sur erreur DB, tout est considéré activé (défauts).
 */
async function loadNotifPrefs(prisma: PrismaClient, userId: string): Promise<NotifPrefs> {
  try {
    const userPrefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { notification: true },
    });
    const raw = (userPrefs?.notification ?? {}) as Record<string, unknown>;
    return { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...raw };
  } catch {
    return { ...NOTIFICATION_PREFERENCE_DEFAULTS };
  }
}

/**
 * Vérifie si les push sont autorisés selon UserPreferences.notification
 */
function isPushAllowed(prefs: NotifPrefs, bypassDnd = false, isCallPush = false): boolean {
  // GW6 — call pushes are a dedicated category: only `callsEnabled`
  // governs them. Neither pushEnabled:false nor the DND window applies
  // (calls ring through DND — producers also set bypassDnd:true).
  if (isCallPush) return prefs.callsEnabled ?? true;

  if (!prefs.pushEnabled) return false;

  // Vérifier DND — GW7 : helper PARTAGÉ tz-aware `isWithinDnd`
  // (packages/shared), même implémentation que
  // NotificationService.isDNDActive. La fenêtre est évaluée dans l'heure
  // locale utilisateur (dndUtcOffsetMinutes, 0 = UTC historique).
  if (!bypassDnd && isWithinDnd(prefs)) return false;

  return true;
}

/**
 * GW8 — applique les préférences de LIVRAISON au chokepoint transport,
 * pour couvrir tous les producteurs sans exception :
 *   - `soundEnabled:false`   → bannière sans son (`muted`)
 *   - `notificationBadgeEnabled:false` → `aps.badge` forcé à 0 (miroir du
 *     gate icône de NotificationCoordinator iOS ; `data.unreadCount` reste
 *     intact pour le widget, qui garde le vrai total)
 *   - `groupNotifications:false` → `threadId` retiré (plus d'empilement
 *     par conversation)
 * Jamais appliqué aux pushes d'appel (data-only, sonnerie à part entière).
 */
function applyDeliveryPreferences(payload: PushNotificationPayload, prefs: NotifPrefs): PushNotificationPayload {
  const out: PushNotificationPayload = { ...payload };
  if (prefs.soundEnabled === false) out.muted = true;
  if (prefs.notificationBadgeEnabled === false && out.badge !== undefined) out.badge = 0;
  if (prefs.groupNotifications === false) delete out.threadId;
  return out;
}

/**
 * Les préférences de l'utilisateur, appliquées au chokepoint : `null` quand
 * elles bloquent l'envoi, sinon la charge à livrer (GW8 : sons, badge,
 * regroupement).
 *
 * Un push de RÉVOCATION (`notification_revoked`) n'est gouverné par AUCUNE
 * préférence — DND et `pushEnabled` compris — et n'en lit même pas. C'est un
 * signal de contrôle qui RETIRE une bannière, jamais un contenu : le bloquer
 * laisserait sur l'écran verrouillé une notification que le serveur a
 * supprimée, y compris quand l'opt-out a été posé APRÈS sa livraison.
 */
export async function applyUserPreferences(
  prisma: PrismaClient,
  options: SendPushOptions,
): Promise<PushNotificationPayload | null> {
  const { userId, payload, bypassDnd } = options;
  if (isNotificationRevocationPush(payload)) return payload;

  const isCallPush = isCallRelatedPush(options);
  const notifPrefs = await loadNotifPrefs(prisma, userId);
  if (!isPushAllowed(notifPrefs, bypassDnd, isCallPush)) return null;

  return isCallPush ? payload : applyDeliveryPreferences(payload, notifPrefs);
}
