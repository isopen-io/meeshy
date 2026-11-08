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
 * Deux applications publient sur `platform: 'android'` : l'application native (`apps/android`, publiée sous
 * `me.meeshy.app` depuis qu'elle a repris la fiche Play de la coque, #13619 ; `me.meeshy.android` avant) et la coque
 * Capacitor (`apps/web/android`, renommée `me.meeshy.webapp`, qui pose la version de `@meeshy/web`). Un jeton
 * `me.meeshy.app` est donc lu NATIF, y compris celui qu'une coque 2.x avait déclaré : la mise à jour vers la native
 * garde le jeton FCM et son `bundleId`, et la native ne crée pas les canaux propres à la coque. Un jeton Android sans
 * `bundleId` reconnu n'est d'aucune des deux, il ne reçoit aucun type à plancher.
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

/** Un plancher qui n'exige AUCUNE version lisible : tout jeton du client reçoit le type (`bring_stopped` iOS). */
export const ANY_VERSION = '*';

export type PushTypeRoutingFloors = ReadonlyMap<string, Readonly<Record<PushRoutingClient, string | null>>>;

/**
 * `bring` (#13936) n'a PAS de plancher, et c'est voulu : la sonnerie est une ALERTE dont le titre et le corps disent
 * tout (« X fait sonner votre téléphone ») — un ancien iOS la rend avec la sonnerie d'appel, un ancien Android natif
 * en fait une bannière ordinaire. Pour une urgence, une bannière vaut mieux que rien.
 *
 * `bring_stopped` remplace sur iOS la bannière de la sonnerie (alerte passive, même `collapse-id`) : TOUT jeton iOS
 * la reçoit, version lisible ou non (`ANY_VERSION`). Sur Android c'est un data-only sans titre, qu'un ancien
 * Android natif rendrait en bannière VIDE. Il ne part donc vers l'Android natif qu'à partir de la 3.1.0, la
 * version qui l'arrête (`proche-bring@android`) et qui déclare enfin `appVersion` + `bundleId` sur son jeton.
 * La coque et le navigateur ne sonnent que par la socket : rien à arrêter par push.
 */
const BRING_STOPPED_FLOORS: Readonly<Record<PushRoutingClient, string | null>> = {
  ios: ANY_VERSION, 'android-native': '3.1.0', 'android-shell': null, web: null,
};

/**
 * `game_photo_moment` : la coque et le navigateur le routent (vers `/me/progression/carnet`) depuis la première
 * version de `@meeshy/web` construite après l'arrivée de `GAME_PHOTO_TYPES` dans `target.ts` et `sw-push.js`
 * (2026-10-25, 52e409b9d), soit la 2.23.0 : la 2.22.0 a été coupée avant. iOS et l'Android natif ne le routent pas encore.
 */
/**
 * `talkie_incoming` (#17142) : un réveil qui n'est utile qu'à un client qui sait émettre `talkie:join` et jouer la voix
 * depuis la notification ; un ancien client n'en ferait qu'une bannière vide (Android data-only) ou inutile. Aucun
 * client publié ne le route encore : chaque lot client pose ici sa première version. La porte du talkie lit la MÊME
 * table (`talkieWakeChannel`) — sans appareil capable, la voix se replie en message vocal au lieu d'attendre en vain.
 */
const TALKIE_INCOMING_FLOORS: Readonly<Record<PushRoutingClient, string | null>> = {
  ios: null, 'android-native': null, 'android-shell': null, web: null,
};

export const PUSH_TYPE_ROUTING_FLOORS: PushTypeRoutingFloors = new Map([
  ['game_photo_moment', { ios: null, 'android-native': null, 'android-shell': '2.23.0', web: '2.23.0' }],
  ['bring_stopped', BRING_STOPPED_FLOORS],
  ['talkie_incoming', TALKIE_INCOMING_FLOORS],
]);

const ANDROID_NATIVE_BUNDLE = /^me\.meeshy\.(app|android)(\.|$)/;
const ANDROID_SHELL_BUNDLE = /^me\.meeshy\.webapp(\.|$)/;
const READABLE_VERSION = /^\d+(\.\d+){0,2}(?=$|[\s(+-])/;

export function pushRoutingClientOf(token: Pick<RoutableToken, 'platform' | 'bundleId'>): PushRoutingClient | null {
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
  if (floor === ANY_VERSION) return true;
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
