import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { httpTransport } from '@/lib/api/client';
import { sessionStore } from '@/lib/api/session';
import type { PushTapTarget } from '@/lib/notifications/target';
import { href, navigate } from '@/routes/route-table';

import { devicePushControl, type DevicePushControl, type NotificationSettingsBridge } from './device-permission';
import { withFcmGuard } from './fcm-guard';
import { startShellPush, type ShellPushPlugin } from './shell-push';

/** Le pont de la coque : l'écran système des notifications, et l'état de FCM (#8477). */
type ShellNotificationBridge = NotificationSettingsBridge & {
  fcmStatus(): Promise<{ readonly configured: boolean }>;
};

const notificationBridge = (): ShellNotificationBridge =>
  registerPlugin<ShellNotificationBridge>('MeeshyNotificationSettings');

let guardedPlugin: ShellPushPlugin | null = null;

/**
 * LE plugin push de la coque, derrière la garde FCM (#8477) — UNE instance,
 * donc UNE sonde, pour l'abonnement comme pour les réglages.
 */
function shellPushPlugin(): ShellPushPlugin {
  guardedPlugin ??= withFcmGuard(PushNotifications, async () => (await notificationBridge().fcmStatus()).configured);
  return guardedPlugin;
}

/**
 * L'ADRESSE d'une destination de tap, par le `href` du routeur — jamais un
 * littéral de route (le défaut qu'a porté `firebase-messaging-sw.js`).
 */
export function shellPushUrl(target: PushTapTarget): string {
  switch (target.route) {
    case 'thread':
      return href('thread', target.params);
    case 'story':
      return href('story', target.params);
    case 'post':
      return href('post', target.params);
    case 'discover':
      return href('discover', undefined, target.search);
    case 'userProfile':
      return href('userProfile', target.params);
    case 'progression':
      return href('progression');
    case 'settings':
      return href('settings');
    case 'notifications':
      return href('notifications');
  }
}

/**
 * LES RÉELS de la coque (#7307). Chargé par `import()` derrière `__SHELL__`
 * (`main.tsx`) : rollup élimine ce module — et le plugin — du build web.
 *
 * Le `dist-capacitor/` servi dans un NAVIGATEUR (recette de
 * `check-shell-dist.mjs`) n'a pas le pont natif : le plugin y lève « not
 * implemented on web ». Sans pont, rien ne démarre.
 */
export async function startShellPushInShell(): Promise<void> {
  if (!Capacitor.isPluginAvailable('PushNotifications')) return;
  await startShellPush({
    plugin: shellPushPlugin(),
    sessionStore,
    transport: httpTransport,
    navigate: (url) => navigate(url),
    urlOf: shellPushUrl,
    appVersion: __APP_VERSION__,
  });
}

/**
 * LA PERMISSION DE L'APPAREIL POUR LES RÉGLAGES (#7307) — `null` sans pont
 * natif, où aucune rangée ne se dessine.
 */
export function shellDevicePushControl(): DevicePushControl | null {
  if (!Capacitor.isPluginAvailable('PushNotifications')) return null;
  return devicePushControl({
    plugin: shellPushPlugin(),
    settings: notificationBridge(),
  });
}
