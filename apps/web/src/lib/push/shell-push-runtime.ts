import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { httpTransport } from '@/lib/api/client';
import { sessionStore } from '@/lib/api/session';
import type { PushTapTarget } from '@/lib/notifications/target';
import { href, navigate } from '@/routes/route-table';

import { startShellPush } from './shell-push';

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
    plugin: PushNotifications,
    sessionStore,
    transport: httpTransport,
    navigate: (url) => navigate(url),
    urlOf: shellPushUrl,
    appVersion: __APP_VERSION__,
  });
}
