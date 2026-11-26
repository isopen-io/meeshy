/**
 * LE JOB DU RAPPEL DU SOIR (#17368, #20612) — toutes les 10 minutes, un lot de comptes dont la Flamme a trois
 * jours ou plus, par curseur : ceux pour qui c'est le soir (18 h – 21 h dans LEUR fuseau) et qui n'ont fait aucun
 * geste aujourd'hui reçoivent le rappel. Le notifieur relit la loi à l'envoi et tient « une fois par jour » et le
 * plafond ; le job ne fait que trouver qui est dû.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { GameFlameEveningJob } from '../../../jobs/game-flame-evening';
import type { GameNotificationEvent, GameNotifyResult } from '../../../services/game/GameNotifier';
import { fakeGameDb, seedUser, type FakeGameDb } from '../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

/** 19 h à Paris (UTC+2), 2 h à Tokyo, le 2026-10-14. */
const EVENING_PARIS = new Date('2026-10-14T17:00:00Z');
const id = (n: number): string => `68b0000000000000000000${n.toString(16).padStart(2, '0')}`;

type Notify = (event: GameNotificationEvent, now?: Date) => Promise<GameNotifyResult>;

const world = (options: { batchSize?: number; result?: GameNotifyResult; routes?: (userId: string) => Promise<boolean> } = {}) => {
  const db: FakeGameDb = fakeGameDb();
  const notify = jest.fn<Notify>().mockResolvedValue(options.result ?? 'sent');
  const routes = jest.fn(options.routes ?? (async () => true));
  const job = new GameFlameEveningJob(db.prisma, { notifier: { notify }, routes, ...(options.batchSize ? { batchSize: options.batchSize } : {}) });
  return { db, job, notify, routes };
};

const player = (db: FakeGameDb, n: number, over: Record<string, unknown> = {}) =>
  seedUser(
    db,
    {
      isActive: true,
      deletedAt: null,
      timezone: 'Europe/Paris',
      currentStreakDays: 6,
      longestStreakDays: 6,
      lastStreakDate: new Date('2026-10-13T00:00:00Z'),
      ...over,
    },
    id(n),
  );

const recipients = (notify: jest.Mock<Notify>) => notify.mock.calls.map(([event]) => event.recipientId);

describe('qui reçoit le rappel du soir', () => {
  it('une Flamme de six jours sans geste aujourd’hui, à 19 h dans son fuseau : le rappel du jour LOCAL', async () => {
    const { db, job, notify } = world();
    player(db, 1);

    const report = await job.runNow(EVENING_PARIS);

    expect(report).toEqual({ examined: 1, sent: 1 });
    expect(notify).toHaveBeenCalledWith({ kind: 'flame-evening', recipientId: id(1), dayKey: '2026-10-14' }, EVENING_PARIS);
  });

  it('le soir se lit dans le fuseau du compte, jamais dans celui du serveur', async () => {
    const { db, job, notify } = world();
    player(db, 1, { timezone: 'Europe/Paris' });
    player(db, 2, { timezone: 'Asia/Tokyo', lastStreakDate: new Date('2026-10-14T00:00:00Z') });

    await job.runNow(EVENING_PARIS);

    expect(recipients(notify)).toEqual([id(1)]);
  });

  it('ni sous trois jours, ni après le geste du jour, ni une Flamme éteinte', async () => {
    const { db, job, notify } = world();
    player(db, 1, { currentStreakDays: 2 });
    player(db, 2, { lastStreakDate: new Date('2026-10-14T00:00:00Z') });
    player(db, 3, { lastStreakDate: new Date('2026-10-10T00:00:00Z') });

    await job.runNow(EVENING_PARIS);

    expect(notify).not.toHaveBeenCalled();
  });

  it('ni un compte désactivé ou supprimé', async () => {
    const { db, job, notify } = world();
    player(db, 1, { isActive: false });
    player(db, 2, { deletedAt: new Date('2026-10-01T00:00:00Z') });

    await job.runNow(EVENING_PARIS);

    expect(notify).not.toHaveBeenCalled();
  });

  it('ni un compte dont aucun appareil ne sait ouvrir la fiche de la Flamme : rien ne prend un créneau du jour (#10267)', async () => {
    const { db, job, notify, routes } = world({ routes: async (userId) => userId !== id(1) });
    player(db, 1);
    player(db, 2);

    await job.runNow(EVENING_PARIS);
    await job.runNow(new Date('2026-10-14T17:10:00Z'));

    expect(recipients(notify)).toEqual([id(2)]);
    expect(routes.mock.calls.filter(([userId]) => userId === id(1))).toHaveLength(1);
  });

  it('jamais après 21 h locales', async () => {
    const { db, job, notify } = world();
    player(db, 1);

    await job.runNow(new Date('2026-10-14T19:05:00Z'));

    expect(notify).not.toHaveBeenCalled();
  });
});

describe('le passage', () => {
  it('ne rappelle pas deux fois le même soir un compte déjà prévenu : le passage suivant ne le relit même pas', async () => {
    const { db, job, notify } = world();
    player(db, 1);

    await job.runNow(EVENING_PARIS);
    await job.runNow(new Date('2026-10-14T17:10:00Z'));

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('un rappel que le notifieur a tu (plafond, refus) ne se rejoue pas ce soir-là', async () => {
    const { db, job, notify } = world({ result: 'skipped:daily-cap' });
    player(db, 1);

    await job.runNow(EVENING_PARIS);
    await job.runNow(new Date('2026-10-14T17:10:00Z'));

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('une panne se réessaie au passage suivant', async () => {
    const { db, job, notify } = world({ result: 'failed' });
    player(db, 1);

    await job.runNow(EVENING_PARIS);
    await job.runNow(new Date('2026-10-14T17:10:00Z'));

    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('le lendemain soir, le rappel repart', async () => {
    const { db, job, notify } = world();
    player(db, 1, { lastStreakDate: new Date('2026-10-13T00:00:00Z') });

    await job.runNow(EVENING_PARIS);
    db.user.rows.forEach((row) => Object.assign(row, { lastStreakDate: new Date('2026-10-14T00:00:00Z'), currentStreakDays: 7 }));
    await job.runNow(new Date('2026-10-15T17:00:00Z'));

    expect(notify.mock.calls.map(([event]) => event.kind === 'flame-evening' && event.dayKey)).toEqual(['2026-10-14', '2026-10-15']);
  });

  it('avance par lots, par curseur, et boucle quand la page est plus courte que le lot', async () => {
    const { db, job, notify } = world({ batchSize: 1 });
    player(db, 1);
    player(db, 2);

    await job.runNow(EVENING_PARIS);
    expect(recipients(notify)).toEqual([id(1)]);
    await job.runNow(new Date('2026-10-14T17:10:00Z'));
    expect(recipients(notify)).toEqual([id(1), id(2)]);
  });

  it('la panne d’un compte ne retient pas les autres', async () => {
    const { db, job, notify } = world();
    player(db, 1);
    player(db, 2);
    notify.mockRejectedValueOnce(new Error('boom'));

    const report = await job.runNow(EVENING_PARIS);

    expect(recipients(notify)).toEqual([id(1), id(2)]);
    expect(report?.sent).toBe(1);
  });

  it('jamais deux passages en même temps', async () => {
    const { db, job, notify } = world();
    player(db, 1);
    let release: () => void = () => undefined;
    notify.mockImplementationOnce(() => new Promise<GameNotifyResult>((resolve) => { release = () => resolve('sent'); }));

    const first = job.runNow(EVENING_PARIS);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await job.runNow(EVENING_PARIS)).toBeNull();
    release();
    expect(await first).toEqual({ examined: 1, sent: 1 });
  });
});
