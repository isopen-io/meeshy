/**
 * #17249 — une voix ne se met en attente d'un réveil que si ce réveil PEUT partir : un jeton
 * PushToTalk sans client APNs ne réveille personne, et le talkie se replie au lieu d'afficher
 * « Réveil de… » pendant toute la parole. Et un réveil parti sans rien livrer le dit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { resolveTalkieWake, sendTalkieWake, talkieWakeOutcome } from '../../../../services/talkie/talkiePush';

const U = '507f1f77bcf86cd799439022';
const NOW = new Date('2026-11-09T10:00:00Z');
const TALKIE = 'c'.repeat(24);

type Token = { readonly id: string; readonly type: string; readonly platform: string; readonly appVersion: string | null; readonly bundleId: string | null; readonly sessionId: string | null };

const PTT: Token = { id: 'ptt', type: 'pushtotalk', platform: 'ios', appVersion: '1.1.8', bundleId: 'me.meeshy.app', sessionId: 's-ok' };
const IOS_CAPABLE: Token = { id: 'ios', type: 'apns', platform: 'ios', appVersion: '1.1.8', bundleId: 'me.meeshy.app', sessionId: null };
const IOS_OLD: Token = { id: 'ios-old', type: 'apns', platform: 'ios', appVersion: '1.0.0', bundleId: 'me.meeshy.app', sessionId: null };

const prismaWith = (tokens: readonly Token[]) => ({
  pushToken: {
    findMany: jest.fn(async (_args: unknown) => tokens),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  userSession: { findMany: jest.fn(async () => [{ id: 's-ok' }]) },
});

const LIVE = { apns: true, fcm: true } as const;
const NO_APNS = { apns: false, fcm: true } as const;
const NOTHING = { apns: false, fcm: false } as const;

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('#17249 — le réveil ne s’annonce que s’il peut partir', () => {
  it('jeton PushToTalk et APNs configuré : pushtotalk (cas nominal inchangé)', async () => {
    expect(await resolveTalkieWake(prismaWith([PTT]) as never, U, LIVE, NOW)).toBe('pushtotalk');
  });

  it('jeton PushToTalk SANS client APNs (le staging du 2026-11-09) : aucun réveil, la cause est APNs', async () => {
    expect(await resolveTalkieWake(prismaWith([PTT]) as never, U, NO_APNS, NOW)).toEqual({ miss: 'apns-not-configured' });
  });

  it('jeton APNs d’un client qui route talkie_incoming : push si APNs est prêt, sinon la cause', async () => {
    expect(await resolveTalkieWake(prismaWith([IOS_CAPABLE]) as never, U, LIVE, NOW)).toBe('push');
    expect(await resolveTalkieWake(prismaWith([IOS_CAPABLE]) as never, U, NOTHING, NOW)).toEqual({ miss: 'apns-not-configured' });
  });

  it('aucun jeton capable de réveiller : no-token, quels que soient les transports', async () => {
    expect(await resolveTalkieWake(prismaWith([]) as never, U, LIVE, NOW)).toEqual({ miss: 'no-token' });
    expect(await resolveTalkieWake(prismaWith([IOS_OLD]) as never, U, LIVE, NOW)).toEqual({ miss: 'no-token' });
  });

  it('pushs coupés pour tout le processus : push-disabled, sans lire de jeton', async () => {
    process.env.ENABLE_PUSH_NOTIFICATIONS = 'false';
    const prisma = prismaWith([PTT]);

    expect(await resolveTalkieWake(prisma as never, U, LIVE, NOW)).toEqual({ miss: 'push-disabled' });
    expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
  });
});

describe('#17249 — un réveil parti sans rien livrer nomme sa cause', () => {
  it.each([
    ['un appareil servi', [{ success: true, tokenId: 'a' }, { success: false, tokenId: 'b', error: 'BadDeviceToken' }], { sent: 1, failure: null }],
    ['aucun appareil servi (préférences, jeton non routable)', [], { sent: 0, failure: 'no-device-served' }],
    ['disjoncteur ouvert', [{ success: false, tokenId: '', error: 'APNS circuit breaker OPEN' }], { sent: 0, failure: 'APNS circuit breaker OPEN' }],
    [
      'refus APNs et client absent, chaque cause une fois',
      [
        { success: false, tokenId: 'a', error: 'BadDeviceToken' },
        { success: false, tokenId: 'b', error: 'APNS sandbox client not initialized' },
        { success: false, tokenId: 'c', error: 'BadDeviceToken' },
      ],
      { sent: 0, failure: 'BadDeviceToken; APNS sandbox client not initialized' },
    ],
  ])('%s', (_cas, results, expected) => {
    expect(talkieWakeOutcome(results)).toEqual(expected);
  });

  const prisma = {
    user: { findUnique: jest.fn(async () => ({ displayName: 'Awa', username: 'awa', systemLanguage: 'fr' })) },
    userPreferences: { findUnique: jest.fn(async () => null) },
  };
  const params = { talkieId: TALKIE, fromUserId: 'u-from', toUserId: U, phase: 'live', channel: 'pushtotalk' } as const;

  it('sendTalkieWake rend l’issue de l’envoi', async () => {
    const sendToUser = jest.fn(async () => [{ success: false, tokenId: 'ptt', error: 'APNS production client not initialized' }]);

    expect(await sendTalkieWake({ prisma: prisma as never, push: { sendToUser }, now: () => NOW }, params)).toEqual({
      sent: 0,
      failure: 'APNS production client not initialized',
    });
  });

  it('sendTalkieWake ne lève jamais : une panne devient la cause', async () => {
    const sendToUser = jest.fn(async () => { throw new Error('mongo down'); });

    expect(await sendTalkieWake({ prisma: prisma as never, push: { sendToUser }, now: () => NOW }, params)).toEqual({ sent: 0, failure: 'mongo down' });
  });
});
