/**
 * LA MISSION PERSONNELLE DU JOUR (#9539) — tirée au premier accès du jour (ou à l'avance par le job), sur les
 * usages réels, les langues, le niveau et les heures habituelles du compte ; sa plage se lit dans SON fuseau ;
 * la notification de début de plage part UNE fois. La loi vient de `@meeshy/shared/utils/game/personal-mission`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PERSONAL_MISSION_SLOT, PERSONAL_WINDOW_MINUTES, drawPersonalMission } from '@meeshy/shared/utils/game/personal-mission';
import { MissionService, READ_ONLY_CREDIT } from '../MissionService';
import { PersonalMissionService } from '../PersonalMissionService';
import type { GameNotificationEvent, GameNotifyResult } from '../GameNotifier';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const LEVEL_20 = 10 * 20 * 20;
const MORNING = new Date('2026-10-06T06:00:00Z');
const DAY = '2026-10-06';

type Notify = (event: GameNotificationEvent) => Promise<GameNotifyResult>;

const setup = (userFields: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20, ...userFields });
  const notify = jest.fn<Notify>().mockResolvedValue('sent');
  const missions = new MissionService(db.prisma, { creditPoints: READ_ONLY_CREDIT });
  const service = new PersonalMissionService(db.prisma, { missions, notifier: { notify } });
  return { db, service, notify, missions };
};

const personalRows = (db: FakeGameDb) => db.dailyMission.rows.filter((r) => r.slot === PERSONAL_MISSION_SLOT);

const eveningMessages = (db: FakeGameDb, hourUtc: number, count = 30) => {
  db.participant.rows.push({ id: 'p1', userId: USER });
  for (let i = 0; i < count; i += 1) {
    db.message.rows.push({ id: `m${i}`, senderId: 'p1', createdAt: new Date(Date.UTC(2026, 9, 1 + (i % 5), hourUtc, i % 50)) });
  }
};

describe('PersonalMissionService.ensure — le tirage', () => {
  it('ne tire jamais pour une journée de jeu qui n’est plus le jour civil : la plage tomberait hors de sa journée (revue adversariale #9539)', async () => {
    const { db, service } = setup({ timezone: 'UTC' });

    expect(await service.ensure(USER, new Date('2026-10-05T22:30:00Z'))).toBeNull();
    // La fausse base date ses lignes à l'horloge réelle : la journée du 5 s'est ouverte à 22 h 30.
    db.dailyMission.rows.forEach((row) => Object.assign(row, { createdAt: new Date('2026-10-05T22:30:00Z') }));
    // 7 h 30 plus tard : la journée de jeu du 5 continue (moins de 20 h), le jour civil est le 6.
    expect(await service.ensure(USER, new Date('2026-10-06T06:00:00Z'))).toBeNull();
    expect(personalRows(db)).toHaveLength(0);

    const row = await service.ensure(USER, new Date('2026-10-06T19:00:00Z'));
    expect(row?.dayKey).toBe('2026-10-06');
    expect((row!.startsAt as Date).toISOString().slice(0, 10)).toBe('2026-10-06');
  });

  it('ne lit ni messages ni compteurs quand plus aucune plage ne tient ce soir (revue adversariale #9539)', async () => {
    const { db, service } = setup({ timezone: 'UTC' });
    const messages = jest.spyOn(db.prisma.message, 'findMany');
    const counters = jest.spyOn(db.prisma.engagementCounter, 'findMany');

    expect(await service.ensure(USER, new Date('2026-10-06T22:30:00Z'))).toBeNull();

    expect(messages).not.toHaveBeenCalled();
    expect(counters).not.toHaveBeenCalled();
  });

  it('pose UNE mission à l’emplacement 3, avec une plage de deux heures, à côté des trois du jour', async () => {
    const { db, service } = setup();

    const row = await service.ensure(USER, MORNING);

    expect(row).not.toBeNull();
    expect(personalRows(db)).toHaveLength(1);
    expect(db.dailyMission.rows.filter((r) => (r.slot as number) < PERSONAL_MISSION_SLOT)).toHaveLength(3);
    const startsAt = row!.startsAt as Date;
    const endsAt = row!.endsAt as Date;
    expect(endsAt.getTime() - startsAt.getTime()).toBe(PERSONAL_WINDOW_MINUTES * 60_000);
    expect(row!.dayKey).toBe(DAY);
    expect(row!.notifiedAt).toBeNull();
    expect(row!.completedAt).toBeNull();
  });

  it('ne retire pas : un second accès, même concurrent, rend la même ligne', async () => {
    const { db, service } = setup();

    const [a, b] = await Promise.all([service.ensure(USER, MORNING), service.ensure(USER, MORNING)]);
    const c = await service.ensure(USER, new Date('2026-10-06T12:00:00Z'));

    expect(personalRows(db)).toHaveLength(1);
    expect([a?.id, b?.id, c?.id].every((id) => id === personalRows(db)[0]!.id)).toBe(true);
  });

  it('ne tire rien avant le niveau 5', async () => {
    const { db, service } = setup({ engagementScore: 10 * 4 * 4, levelRecord: 4 });
    expect(await service.ensure(USER, MORNING)).toBeNull();
    expect(personalRows(db)).toHaveLength(0);
  });

  it('lit la plage dans le fuseau du compte : 18 h à Paris n’est pas 18 h UTC', async () => {
    const { db, service } = setup({ timezone: 'Europe/Paris' });
    eveningMessages(db, 16);

    const row = (await service.ensure(USER, MORNING))!;

    const startHourParis = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(row.startsAt as Date),
    );
    expect(startHourParis).toBeGreaterThanOrEqual(8);
    expect(startHourParis).toBeLessThanOrEqual(21);
    expect((row.startsAt as Date).getUTCHours()).toBe(startHourParis - 2);
  });

  it('se place dans les heures habituelles du compte, lues dans SES messages', async () => {
    const { db, service } = setup({ timezone: 'UTC' });
    eveningMessages(db, 19);

    const row = (await service.ensure(USER, MORNING))!;

    expect((row.startsAt as Date).getUTCHours()).toBeGreaterThanOrEqual(17);
    expect((row.startsAt as Date).getUTCHours()).toBeLessThanOrEqual(19);
  });

  it('applique la loi partagée : mêmes entrées, même mission', async () => {
    const { db, service } = setup();
    const row = (await service.ensure(USER, MORNING))!;
    const standardSignals = db.dailyMission.rows.filter((r) => (r.slot as number) < PERSONAL_MISSION_SLOT).map((r) => r.signal as string);

    const expected = drawPersonalMission({
      userId: USER,
      dayKey: DAY,
      level: 20,
      flameDays: 0,
      nowMinute: 6 * 60,
      activeHours: null,
      usage: {},
      multilingual: false,
      excludedSignals: standardSignals as never,
    })!;

    expect(row.templateKey).toBe(expected.mission.templateKey);
    expect(row.target).toBe(expected.mission.target);
    expect(row.reward).toBe(expected.mission.reward);
    expect(standardSignals).not.toContain(row.signal);
  });

  it('une mission de langue ne tombe que sur un compte qui en parle plusieurs', async () => {
    const solo = setup({ systemLanguage: 'fr' });
    const rows = await Promise.all(
      ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'].map((day) =>
        solo.service.ensure(USER, new Date(`${day}T06:00:00Z`)),
      ),
    );
    expect(rows.some((r) => r?.prism === true)).toBe(false);
  });

  it('tard dans la journée : plus de plage qui tienne, aucune mission aujourd’hui — jamais une mission déjà manquée', async () => {
    const { db, service } = setup();
    expect(await service.ensure(USER, new Date('2026-10-06T22:40:00Z'))).toBeNull();
    expect(personalRows(db)).toHaveLength(0);
  });

  it('un compte inconnu ne tire rien', async () => {
    const { service } = setup();
    expect(await service.ensure('68a0000000000000000000ff', MORNING)).toBeNull();
  });
});

describe('PersonalMissionService.notifyDue — l’annonce du début de plage', () => {
  const seedWindow = (db: FakeGameDb, over: Record<string, unknown> = {}) => {
    const row = {
      id: 'perso-1',
      userId: USER,
      dayKey: DAY,
      slot: PERSONAL_MISSION_SLOT,
      templateKey: 'send-voice',
      difficulty: 'medium',
      signal: 'axis:content.audio_message',
      prism: false,
      target: 2,
      progress: 0,
      reward: 70,
      glory: 0,
      seen: [],
      completedAt: null,
      paidPoints: null,
      rerolledAt: null,
      startsAt: new Date('2026-10-06T16:00:00Z'),
      endsAt: new Date('2026-10-06T18:00:00Z'),
      notifiedAt: null,
      createdAt: new Date('2026-10-06T05:00:00Z'),
      ...over,
    };
    db.dailyMission.rows.push(row);
    return row;
  };

  it('annonce une plage qui vient de s’ouvrir, UNE fois', async () => {
    const { db, service, notify } = setup();
    seedWindow(db);
    const now = new Date('2026-10-06T16:02:00Z');

    const first = await service.notifyDue({ now });
    const second = await service.notifyDue({ now: new Date('2026-10-06T16:07:00Z') });

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: 'mission-window',
      recipientId: USER,
      missionId: 'perso-1',
      dayKey: DAY,
      templateKey: 'send-voice',
      startsAt: new Date('2026-10-06T16:00:00Z'),
      endsAt: new Date('2026-10-06T18:00:00Z'),
    });
    expect(personalRows(db)[0]!.notifiedAt).toBeInstanceOf(Date);
  });

  it('n’annonce pas une plage à venir, ni une plage terminée', async () => {
    const { db, service, notify } = setup();
    seedWindow(db, { id: 'a', slot: 3, startsAt: new Date('2026-10-06T19:00:00Z'), endsAt: new Date('2026-10-06T21:00:00Z') });
    seedWindow(db, { id: 'b', dayKey: '2026-10-05', startsAt: new Date('2026-10-05T16:00:00Z'), endsAt: new Date('2026-10-05T18:00:00Z') });

    const result = await service.notifyDue({ now: new Date('2026-10-06T16:30:00Z') });

    expect(result.sent).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('n’annonce pas une mission déjà faite, et la marque annoncée pour ne plus y revenir', async () => {
    const { db, service, notify } = setup();
    seedWindow(db, { completedAt: new Date('2026-10-06T15:00:00Z') });

    await service.notifyDue({ now: new Date('2026-10-06T16:02:00Z') });

    expect(notify).not.toHaveBeenCalled();
    expect(personalRows(db)[0]!.notifiedAt).toBeInstanceOf(Date);
  });

  it('rend la réclamation quand l’envoi échoue : le prochain passage réessaie', async () => {
    const { db, service, notify } = setup();
    seedWindow(db);
    notify.mockResolvedValueOnce('failed');

    const first = await service.notifyDue({ now: new Date('2026-10-06T16:02:00Z') });
    expect(first.sent).toBe(0);
    expect(personalRows(db)[0]!.notifiedAt).toBeNull();

    const second = await service.notifyDue({ now: new Date('2026-10-06T16:07:00Z') });
    expect(second.sent).toBe(1);
  });

  it('une annonce écartée (réglage « Jeu », jeu masqué) n’est pas rejouée', async () => {
    const { db, service, notify } = setup();
    seedWindow(db);
    notify.mockResolvedValueOnce('skipped:opted-out');

    await service.notifyDue({ now: new Date('2026-10-06T16:02:00Z') });
    await service.notifyDue({ now: new Date('2026-10-06T16:07:00Z') });

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('une ligne ABSENTE de `notifiedAt` (écrite avant le champ) est annoncée comme une ligne à null', async () => {
    const { db, service, notify } = setup();
    const row = seedWindow(db);
    delete (row as Record<string, unknown>).notifiedAt;

    const result = await service.notifyDue({ now: new Date('2026-10-06T16:02:00Z') });

    expect(result.sent).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('plusieurs comptes d’un même passage : chacun reçoit la sienne, borné par `limit`', async () => {
    const { db, service, notify } = setup();
    seedWindow(db, { id: 'one' });
    seedWindow(db, { id: 'two', userId: '68a000000000000000000002' });
    seedWindow(db, { id: 'three', userId: '68a000000000000000000003' });

    const result = await service.notifyDue({ now: new Date('2026-10-06T16:02:00Z'), limit: 2 });

    expect(result.sent).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
