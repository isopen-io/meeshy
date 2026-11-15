/**
 * LE PUSH DU TÉLÉPHONE INJOIGNABLE (#18737) — une notification `device_unreachable`, cadrée dans la
 * langue du LECTEUR ; seuls le genre et la cause se rangent, et la ligne expire avec l'état.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { phoneReachabilityPusherOf, type PhoneReachabilityNotifier } from '../../../../services/phoneReachability/phoneReachabilityPush';
import { table } from '../../../helpers/messaging-circle-world';

const EMETTEUR = '6700000000000000000000e1';
const LECTEUR = '6700000000000000000000b1';
const DEPUIS = '2026-11-15T14:10:00.000Z';
const AT = '2026-11-15T14:35:00.000Z';

function monde(readerLang: Record<string, string | null> = { systemLanguage: 'fr' }) {
  const created: Array<Parameters<PhoneReachabilityNotifier['createNotification']>[0]> = [];
  const notifications: PhoneReachabilityNotifier = {
    createNotification: async (params) => {
      created.push(params);
      return { id: 'n1' } as never;
    },
  };
  const prisma = {
    user: table([
      { id: EMETTEUR, username: 'jacques', displayName: 'Jacques', avatar: null },
      { id: LECTEUR, username: 'lecteur', displayName: null, avatar: null, regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null, ...readerLang },
    ]),
  };
  return { push: phoneReachabilityPusherOf({ prisma: prisma as never, notifications, now: () => Date.parse(AT) }), created };
}

const injoignable = (cause: 'battery' | 'network') => ({
  readerId: LECTEUR,
  emitterId: EMETTEUR,
  announcement: { kind: 'unreachable' as const, at: AT },
  state: { userId: EMETTEUR, unreachableSince: DEPUIS, cause },
});

describe('le push du téléphone injoignable', () => {
  it('injoignable : titre, corps et cause dans la langue du lecteur, priorité haute', async () => {
    const m = monde();
    expect(await m.push(injoignable('network'))).toBe(true);
    expect(m.created[0]).toMatchObject({
      userId: LECTEUR,
      type: 'device_unreachable',
      priority: 'high',
      lang: 'fr',
      title: 'Jacques a un téléphone injoignable',
      content: 'Aucun signe de vie depuis 25 min — sans réseau ou en mode avion, probablement',
      metadata: { action: 'view_profile', userId: EMETTEUR, reachabilityKind: 'unreachable', cause: 'network' },
      collapseId: `unreachable-${EMETTEUR}`,
      context: {},
    });
  });

  it('la cause batterie se dit dans le corps', async () => {
    const m = monde();
    await m.push(injoignable('battery'));
    expect(m.created[0]?.content).toBe('Aucun signe de vie depuis 25 min — batterie vide, probablement');
  });

  it('le retour remplace la même notification, en priorité normale', async () => {
    const m = monde({ systemLanguage: null, regionalLanguage: 'en' });
    await m.push({ readerId: LECTEUR, emitterId: EMETTEUR, announcement: { kind: 'reachable', at: AT } });
    expect(m.created[0]).toMatchObject({
      lang: 'en',
      priority: 'normal',
      title: 'Jacques is reachable again',
      content: 'Their phone is answering again',
      metadata: { action: 'view_profile', userId: EMETTEUR, reachabilityKind: 'reachable' },
      collapseId: `unreachable-${EMETTEUR}`,
    });
  });

  it('aucun historique : la ligne expire avec l\'état', async () => {
    const m = monde();
    await m.push(injoignable('network'));
    expect(m.created[0]?.expiresAt).toEqual(new Date(Date.parse(AT) + 259_200_000));
  });

  it('sans service de notification ou sans lecteur, rien ne part', async () => {
    const sans = phoneReachabilityPusherOf({ prisma: { user: table([]) } as never, notifications: null });
    expect(await sans(injoignable('network'))).toBe(false);
    const m = monde();
    expect(await m.push({ ...injoignable('network'), readerId: '6700000000000000000000ff' })).toBe(false);
  });
});
