/**
 * QUI SAIT OUVRIR QUOI (#10267, § 5.16.4 « Rétrocompatibilité ») — un push dont le TYPE est neuf ne part que vers
 * un appareil dont la version sait le router. Un ancien client ne reçoit RIEN plutôt qu'une bannière qu'il ne
 * sait pas ouvrir : la ligne `Notification` reste dans la cloche, que tout client lit.
 *
 * La loi est fail-closed : un type qui déclare un plancher n'est servi qu'à un jeton dont la plateforme est connue,
 * dont le client déclare une version de routage, et dont `appVersion` (posé par `routes/push-tokens.ts`) se lit et
 * atteint ce plancher. Un plancher `null` dit « ce client ne route pas encore ce type » : aucune version ne l'ouvre.
 * Un type absent de la table part partout, comme avant.
 *
 * Deux applications publient sur `platform: 'android'` : la coque Capacitor (`apps/web/android`, publiée sous
 * `me.meeshy.app`, qui n'envoie pas de `bundleId` et pose la version de `@meeshy/web`) et l'application native
 * (`apps/android`, publiée sous `me.meeshy.android`, décision #11570). L'identifiant de publication les sépare.
 * Le navigateur et la coque sont le MÊME code (`target.ts`, `sw-push.js`) : même plancher.
 */
import { compareAppVersions } from '../utils/appVersion';

export type PushRoutingClient = 'ios' | 'android-native' | 'android-shell' | 'web';

export type RoutableToken = {
  readonly platform: string;
  readonly appVersion: string | null;
  readonly bundleId: string | null;
};

export type PushTypeRoutingFloors = ReadonlyMap<string, Readonly<Record<PushRoutingClient, string | null>>>;

/**
 * `game_photo_moment` : la coque et le navigateur le routent (vers `/me/progression/carnet`) depuis la première
 * version de `@meeshy/web` construite après l'arrivée de `GAME_PHOTO_TYPES` dans `target.ts` et `sw-push.js`
 * (2026-10-24), soit la 2.23.0 : la 2.22.0 a été coupée avant. iOS et l'Android natif ne le routent pas encore.
 */
export const PUSH_TYPE_ROUTING_FLOORS: PushTypeRoutingFloors = new Map([
  ['game_photo_moment', { ios: null, 'android-native': null, 'android-shell': '2.23.0', web: '2.23.0' }],
]);

const ANDROID_NATIVE_BUNDLE = /^me\.meeshy\.android(\.|$)/;
const READABLE_VERSION = /^\d+(\.\d+){0,2}(?=$|[\s(+-])/;

export function pushRoutingClientOf(token: RoutableToken): PushRoutingClient | null {
  if (token.platform === 'ios') return 'ios';
  if (token.platform === 'web') return 'web';
  if (token.platform !== 'android') return null;
  return typeof token.bundleId === 'string' && ANDROID_NATIVE_BUNDLE.test(token.bundleId) ? 'android-native' : 'android-shell';
}

const readableVersion = (appVersion: string | null): string | null =>
  typeof appVersion === 'string' ? (READABLE_VERSION.exec(appVersion.trim())?.[0] ?? null) : null;

export function tokenRoutesPushType(
  token: RoutableToken,
  type: string | undefined,
  floors: PushTypeRoutingFloors = PUSH_TYPE_ROUTING_FLOORS,
): boolean {
  const byClient = type === undefined ? undefined : floors.get(type);
  if (byClient === undefined) return true;
  const client = pushRoutingClientOf(token);
  const floor = client === null ? null : byClient[client];
  const version = readableVersion(token.appVersion);
  if (floor === null || version === null) return false;
  return compareAppVersions(version, floor) >= 0;
}
