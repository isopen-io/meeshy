/**
 * LE BALAYAGE DE L'ENVOI NE S'AFFAME PAS (#10267). Un compte qu'aucun appareil ne sait ouvrir le push photo
 * (`accountRoutesPushType`) garde ses étapes EN ATTENTE pendant toute la fenêtre — c'est ce qui permet de les
 * annoncer s'il gagne un appareil capable. Ces lignes ne doivent donc jamais boucher le balayage : un compte
 * capable, quelle que soit l'ancienneté de son étape, est atteint au passage même, et rien ne part deux fois.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { buildGameBlock } from '@meeshy/shared/utils/game/game-block';
import { GamePhotoMomentService, PENDING_SCAN_MAX } from '../GamePhotoMomentService';
import { fakeGameDb, seedUser, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const MINUTE = 60_000;
const NOW = new Date('2026-10-14T12:00:00Z');
const HOURS_AGO = (hours: number) => new Date(NOW.getTime() - hours * 60 * MINUTE);

const IPHONE_ONLY = { platform: 'ios', type: 'apns', isActive: true, appVersion: '1.9.0', bundleId: 'me.meeshy.app' };
const CAPABLE_SHELL = { platform: 'android', type: 'fcm', isActive: true, appVersion: '2.23.0', bundleId: 'me.meeshy.app' };

const accountId = (prefix: string, index: number) => `${prefix.repeat(20)}${String(index).padStart(4, '0')}`;

const seedAccount = (db: FakeGameDb, id: string, token: Record<string, unknown>) => {
  seedUser(db, { isActive: true, deletedAt: null, isOnline: false, timezone: 'UTC' }, id);
  db.pushToken.rows.push({ id: `tk-${id}`, userId: id, token: `t-${id}`, ...token });
};

const seedPending = (db: FakeGameDb, options: { id: string; userId: string; stepId: string; detectedAt: Date }) =>
  db.gamePhotoMoment.rows.push({ ...options, updatedAt: NOW });

const serviceOf = (db: FakeGameDb) => {
  const notifier = { notify: jest.fn(async () => 'sent' as const) };
  const service = new GamePhotoMomentService(db.prisma, { blocks: { build: async () => buildGameBlock({} as never) }, notifier });
  return { service, notifier };
};

const notifiedRecipients = (notifier: ReturnType<typeof serviceOf>['notifier']) =>
  notifier.notify.mock.calls.map((call) => (call as unknown as [{ recipientId: string }])[0].recipientId);

describe('GamePhotoMomentService.deliver — un compte sauté ne bouche pas le balayage', () => {
  it('500 lignes plus anciennes de comptes « iPhone seul » ne retiennent pas le compte capable, qui reçoit une fois', async () => {
    const db = fakeGameDb();
    for (let account = 0; account < 50; account++) {
      const id = accountId('a', account);
      seedAccount(db, id, IPHONE_ONLY);
      for (let step = 0; step < PENDING_SCAN_MAX / 50; step++) seedPending(db, { id: `${id}-${step}`, userId: id, stepId: `level:${step + 2}`, detectedAt: HOURS_AGO(3) });
    }
    const capable = 'b'.repeat(24);
    seedAccount(db, capable, CAPABLE_SHELL);
    seedPending(db, { id: 'cap-1', userId: capable, stepId: 'flame:7', detectedAt: HOURS_AGO(2) });
    const { service, notifier } = serviceOf(db);

    const first = await service.deliver(NOW);
    const second = await service.deliver(new Date(NOW.getTime() + 10 * MINUTE));

    expect({ first, second, notified: notifiedRecipients(notifier) }).toEqual({
      first: { sent: 1, deferred: 0 },
      second: { sent: 0, deferred: 0 },
      notified: [capable],
    });
  });

  it("plus de comptes sautés qu'une page, à la MÊME date de détection : le compte capable classé dernier est atteint", async () => {
    const db = fakeGameDb();
    for (let account = 0; account < PENDING_SCAN_MAX + 20; account++) {
      const id = accountId('a', account);
      seedAccount(db, id, IPHONE_ONLY);
      seedPending(db, { id: `${id}-row`, userId: id, stepId: 'level:5', detectedAt: HOURS_AGO(3) });
    }
    const capable = 'f'.repeat(24);
    seedAccount(db, capable, CAPABLE_SHELL);
    seedPending(db, { id: 'z'.repeat(24), userId: capable, stepId: 'level:5', detectedAt: HOURS_AGO(3) });
    const { service, notifier } = serviceOf(db);

    expect(await service.deliver(NOW)).toEqual({ sent: 1, deferred: 0 });
    expect(notifiedRecipients(notifier)).toEqual([capable]);
  });

  it('un compte dont les lignes chevauchent deux pages ne reçoit qu’UNE notification par passage', async () => {
    const db = fakeGameDb();
    const capable = 'd'.repeat(24);
    seedAccount(db, capable, CAPABLE_SHELL);
    for (let step = 0; step < PENDING_SCAN_MAX + 5; step++) seedPending(db, { id: `row-${String(step).padStart(4, '0')}`, userId: capable, stepId: `level:${step + 2}`, detectedAt: HOURS_AGO(3) });
    const { service, notifier } = serviceOf(db);

    expect(await service.deliver(NOW)).toEqual({ sent: 1, deferred: 0 });
    expect(notifiedRecipients(notifier)).toEqual([capable]);
  });

  it("l'étape d'un compte sauté reste en attente, et part — une seule fois — quand il gagne un appareil capable", async () => {
    const db = fakeGameDb();
    const id = accountId('c', 0);
    seedAccount(db, id, IPHONE_ONLY);
    seedPending(db, { id: 'late-1', userId: id, stepId: 'flame:7', detectedAt: HOURS_AGO(3) });
    const { service, notifier } = serviceOf(db);

    expect(await service.deliver(NOW)).toEqual({ sent: 0, deferred: 0 });
    expect(db.gamePhotoMoment.rows[0]?.notifiedAt).toBeUndefined();

    db.pushToken.rows.push({ id: 'tk-shell', userId: id, token: 't-shell', ...CAPABLE_SHELL });
    const later = new Date(NOW.getTime() + 10 * MINUTE);
    const afterGain = await service.deliver(later);
    const again = await service.deliver(new Date(later.getTime() + 10 * MINUTE));

    expect({ afterGain, again, notified: notifiedRecipients(notifier), notifiedAt: db.gamePhotoMoment.rows[0]?.notifiedAt }).toEqual({
      afterGain: { sent: 1, deferred: 0 },
      again: { sent: 0, deferred: 0 },
      notified: [id],
      notifiedAt: later,
    });
  });
});
