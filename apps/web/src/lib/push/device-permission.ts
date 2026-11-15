import type { ShellPushPermission, ShellPushPlugin } from './shell-push';

/**
 * **LA PERMISSION DE NOTIFICATION DE L'APPAREIL, VUE DEPUIS LES RÉGLAGES** (#7307).
 *
 * Android 13+ ne redemande plus après un refus : la rangée « Notifications »
 * des réglages mentirait si elle ne disait pas que CET appareil n'en recevra
 * aucune. Trois états dessinés, et chacun a son geste :
 *
 * - `granted` — rien à montrer ; la bascule `pushEnabled` gouverne ;
 * - `prompt`  — jamais demandée : « Activer » ouvre le dialogue système ;
 * - `denied`  — refusée : « Ouvrir les réglages » mène à l'écran système des
 *   notifications de l'app (`MeeshyNotificationSettingsPlugin.java`), le seul
 *   chemin de retour.
 *
 * Une permission qui DEVIENT accordée (dialogue accepté, retour des réglages
 * système) déclenche `register()` : le jeton part alors par l'écouteur
 * `registration` que `startShellPush` a posé, sous le compte courant.
 */
export type DevicePushPermission = 'granted' | 'denied' | 'prompt';

export type DevicePushControl = {
  readonly refresh: () => Promise<DevicePushPermission>;
  readonly ask: () => Promise<DevicePushPermission>;
  readonly openSettings: () => Promise<void>;
};

export type NotificationSettingsBridge = { open(): Promise<void> };

export function devicePushPermissionOf(receive: ShellPushPermission): DevicePushPermission {
  if (receive === 'granted' || receive === 'denied') return receive;
  return 'prompt';
}

export function devicePushControl(input: {
  readonly plugin: Pick<ShellPushPlugin, 'checkPermissions' | 'requestPermissions' | 'register'>;
  readonly settings: NotificationSettingsBridge;
}): DevicePushControl {
  const { plugin, settings } = input;
  let last: DevicePushPermission | null = null;

  const settle = async (receive: ShellPushPermission): Promise<DevicePushPermission> => {
    const permission = devicePushPermissionOf(receive);
    const becameGranted = permission === 'granted' && last !== null && last !== 'granted';
    last = permission;
    if (becameGranted) await plugin.register().catch(() => undefined);
    return permission;
  };

  return {
    refresh: async () => settle((await plugin.checkPermissions().catch(() => ({ receive: 'denied' as const }))).receive),
    ask: async () => {
      if (last === null) last = devicePushPermissionOf((await plugin.checkPermissions().catch(() => ({ receive: 'denied' as const }))).receive);
      return settle((await plugin.requestPermissions().catch(() => ({ receive: 'denied' as const }))).receive);
    },
    openSettings: () => settings.open().catch(() => undefined),
  };
}
