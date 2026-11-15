/**
 * UN DÉFI AVANCE À L'INSTANT OÙ ON LE RÉALISE (#16425) — `game:missions-updated` `{ dayKey }` part dans la room
 * `user:<id>` du seul joueur dès qu'une de ses missions avance, se termine, ou que son coffre s'ouvre. Rien ne part
 * pour un geste qui n'avance rien, et une émission qui tombe ne coûte jamais le geste.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { MissionService } from '../MissionService';
import { EngagementGameHooks } from '../EngagementGameHooks';
import type { ServerEmitIO } from '../../../socketio/serverEmit';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T10:00:00Z');
const DAY = '2026-10-05';
const LEVEL_20 = 100 * 20 * 20;

type Emitted = { readonly room: unknown; readonly event: string; readonly payload: unknown };

const recordingIO = () => {
  const emitted: Emitted[] = [];
  const io = {
    to: (room: unknown) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
        return true;
      },
    }),
  } as unknown as ServerEmitIO;
  return { io, emitted };
};

const setup = (emitIO?: () => ServerEmitIO | undefined) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20 });
  const creditPoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
  const service = new MissionService(db.prisma, { creditPoints, ...(emitIO ? { emitIO } : {}) });
  return { db, service };
};

const insertMission = (db: FakeGameDb, fields: Record<string, unknown>) => {
  const row = {
    id: `mission-${db.dailyMission.rows.length}`,
    userId: USER,
    dayKey: DAY,
    slot: db.dailyMission.rows.length,
    templateKey: 'send-texts',
    difficulty: 'easy',
    signal: 'axis:content.text_message',
    prism: false,
    target: 3,
    progress: 0,
    reward: 40,
    glory: 0,
    seen: [],
    completedAt: null,
    paidPoints: null,
    rerolledAt: null,
    createdAt: NOW,
    ...fields,
  };
  db.dailyMission.rows.push(row);
  return row;
};

const missionsUpdated = (emitted: readonly Emitted[]) => emitted.filter((e) => e.event === SERVER_EVENTS.GAME_MISSIONS_UPDATED);

describe('game:missions-updated (#16425)', () => {
  it('le nom de l’événement suit la convention entity:action-word', () => {
    expect(SERVER_EVENTS.GAME_MISSIONS_UPDATED).toBe('game:missions-updated');
  });

  it('une mission qui AVANCE émet { dayKey } dans la seule room user:<id> du joueur', async () => {
    const { io, emitted } = recordingIO();
    const { db, service } = setup(() => io);
    insertMission(db, { target: 3 });

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(missionsUpdated(emitted)).toEqual([{ room: ROOMS.user(USER), event: 'game:missions-updated', payload: { dayKey: DAY } }]);
  });

  it('une mission qui se TERMINE émet aussi', async () => {
    const { io, emitted } = recordingIO();
    const { db, service } = setup(() => io);
    insertMission(db, { target: 1 });

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(db.dailyMission.rows[0]).toMatchObject({ completedAt: NOW });
    expect(missionsUpdated(emitted)).toEqual([{ room: ROOMS.user(USER), event: 'game:missions-updated', payload: { dayKey: DAY } }]);
  });

  it('un geste qui n’avance aucune mission n’émet rien', async () => {
    const { io, emitted } = recordingIO();
    const { db, service } = setup(() => io);
    insertMission(db, { signal: 'axis:tool.reaction' });

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(missionsUpdated(emitted)).toEqual([]);
  });

  it('une clé distincte déjà vue n’émet rien : la mission n’a pas avancé', async () => {
    const { io, emitted } = recordingIO();
    const { db, service } = setup(() => io);
    insertMission(db, { signal: 'conversation-started', target: 3, seen: ['a&b'] });

    await service.onSignal(USER, 'conversation-started', { now: NOW, key: 'a&b' });

    expect(missionsUpdated(emitted)).toEqual([]);
  });

  it('le coffre qui s’ouvre émet { dayKey }', async () => {
    const { io, emitted } = recordingIO();
    const { db, service } = setup(() => io);
    for (const difficulty of ['easy', 'medium', 'hard']) insertMission(db, { difficulty, completedAt: NOW, progress: 3 });

    const result = await service.claimChest({ userId: USER, requestId: 'coffre-temps-reel-1', now: NOW });

    expect(result.status).toBe('claimed');
    expect(missionsUpdated(emitted)).toEqual([{ room: ROOMS.user(USER), event: 'game:missions-updated', payload: { dayKey: DAY } }]);
  });

  it('une émission qui lève ne coûte jamais le geste', async () => {
    const throwing = { to: () => ({ emit: () => { throw new Error('socket tombé'); } }) } as unknown as ServerEmitIO;
    const { db, service } = setup(() => throwing);
    insertMission(db, { target: 3 });

    await expect(service.onSignal(USER, 'axis:content.text_message', { now: NOW })).resolves.toBeUndefined();
    expect(db.dailyMission.rows[0]?.progress).toBe(1);
  });

  it('sans serveur temps réel (tests, scripts), rien ne part et rien ne lève', async () => {
    const { db, service } = setup(() => undefined);
    insertMission(db, { target: 3 });

    await expect(service.onSignal(USER, 'axis:content.text_message', { now: NOW })).resolves.toBeUndefined();
    expect(db.dailyMission.rows[0]?.progress).toBe(1);
  });
});

describe('le câblage : les hooks du jeu passent le serveur temps réel aux missions (#16425)', () => {
  it('un signal reçu par les hooks émet game:missions-updated', async () => {
    const { io, emitted } = recordingIO();
    const db = fakeGameDb();
    seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20 });
    insertMission(db, { target: 3 });
    const creditPoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
    const hooks = new EngagementGameHooks(db.prisma, creditPoints, { emitIO: () => io, photoPushOn: () => false });

    await hooks.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(missionsUpdated(emitted)).toEqual([{ room: ROOMS.user(USER), event: 'game:missions-updated', payload: { dayKey: DAY } }]);
  });
});
