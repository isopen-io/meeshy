/**
 * LA MISSION PERSONNELLE à côté des missions du jour (#9539) — elle avance et se paie comme une mission du
 * jour, MAIS seulement dans sa plage (début inclus, fin exclue : passé `endsAt`, le serveur ne l'accepte plus) ;
 * elle ne compte NI pour le coffre NI pour le changement de mission, et ne fait pas sortir une mission du jour de
 * la lecture de la journée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PERSONAL_MISSION_SLOT } from '@meeshy/shared/utils/game/personal-mission';
import { MissionService } from '../MissionService';
import { GameRefusal } from '../GameRefusal';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const DAY = '2026-10-06';
const STARTS = new Date('2026-10-06T16:00:00Z');
const ENDS = new Date('2026-10-06T18:00:00Z');
const LEVEL_20 = 10 * 20 * 20;

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20 });
  const creditPoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
  const service = new MissionService(db.prisma, { creditPoints });
  return { db, service, creditPoints };
};

const insert = (db: FakeGameDb, fields: Record<string, unknown>) => {
  const slot = (fields.slot as number | undefined) ?? db.dailyMission.rows.length;
  const row = {
    id: `mission-${db.dailyMission.rows.length}`,
    userId: USER,
    dayKey: DAY,
    slot,
    templateKey: 'send-voice',
    difficulty: 'easy',
    signal: 'axis:content.audio_message',
    prism: false,
    target: 2,
    progress: 0,
    reward: 40,
    glory: 0,
    seen: [],
    completedAt: null,
    paidPoints: null,
    rerolledAt: null,
    createdAt: new Date('2026-10-06T05:00:00Z'),
    ...fields,
  };
  db.dailyMission.rows.push(row);
  return row;
};

const standardTrio = (db: FakeGameDb, completed = false) => {
  const done = completed ? { completedAt: new Date('2026-10-06T09:00:00Z') } : {};
  insert(db, { slot: 0, templateKey: 'send-texts', signal: 'axis:content.text_message', ...done });
  insert(db, { slot: 1, templateKey: 'publish-post', signal: 'axis:content.post', difficulty: 'medium', ...done });
  insert(db, { slot: 2, templateKey: 'long-chat', signal: 'axis:content.text_message', difficulty: 'hard', ...done });
};

const personal = (db: FakeGameDb, over: Record<string, unknown> = {}) =>
  insert(db, { slot: PERSONAL_MISSION_SLOT, startsAt: STARTS, endsAt: ENDS, notifiedAt: null, ...over });

describe('onSignal — la plage de la mission personnelle', () => {
  it('avance dans sa plage et se paie à l’objectif', async () => {
    const { db, service, creditPoints } = setup();
    standardTrio(db);
    const row = personal(db);

    await service.onSignal(USER, 'axis:content.audio_message', { now: new Date('2026-10-06T16:30:00Z'), dayKey: DAY, timezone: 'UTC' });
    await service.onSignal(USER, 'axis:content.audio_message', { now: new Date('2026-10-06T17:00:00Z'), dayKey: DAY, timezone: 'UTC' });

    expect(row.progress).toBe(2);
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(creditPoints).toHaveBeenCalledTimes(1);
    expect(creditPoints.mock.calls[0]![1]).toBeGreaterThanOrEqual(40);
  });

  it('n’avance pas AVANT son début', async () => {
    const { db, service, creditPoints } = setup();
    standardTrio(db);
    const row = personal(db);

    await service.onSignal(USER, 'axis:content.audio_message', { now: new Date('2026-10-06T15:59:59Z'), dayKey: DAY, timezone: 'UTC' });

    expect(row.progress).toBe(0);
    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('n’avance plus à la fin exacte de sa plage : fail-closed', async () => {
    const { db, service, creditPoints } = setup();
    standardTrio(db);
    const row = personal(db, { progress: 1 });

    await service.onSignal(USER, 'axis:content.audio_message', { now: ENDS, dayKey: DAY, timezone: 'UTC' });
    await service.onSignal(USER, 'axis:content.audio_message', { now: new Date('2026-10-06T20:00:00Z'), dayKey: DAY, timezone: 'UTC' });

    expect(row.progress).toBe(1);
    expect(row.completedAt).toBeNull();
    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('un geste dans la plage fait avancer la mission personnelle ET la mission du jour qui l’attend', async () => {
    const { db, service } = setup();
    standardTrio(db);
    const row = personal(db, { signal: 'axis:content.text_message', templateKey: 'send-texts', target: 9 });

    await service.onSignal(USER, 'axis:content.text_message', { now: new Date('2026-10-06T16:10:00Z'), dayKey: DAY, timezone: 'UTC' });

    expect(row.progress).toBe(1);
    expect(db.dailyMission.rows.find((r) => r.slot === 0)?.progress).toBe(1);
  });

  it('la mission du jour avance toujours hors de la plage de la personnelle', async () => {
    const { db, service } = setup();
    standardTrio(db);
    personal(db, { signal: 'axis:content.text_message' });

    await service.onSignal(USER, 'axis:content.text_message', { now: new Date('2026-10-06T21:00:00Z'), dayKey: DAY, timezone: 'UTC' });

    expect(db.dailyMission.rows.find((r) => r.slot === 0)?.progress).toBe(1);
    expect(db.dailyMission.rows.find((r) => r.slot === PERSONAL_MISSION_SLOT)?.progress).toBe(0);
  });

  it('ne pousse pas une mission du jour hors de la lecture : quatre lignes, trois du jour retrouvées', async () => {
    const { db, service } = setup();
    standardTrio(db);
    personal(db);

    await service.onSignal(USER, 'axis:content.post', { now: new Date('2026-10-06T09:30:00Z'), dayKey: DAY, timezone: 'UTC' });

    expect(db.dailyMission.rows.find((r) => r.slot === 1)?.progress).toBe(1);
  });
});

describe('la mission personnelle ne gouverne ni le coffre ni le changement de mission', () => {
  it('ensureToday ne rend que les trois missions du jour', async () => {
    const { db, service } = setup();
    standardTrio(db);
    personal(db);

    const today = await service.ensureToday(USER, new Date('2026-10-06T10:00:00Z'));

    expect(today.rows.map((r) => r.slot)).toEqual([0, 1, 2]);
    expect(db.dailyMission.rows).toHaveLength(4);
  });

  it('un tirage interrompu des trois du jour se complète même quand la personnelle est posée', async () => {
    const { db, service } = setup();
    insert(db, { slot: 0 });
    personal(db);

    const today = await service.ensureToday(USER, new Date('2026-10-06T10:00:00Z'));

    expect(today.rows.map((r) => r.slot)).toEqual([0, 1, 2]);
  });

  it('le coffre s’ouvre quand les TROIS du jour sont faites, même si la personnelle ne l’est pas', async () => {
    const { db, service, creditPoints } = setup();
    standardTrio(db, true);
    personal(db);

    const result = await service.claimChest({ userId: USER, requestId: 'coffre-perso-0001', now: new Date('2026-10-06T10:00:00Z') });

    expect(result.status).toBe('claimed');
    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('le changement de mission ne touche jamais la personnelle', async () => {
    const { db, service } = setup();
    standardTrio(db);
    const row = personal(db);
    db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: 5, reason: 'grant', requestId: 'octroi-0001' });

    let refusal: unknown;
    try {
      await service.reroll({ userId: USER, missionId: row.id, requestId: 'change-perso-0001', now: new Date('2026-10-06T10:00:00Z') });
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(GameRefusal);
    expect(row.templateKey).toBe('send-voice');
  });

  it('changer une mission du jour ne se trompe pas de ligne quand la personnelle existe', async () => {
    const { db, service } = setup();
    standardTrio(db);
    personal(db);
    db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: 5, reason: 'grant', requestId: 'octroi-0001' });
    const target = db.dailyMission.rows.find((r) => r.slot === 0)!;

    const result = await service.reroll({ userId: USER, missionId: target.id as string, requestId: 'change-jour-0001', now: new Date('2026-10-06T10:00:00Z') });

    expect(result.mission.id).toBe(target.id);
    expect(db.dailyMission.rows.find((r) => r.slot === PERSONAL_MISSION_SLOT)?.templateKey).toBe('send-voice');
  });
});
