/**
 * LE JOB DES MISSIONS PERSONNELLES (#9539) — toutes les 5 minutes : tire À L'AVANCE la mission personnelle des
 * comptes actifs (de 5 h à 21 h dans LEUR fuseau, au plus un lot par passage, par curseur), puis annonce les
 * plages qui viennent de s'ouvrir. Chaque étape est idempotente et isolée : l'échec de l'une ne retient pas
 * l'autre, un passage manqué se rattrape au suivant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PERSONAL_MISSION_SLOT } from '@meeshy/shared/utils/game/personal-mission';
import { GameMissionWindowJob } from '../../../jobs/game-mission-window';
import { MissionService, READ_ONLY_CREDIT } from '../../../services/game/MissionService';
import { PersonalMissionService } from '../../../services/game/PersonalMissionService';
import type { GameNotificationEvent, GameNotifyResult } from '../../../services/game/GameNotifier';
import { fakeGameDb, seedUser, type FakeGameDb } from '../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const LEVEL_20 = 10 * 20 * 20;
const NOON = new Date('2026-10-06T10:00:00Z');
const id = (n: number): string => `68a0000000000000000000${n.toString(16).padStart(2, '0')}`;

type Notify = (event: GameNotificationEvent) => Promise<GameNotifyResult>;

const world = (options: { batchSize?: number } = {}) => {
  const db: FakeGameDb = fakeGameDb();
  const notify = jest.fn<Notify>().mockResolvedValue('sent');
  const missions = new MissionService(db.prisma, { creditPoints: READ_ONLY_CREDIT });
  const personal = new PersonalMissionService(db.prisma, { missions, notifier: { notify } });
  const job = new GameMissionWindowJob(db.prisma, { personal, ...(options.batchSize ? { batchSize: options.batchSize } : {}) });
  return { db, job, notify, personal };
};

const active = (db: FakeGameDb, n: number, over: Record<string, unknown> = {}) =>
  seedUser(db, { isActive: true, deletedAt: null, engagementScore: LEVEL_20, levelRecord: 20, lastActiveAt: new Date('2026-10-05T20:00:00Z'), ...over }, id(n));

const personalRows = (db: FakeGameDb) => db.dailyMission.rows.filter((r) => r.slot === PERSONAL_MISSION_SLOT);

describe('le tirage à l’avance', () => {
  it('tire la mission personnelle d’un compte actif, en journée dans son fuseau', async () => {
    const { db, job } = world();
    active(db, 1);

    const report = await job.runNow(NOON);

    expect(report?.drawn).toBe(1);
    expect(personalRows(db)).toHaveLength(1);
    expect(personalRows(db)[0]!.userId).toBe(id(1));
  });

  it('ne tire rien pour un compte inactif depuis plus de sept jours, ni pour un compte désactivé ou supprimé', async () => {
    const { db, job } = world();
    active(db, 1, { lastActiveAt: new Date('2026-09-20T00:00:00Z') });
    active(db, 2, { isActive: false });
    active(db, 3, { deletedAt: new Date('2026-10-01T00:00:00Z') });

    await job.runNow(NOON);

    expect(personalRows(db)).toHaveLength(0);
  });

  it('attend le jour LOCAL : 5 h à 21 h dans le fuseau du compte, pas dans celui du serveur', async () => {
    const { db, job } = world();
    active(db, 1, { timezone: 'UTC' });
    active(db, 2, { timezone: 'Asia/Tokyo' });

    await job.runNow(new Date('2026-10-06T02:00:00Z'));

    expect(personalRows(db).map((r) => r.userId)).toEqual([id(2)]);
  });

  it('ne retire pas un compte qui a déjà sa mission du jour', async () => {
    const { db, job } = world();
    active(db, 1);

    await job.runNow(NOON);
    const second = await job.runNow(new Date(NOON.getTime() + 5 * 60_000));

    expect(second?.drawn).toBe(0);
    expect(personalRows(db)).toHaveLength(1);
  });

  it('borne le lot par passage et reprend où il s’est arrêté, jusqu’à boucler', async () => {
    const { db, job } = world({ batchSize: 2 });
    for (const n of [1, 2, 3, 4, 5]) active(db, n);

    const first = await job.runNow(NOON);
    expect(first?.drawn).toBe(2);
    const second = await job.runNow(new Date(NOON.getTime() + 5 * 60_000));
    expect(second?.drawn).toBe(2);
    const third = await job.runNow(new Date(NOON.getTime() + 10 * 60_000));
    expect(third?.drawn).toBe(1);

    expect(new Set(personalRows(db).map((r) => r.userId)).size).toBe(5);
    const fourth = await job.runNow(new Date(NOON.getTime() + 15 * 60_000));
    expect(fourth?.drawn).toBe(0);
  });

  it('un compte sous le niveau 5 n’en tire aucune', async () => {
    const { db, job } = world();
    active(db, 1, { engagementScore: 10 * 4 * 4, levelRecord: 4 });

    await job.runNow(NOON);

    expect(personalRows(db)).toHaveLength(0);
  });
});

describe('l’annonce', () => {
  it('annonce une plage quand elle s’ouvre, UNE fois, à l’heure du fuseau du compte', async () => {
    const { db, job, notify } = world();
    active(db, 1);
    await job.runNow(new Date('2026-10-06T06:00:00Z'));
    const row = personalRows(db)[0]!;

    expect(notify).not.toHaveBeenCalled();
    const opened = new Date((row.startsAt as Date).getTime() + 2 * 60_000);
    const first = await job.runNow(opened);
    const second = await job.runNow(new Date(opened.getTime() + 5 * 60_000));

    expect(first?.sent).toBe(1);
    expect(second?.sent).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0]).toMatchObject({ kind: 'mission-window', recipientId: id(1), missionId: row.id });
  });
});

describe('une panne n’arrête pas l’autre étape', () => {
  it('un tirage qui lève n’empêche pas l’annonce, et le passage rend son rapport', async () => {
    const { db, personal, notify } = world();
    active(db, 1);
    await personal.ensure(id(1), new Date('2026-10-06T06:00:00Z'));
    const row = personalRows(db)[0]!;
    const job = new GameMissionWindowJob(db.prisma, {
      personal: {
        ensure: async () => {
          throw new Error('mongo down');
        },
        notifyDue: (params) => personal.notifyDue(params),
      },
    });

    const report = await job.runNow(new Date((row.startsAt as Date).getTime() + 60_000));

    expect(report?.sent).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('jamais deux passages en même temps dans ce processus', async () => {
    const { db } = world();
    active(db, 1);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = {
      ensure: async () => {
        await gate;
        return null;
      },
      notifyDue: async () => ({ sent: 0, examined: 0 }),
    };
    const job = new GameMissionWindowJob(db.prisma, { personal: slow });

    const first = job.runNow(NOON);
    const second = await job.runNow(NOON);
    release();
    await first;

    expect(second).toBeNull();
  });
});
