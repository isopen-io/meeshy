/**
 * LE PUSH DE LA BATTERIE (#14147) — une notification `device_battery`, cadrée dans la langue
 * du LECTEUR, au corps minimal ; jamais pour un palier qui ne se pousse pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { batteryPusherOf, type BatteryNotifier } from '../../../../services/battery/batteryPush';
import { table } from '../../../helpers/messaging-circle-world';

const EMETTEUR = '6700000000000000000000e1';
const LECTEUR = '6700000000000000000000b1';
const AT = '2026-11-15T10:00:00.000Z';

function monde(readerLang: Record<string, string | null> = { systemLanguage: 'fr' }) {
  const created: Array<Parameters<BatteryNotifier['createNotification']>[0]> = [];
  const notifications: BatteryNotifier = {
    createNotification: async (params) => {
      created.push(params);
      return { id: 'n1' } as never;
    },
  };
  const prisma = {
    user: table([
      { id: EMETTEUR, username: 'awa', displayName: 'Awa', avatar: null },
      { id: LECTEUR, username: 'lecteur', displayName: null, avatar: null, regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null, ...readerLang },
    ]),
  };
  return { push: batteryPusherOf({ prisma: prisma as never, notifications }), created };
}

describe('le push de la batterie', () => {
  it('le critique : titre et corps dans la langue du lecteur, priorité haute, sans rien d\'autre', async () => {
    const m = monde();
    expect(await m.push({ readerId: LECTEUR, emitterId: EMETTEUR, announcement: { kind: 'critical', level: 5, at: AT } })).toBe(true);
    expect(m.created).toHaveLength(1);
    expect(m.created[0]).toMatchObject({
      userId: LECTEUR,
      type: 'device_battery',
      priority: 'high',
      lang: 'fr',
      title: 'Awa n’a presque plus de batterie',
      content: 'Batterie à 5 %',
      metadata: { action: 'view_profile', userId: EMETTEUR, batteryKind: 'critical', batteryLevel: 5 },
      collapseId: `battery-${EMETTEUR}`,
      context: {},
    });
  });

  it('la langue de cadrage descend le prisme du lecteur (rang 2)', async () => {
    const m = monde({ systemLanguage: null, regionalLanguage: 'en' });
    await m.push({ readerId: LECTEUR, emitterId: EMETTEUR, announcement: { kind: 'probably-off', level: 3, at: AT } });
    expect(m.created[0]).toMatchObject({ lang: 'en', priority: 'high', metadata: { batteryKind: 'probably-off' } });
    expect(m.created[0]?.title?.startsWith('Awa ')).toBe(true);
    expect(m.created[0]?.title).not.toContain('éteint');
  });

  it('la recharge part en priorité normale', async () => {
    const m = monde();
    await m.push({ readerId: LECTEUR, emitterId: EMETTEUR, announcement: { kind: 'charging', level: 6, at: AT } });
    expect(m.created[0]).toMatchObject({ priority: 'normal', title: 'Awa recharge son téléphone', metadata: { batteryKind: 'charging' } });
  });

  it('un palier qui ne se pousse pas ne crée rien', async () => {
    const m = monde();
    expect(await m.push({ readerId: LECTEUR, emitterId: EMETTEUR, announcement: { kind: 'threshold', level: 20, threshold: 20, at: AT } })).toBe(false);
    expect(m.created).toEqual([]);
  });
});
