/**
 * LA CONFIGURATION DES TRANSPORTS DE PUSH (#17249), lue une fois depuis l'environnement.
 *
 * APNs n'est PRÊT que complet : activé (`ENABLE_PUSH_NOTIFICATIONS` et `ENABLE_APNS_PUSH`
 * différents de `false`), Key ID, Team ID et clé (`APNS_KEY_PATH` ou `APNS_KEY_CONTENT`).
 * Le bundle a un défaut (`me.meeshy.app`) : son absence se dit, elle n'empêche rien.
 *
 * Sans APNs prêt, aucun push iOS, VoIP ni PushToTalk ne part : la porte du talkie le sait
 * (`PushNotificationService.deliveryTransports`) et se replie en message vocal au lieu
 * d'attendre un réveil qui ne part pas. Le démarrage le dit (`warnPushConfiguration`), sans
 * jamais imprimer la clé, le Key ID ni le Team ID.
 */
import { existsSync } from 'fs';

export type PushTransports = { readonly apns: boolean; readonly fcm: boolean };

type Env = Readonly<Record<string, string | undefined>>;

export type PushTransportConfig = {
  readonly enabled: boolean;
  readonly apnsEnabled: boolean;
  readonly fcmEnabled: boolean;
  readonly voipEnabled: boolean;
  readonly firebaseCredentialsPath: string | undefined;
  readonly apns: {
    readonly keyId: string | undefined;
    readonly teamId: string | undefined;
    readonly keyPath: string | undefined;
    readonly keyContent: string | undefined;
    readonly bundleId: string;
    readonly bundleFromEnv: boolean;
    readonly voipBundleId: string;
  };
};

const DEFAULT_BUNDLE_ID = 'me.meeshy.app';
const present = (value: string | undefined): string | undefined => (value && value.trim() !== '' ? value : undefined);

export function pushTransportConfigFromEnv(env: Env): PushTransportConfig {
  const bundleId = present(env.APNS_BUNDLE_ID);
  return {
    enabled: env.ENABLE_PUSH_NOTIFICATIONS !== 'false',
    apnsEnabled: env.ENABLE_APNS_PUSH !== 'false',
    fcmEnabled: env.ENABLE_FCM_PUSH !== 'false',
    voipEnabled: env.ENABLE_VOIP_PUSH !== 'false',
    firebaseCredentialsPath: present(env.FIREBASE_ADMIN_CREDENTIALS_PATH),
    apns: {
      keyId: present(env.APNS_KEY_ID),
      teamId: present(env.APNS_TEAM_ID),
      keyPath: present(env.APNS_KEY_PATH),
      keyContent: present(env.APNS_KEY_CONTENT),
      bundleId: bundleId ?? DEFAULT_BUNDLE_ID,
      bundleFromEnv: bundleId !== undefined,
      voipBundleId: present(env.APNS_VOIP_BUNDLE_ID) ?? `${DEFAULT_BUNDLE_ID}.voip`,
    },
  };
}

/** Ce qui manque pour qu'APNs parte, par NOM de variable ; vide ⇒ prêt. */
export function apnsConfigurationGaps(config: PushTransportConfig): readonly string[] {
  if (!config.enabled) return ['ENABLE_PUSH_NOTIFICATIONS=false'];
  if (!config.apnsEnabled) return ['ENABLE_APNS_PUSH=false'];
  const { apns } = config;
  return [
    ...(apns.keyId ? [] : ['APNS_KEY_ID']),
    ...(apns.teamId ? [] : ['APNS_TEAM_ID']),
    ...(apns.keyPath || apns.keyContent ? [] : ['APNS_KEY_PATH|APNS_KEY_CONTENT']),
  ];
}

export const apnsReady = (config: PushTransportConfig): boolean => apnsConfigurationGaps(config).length === 0;

export type PushConfigurationLine = {
  readonly transport: 'apns' | 'fcm';
  readonly level: 'warn' | 'info';
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
};

const APNS_OFF =
  '[PUSH_CONFIG] APNs inactif : aucun push iOS, VoIP ni PushToTalk ne part — le talkie se replie en message vocal au lieu de réveiller un iPhone';

function apnsLine(config: PushTransportConfig, fileExists: (path: string) => boolean): PushConfigurationLine {
  const { apns } = config;
  const keyFileMissing = apnsReady(config) && !apns.keyContent && apns.keyPath !== undefined && !fileExists(apns.keyPath);
  const missing = keyFileMissing ? ['APNS_KEY_PATH (fichier introuvable)'] : apnsConfigurationGaps(config);
  if (missing.length > 0) return { transport: 'apns', level: 'warn', message: APNS_OFF, fields: { missing } };
  return {
    transport: 'apns',
    level: 'info',
    message: '[PUSH_CONFIG] APNs prêt (sandbox et production, choisis par jeton)',
    fields: { bundleId: apns.bundleId, bundleFromEnv: apns.bundleFromEnv, keySource: apns.keyContent ? 'content' : 'path' },
  };
}

function fcmGaps(config: PushTransportConfig): readonly string[] {
  if (!config.enabled) return ['ENABLE_PUSH_NOTIFICATIONS=false'];
  if (!config.fcmEnabled) return ['ENABLE_FCM_PUSH=false'];
  return config.firebaseCredentialsPath ? [] : ['FIREBASE_ADMIN_CREDENTIALS_PATH'];
}

function fcmLine(config: PushTransportConfig): PushConfigurationLine {
  const missing = fcmGaps(config);
  return missing.length > 0
    ? { transport: 'fcm', level: 'warn', message: '[PUSH_CONFIG] FCM inactif : aucun push Android ni web ne part', fields: { missing } }
    : { transport: 'fcm', level: 'info', message: '[PUSH_CONFIG] FCM configuré', fields: {} };
}

export function pushConfigurationReport(
  config: PushTransportConfig,
  fileExists: (path: string) => boolean = existsSync,
): readonly PushConfigurationLine[] {
  return [apnsLine(config, fileExists), fcmLine(config)];
}

/** Au démarrage : une ligne par transport, à son niveau. */
export function warnPushConfiguration(
  logger: { readonly warn: (message: string, fields: object) => void; readonly info: (message: string, fields: object) => void },
  env: Env = process.env,
  fileExists: (path: string) => boolean = existsSync,
): void {
  pushConfigurationReport(pushTransportConfigFromEnv(env), fileExists).forEach((line) => logger[line.level](line.message, line.fields));
}
