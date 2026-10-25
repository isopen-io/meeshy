/**
 * QUI SAIT OUVRIR QUOI (#10267, § 5.16.4 « Rétrocompatibilité ») — un push dont le TYPE est neuf ne part que vers
 * un appareil dont la version sait le router. Un ancien client ne reçoit RIEN plutôt qu'une bannière dont le tap
 * n'ouvre pas ce qu'elle annonce : la ligne `Notification` reste dans la cloche, que tout client lit.
 *
 * La loi est fail-closed : un type qui déclare un plancher n'est servi qu'à un jeton dont la plateforme est connue,
 * dont le client déclare une version de routage, et dont `appVersion` (posé par `routes/push-tokens.ts`) se lit et
 * atteint ce plancher. Un plancher `null` dit « ce client ne route pas encore ce type » : aucune version ne l'ouvre.
 * Un type absent de la table part partout, comme avant.
 *
 * Deux applications publient sur `platform: 'android'` : la coque Capacitor (`apps/web/android`, publiée sous
 * `me.meeshy.app`, qui pose la version de `@meeshy/web`) et l'application native (`apps/android`, publiée sous
 * `me.meeshy.android`, décision #11570). L'identifiant de publication les sépare, et chacune doit le DÉCLARER : un
 * jeton Android sans `bundleId` reconnu n'est d'aucune des deux, il ne reçoit aucun type à plancher. La coque le
 * déclare depuis la 2.23.0 (`apps/web/src/lib/push/shell-push.ts`) ; l'application native ne l'envoie pas encore.
 * Le navigateur et la coque sont le MÊME code (`target.ts`, `sw-push.js`) : même plancher.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
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
 * (2026-10-25, 52e409b9d), soit la 2.23.0 : la 2.22.0 a été coupée avant. iOS et l'Android natif ne le routent pas encore.
 */
export const PUSH_TYPE_ROUTING_FLOORS: PushTypeRoutingFloors = new Map([
  ['game_photo_moment', { ios: null, 'android-native': null, 'android-shell': '2.23.0', web: '2.23.0' }],
]);

const ANDROID_NATIVE_BUNDLE = /^me\.meeshy\.android(\.|$)/;
const ANDROID_SHELL_BUNDLE = /^me\.meeshy\.app(\.|$)/;
const READABLE_VERSION = /^\d+(\.\d+){0,2}(?=$|[\s(+-])/;

export function pushRoutingClientOf(token: RoutableToken): PushRoutingClient | null {
  if (token.platform === 'ios') return 'ios';
  if (token.platform === 'web') return 'web';
  if (token.platform !== 'android') return null;
  const bundleId = typeof token.bundleId === 'string' ? token.bundleId : '';
  if (ANDROID_NATIVE_BUNDLE.test(bundleId)) return 'android-native';
  return ANDROID_SHELL_BUNDLE.test(bundleId) ? 'android-shell' : null;
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

/** Les jetons qu'une notification ordinaire atteint au chokepoint : jamais `voip` (`NotificationService.createNotification`). */
const NOTIFICATION_TOKEN_TYPES = ['apns', 'fcm'] as const;

/**
 * Le compte a-t-il AU MOINS un appareil que le chokepoint servirait pour ce type ? La même loi, lue AVANT
 * d'annoncer : un producteur qui consigne « annoncé par push » (le registre photo, `notifiedAt`) ne le fait que
 * si un push PEUT partir — sinon l'étape serait tenue pour présentée sans qu'aucun écran ne l'ait montrée.
 */
export async function accountRoutesPushType(
  prisma: { readonly pushToken: Pick<PrismaClient['pushToken'], 'findMany'> },
  userId: string,
  type: string,
): Promise<boolean> {
  const tokens = await prisma.pushToken.findMany({
    where: { userId, isActive: true, type: { in: [...NOTIFICATION_TOKEN_TYPES] } },
    select: { platform: true, appVersion: true, bundleId: true },
  });
  return tokens.some((token) => tokenRoutesPushType(token, type));
}
