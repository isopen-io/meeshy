import type { ShellPushPlugin } from './shell-push';

/**
 * **SANS FCM, `register()` N'ATTEINT JAMAIS LE NATIF** (#8477).
 *
 * Une coque construite sans `google-services.json` (#7302, P1) n'a aucune
 * `FirebaseApp` : `PushNotificationsPlugin.register` lève alors
 * `IllegalStateException` sur le fil `CapacitorPlugins`, hors de portée de
 * tout `.catch` JS, et le processus meurt — juste après la connexion, dès que
 * la permission est accordée.
 *
 * La coque DIT si FCM est configuré (`MeeshyNotificationSettings.fcmStatus`) ;
 * cette garde est le site UNIQUE qui s'en sert, partagé par l'abonnement
 * (`shell-push.ts`) et les réglages (`device-permission.ts`). Une sonde qui
 * échoue — un pont plus ancien qui ne connaît pas la méthode — FERME la garde :
 * mieux vaut aucun push qu'un plantage.
 */
export function withFcmGuard(plugin: ShellPushPlugin, isConfigured: () => Promise<boolean>): ShellPushPlugin {
  let probe: Promise<boolean> | null = null;
  const configured = (): Promise<boolean> => {
    probe ??= isConfigured().catch(() => false);
    return probe;
  };
  return {
    checkPermissions: () => plugin.checkPermissions(),
    requestPermissions: () => plugin.requestPermissions(),
    register: async () => {
      if (await configured()) await plugin.register();
    },
    unregister: () => plugin.unregister(),
    createChannel: (channel) => plugin.createChannel(channel),
    addListener: ((eventName: never, listener: never) => plugin.addListener(eventName, listener)) as ShellPushPlugin['addListener'],
  };
}
