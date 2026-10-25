/**
 * #10267 (§ 5.16.4, « Rétrocompatibilité ») — un push dont le TYPE exige une version de client ne part que vers
 * les appareils qui savent l'ouvrir. La loi est pure (`tokenRoutesPushType`) ; le chokepoint
 * (`PushNotificationService.sendToUser`) l'applique à chaque jeton avant tout envoi. Fail-closed : un jeton sans
 * `appVersion`, à la version illisible, d'une plateforme inconnue ou d'un client qui ne route pas encore le type
 * ne reçoit RIEN. Les autres types de notification ne changent pas.
 *
 * Le chokepoint se lit sans fournisseur : sans Firebase ni APNs initialisés, chaque jeton ATTEINT rend un échec
 * nommé — la liste des `tokenId` rendus est exactement la liste des appareils servis.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  PUSH_TYPE_ROUTING_FLOORS,
  pushRoutingClientOf,
  tokenRoutesPushType,
  type RoutableToken,
} from '../../../services/push-type-routing';
import { PushNotificationService } from '../../../services/PushNotificationService';

jest.mock('../../../utils/logger-enhanced', () => {
  const logger = { trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };
  return {
    __esModule: true,
    enhancedLogger: { ...logger, child: jest.fn(() => logger) },
    performanceLogger: { start: jest.fn(() => ({ end: jest.fn() })) },
    notificationLogger: logger,
  };
});

const PHOTO = 'game_photo_moment';

const shell = (appVersion: string | null): RoutableToken => ({ platform: 'android', appVersion, bundleId: 'me.meeshy.app' });
const iphone = (appVersion: string | null): RoutableToken => ({ platform: 'ios', appVersion, bundleId: 'me.meeshy.app' });
const browser = (appVersion: string | null): RoutableToken => ({ platform: 'web', appVersion, bundleId: null });
const nativeAndroid = (appVersion: string | null): RoutableToken => ({ platform: 'android', appVersion, bundleId: 'me.meeshy.android' });

const floorOf = (client: 'ios' | 'android-native' | 'android-shell' | 'web'): string | null =>
  PUSH_TYPE_ROUTING_FLOORS.get(PHOTO)?.[client] ?? null;

describe('tokenRoutesPushType — la loi', () => {
  it('sert un jeton de la coque à la version minimale ou au-delà', () => {
    const floor = floorOf('android-shell');
    expect(floor).not.toBeNull();
    expect(tokenRoutesPushType(shell(floor), PHOTO)).toBe(true);
    expect(tokenRoutesPushType(shell('99.0.0'), PHOTO)).toBe(true);
  });

  it('exclut un jeton trop ancien', () => {
    expect(tokenRoutesPushType(shell('2.22.0'), PHOTO)).toBe(false);
    expect(tokenRoutesPushType(shell('1.99.99'), PHOTO)).toBe(false);
  });

  it('exclut un jeton sans appVersion, vide ou illisible (fail-closed)', () => {
    expect(tokenRoutesPushType(shell(null), PHOTO)).toBe(false);
    expect(tokenRoutesPushType(shell(''), PHOTO)).toBe(false);
    expect(tokenRoutesPushType(shell('latest'), PHOTO)).toBe(false);
    expect(tokenRoutesPushType(shell('v99'), PHOTO)).toBe(false);
  });

  it('exclut un client qui ne route pas encore le type, quelle que soit sa version', () => {
    expect(floorOf('ios')).toBeNull();
    expect(tokenRoutesPushType(iphone('99.0.0 (1)'), PHOTO)).toBe(false);
    expect(floorOf('android-native')).toBeNull();
    expect(tokenRoutesPushType(nativeAndroid('99.0.0'), PHOTO)).toBe(false);
    expect(tokenRoutesPushType({ platform: 'android', appVersion: '99.0.0', bundleId: 'me.meeshy.android.debug' }, PHOTO)).toBe(false);
  });

  it('exclut un jeton Android qui ne dit pas quelle application l’a enregistré (fail-closed)', () => {
    for (const bundleId of [null, '', 'com.example.app', 'me.meeshy.application']) {
      const token = { platform: 'android', appVersion: '99.0.0', bundleId };
      expect(pushRoutingClientOf(token)).toBeNull();
      expect(tokenRoutesPushType(token, PHOTO)).toBe(false);
    }
  });

  it('exclut une plateforme inconnue', () => {
    expect(tokenRoutesPushType({ platform: 'windows', appVersion: '99.0.0', bundleId: null }, PHOTO)).toBe(false);
  });

  it('lit la version d’un navigateur comme celle de la coque, même code', () => {
    expect(floorOf('web')).toBe(floorOf('android-shell'));
    expect(tokenRoutesPushType(browser(floorOf('web')), PHOTO)).toBe(true);
    expect(tokenRoutesPushType(browser('2.22.0'), PHOTO)).toBe(false);
  });

  it('lit la version iOS « court (build) » par sa partie courte', () => {
    const floors = new Map([[PHOTO, { ios: '1.4.0', 'android-native': null, 'android-shell': null, web: null }]]);
    expect(tokenRoutesPushType(iphone('1.4.0 (812)'), PHOTO, floors)).toBe(true);
    expect(tokenRoutesPushType(iphone('1.3.9 (999)'), PHOTO, floors)).toBe(false);
    expect(tokenRoutesPushType(iphone('1.10'), PHOTO, floors)).toBe(true);
  });

  it('laisse passer tout type qui ne déclare aucun plancher, même sans appVersion', () => {
    for (const type of ['new_message', 'game_duo_invited', 'notification_revoked', 'call', undefined]) {
      expect(tokenRoutesPushType(shell(null), type)).toBe(true);
      expect(tokenRoutesPushType(iphone(null), type)).toBe(true);
    }
  });

  it('ne lit jamais un plancher dans le prototype d’un objet', () => {
    expect(tokenRoutesPushType(shell(null), 'constructor')).toBe(true);
    expect(tokenRoutesPushType(shell(null), '__proto__')).toBe(true);
  });

  it('distingue la coque et l’application native Android par l’identifiant de publication', () => {
    expect(pushRoutingClientOf(shell('2.23.0'))).toBe('android-shell');
    expect(pushRoutingClientOf({ platform: 'android', appVersion: '2.23.0', bundleId: 'me.meeshy.app.debug' })).toBe('android-shell');
    expect(pushRoutingClientOf(nativeAndroid('0.1.0'))).toBe('android-native');
    expect(pushRoutingClientOf(iphone('1.0'))).toBe('ios');
    expect(pushRoutingClientOf(browser('2.23.0'))).toBe('web');
    expect(pushRoutingClientOf({ platform: 'tv', appVersion: '1', bundleId: null })).toBeNull();
  });
});

type TokenRow = RoutableToken & { readonly id: string; readonly token: string; readonly type: string; readonly apnsEnvironment: string | null };

const row = (id: string, base: RoutableToken, type = base.platform === 'ios' ? 'apns' : 'fcm'): TokenRow => ({
  ...base,
  id,
  token: `token-${id}-0123456789`,
  type,
  apnsEnvironment: type === 'apns' ? 'production' : null,
});

const makePrisma = (rows: readonly TokenRow[]) => ({
  pushToken: {
    findMany: jest.fn(async () => rows),
    findUnique: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
  },
  userPreferences: { findUnique: jest.fn(async () => null) },
});

const servedTokenIds = async (rows: readonly TokenRow[], type: string | undefined): Promise<readonly string[]> => {
  const prisma = makePrisma(rows);
  const service = new PushNotificationService(prisma as never);
  const results = await service.sendToUser({
    userId: 'player_id',
    types: ['apns', 'fcm'],
    payload: { title: 'Meeshy', body: 'Un moment de ton aventure peut rejoindre ton carnet.', ...(type ? { data: { type } } : {}) },
  });
  return results.map((result) => result.tokenId).sort();
};

const FLEET: readonly TokenRow[] = [
  row('shell-current', shell(floorOf('android-shell'))),
  row('shell-old', shell('2.22.0')),
  row('shell-unknown', shell(null)),
  row('iphone', iphone('9.9.9 (1)')),
  row('native-android', nativeAndroid(null)),
];

describe('PushNotificationService.sendToUser — le chokepoint applique la loi', () => {
  it('un push photo ne part que vers le jeton à jour', async () => {
    expect(await servedTokenIds(FLEET, PHOTO)).toEqual(['shell-current']);
  });

  it('demande la version et l’identifiant de publication de chaque jeton', async () => {
    const prisma = makePrisma([]);
    await new PushNotificationService(prisma as never).sendToUser({ userId: 'u', payload: { title: 't', body: 'b', data: { type: PHOTO } } });
    const [args] = prisma.pushToken.findMany.mock.calls[0] as unknown as [{ select: Record<string, boolean> }];
    expect(args.select).toMatchObject({ appVersion: true, bundleId: true, platform: true });
  });

  it('les autres types partent vers tous les jetons, comme avant', async () => {
    const everyone = FLEET.map(({ id }) => id).sort();
    expect(await servedTokenIds(FLEET, 'new_message')).toEqual(everyone);
    expect(await servedTokenIds(FLEET, 'game_duo_invited')).toEqual(everyone);
    expect(await servedTokenIds(FLEET, undefined)).toEqual(everyone);
  });

  it('aucun appareil capable ⇒ rien ne part, sans erreur', async () => {
    expect(await servedTokenIds([row('shell-old', shell('2.0.0')), row('iphone', iphone(null))], PHOTO)).toEqual([]);
  });
});
