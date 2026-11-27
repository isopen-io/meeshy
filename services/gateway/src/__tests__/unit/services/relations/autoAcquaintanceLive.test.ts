/**
 * Une Connaissance née toute seule APPARAÎT aussitôt dans « Mes cercles » des
 * deux personnes (#19538) : `relation:level-raised` part vers la room de
 * chacune, avec l'identifiant de l'autre — le seul déclencheur temps réel de
 * relecture des liens sur les trois clients. Ce qui ne s'annonce pas ne s'émet
 * pas non plus (renaissance, retrait silencieux, RG-07).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { evaluateAutoAcquaintance } from '../../../../services/relations/autoAcquaintance';
import type { RelationIo } from '../../../../socketio/relationEvents';
import { RelationWeeklyJob } from '../../../../jobs/relation-weekly';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');

const qualifying = { Message: 4, Reaction: 2, PostView: 2, Audio: 2 };

const dayRow = (low: Record<string, number>, high: Record<string, number>) => ({
  id: 'dd0000000000000000000001',
  userLowId: LOW,
  userHighId: HIGH,
  day: new Date(Date.UTC(2026, 9, 31)),
  ...Object.fromEntries(Object.entries(low).map(([k, v]) => [`byLow${k}`, v])),
  ...Object.fromEntries(Object.entries(high).map(([k, v]) => [`byHigh${k}`, v])),
});

const user = (id: string, over: Record<string, unknown> = {}) => ({ id, birthDate: ADULT, blockedUserIds: [], ...over });

type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

const recordingIo = (options: { failing?: boolean } = {}) => {
  const emissions: Emission[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        if (options.failing) throw new Error('socket down');
        emissions.push({ room, event, payload });
        return true;
      },
    }),
  } as unknown as RelationIo;
  return { io, emissions };
};

const setup = (over: { days?: unknown[]; users?: unknown[]; relations?: unknown[]; failing?: boolean } = {}) => {
  const store = pairInteractionStore({
    days: (over.days ?? [dayRow(qualifying, qualifying)]) as never,
    users: (over.users ?? [user(LOW), user(HIGH)]) as never,
    relations: (over.relations ?? []) as never,
  });
  const { io, emissions } = recordingIo({ failing: over.failing });
  const evaluate = () =>
    evaluateAutoAcquaintance({ prisma: store.prisma, io, notify: async () => undefined, now: () => NOW }, { userA: HIGH, userB: LOW });
  return { store, emissions, evaluate };
};

const raisedTo = (emissions: ReadonlyArray<Emission>) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.RELATION_LEVEL_RAISED).map((e) => [e.room, e.payload]);

const expectedPair = [
  [`user:${LOW}`, { userId: HIGH, level: 'ACQUAINTANCE', at: NOW.toISOString() }],
  [`user:${HIGH}`, { userId: LOW, level: 'ACQUAINTANCE', at: NOW.toISOString() }],
];

const autoRow = (over: Record<string, unknown> = {}) => ({
  id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
  levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'auto-acquaintance', transitions: [], ...over,
});

describe('evaluateAutoAcquaintance — le lien né tout seul apparaît chez les deux (#19538)', () => {
  it('une Connaissance créée émet relation:level-raised à la room de chacun, avec l’autre pour sujet', async () => {
    const { emissions, evaluate } = setup();

    expect(await evaluate()).toBe('created');
    expect(raisedTo(emissions)).toEqual(expectedPair);
  });

  it('une Connaissance relevée (un côté sous ACQUAINTANCE) émet aussi aux deux', async () => {
    const mixed = autoRow({ grantedByLow: 'CLOSE', grantedByHigh: 'PUBLIC', origin: 'request' });
    const { emissions, evaluate } = setup({ relations: [mixed] });

    expect(await evaluate()).toBe('raised');
    expect(raisedTo(emissions)).toEqual(expectedPair);
  });

  it('rejouée, la passe qui ne change rien n’émet rien', async () => {
    const first = setup();
    await first.evaluate();
    const second = setup({ relations: first.store.relations() as unknown[] });

    expect(await second.evaluate()).toBe('unchanged');
    expect(second.emissions).toEqual([]);
  });

  it('des échanges insuffisants n’émettent rien', async () => {
    const { emissions, evaluate } = setup({ days: [dayRow(qualifying, {})] });

    expect(await evaluate()).toBe('insufficient');
    expect(emissions).toEqual([]);
  });

  it('un retrait silencieux (blocage) n’émet rien vers personne (RG-07)', async () => {
    const { emissions, evaluate } = setup({ relations: [autoRow()], users: [user(LOW, { blockedUserIds: [HIGH] }), user(HIGH)] });

    expect(await evaluate()).toBe('cancelled');
    expect(emissions).toEqual([]);
  });

  it('une renaissance ne s’émet pas plus qu’elle ne s’annonce', async () => {
    const reborn = autoRow({
      grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC',
      transitions: [LOW, HIGH].map((actorId) => ({
        actorId, from: 'PUBLIC', to: 'ACQUAINTANCE', at: new Date('2026-10-20T00:00:00Z'), cause: 'auto-acquaintance',
      })),
    });
    const { emissions, evaluate } = setup({ relations: [reborn] });

    expect(await evaluate()).toBe('raised');
    expect(emissions).toEqual([]);
  });

  it('un échec d’émission ne défait pas le lien : il est écrit, l’événement est perdu', async () => {
    const { store, evaluate } = setup({ failing: true });

    expect(await evaluate()).toBe('created');
    expect(store.relations()).toHaveLength(1);
  });
});

describe('RelationWeeklyJob — le rattrapage reçoit l’io Socket.IO (#19538)', () => {
  const jobStore = () =>
    pairInteractionStore({ days: [dayRow(qualifying, qualifying)] as never, users: [user(LOW), user(HIGH)] as never });

  it('le rattrapage qui fait naître une Connaissance émet relation:level-raised aux deux', async () => {
    const s = jobStore();
    const { io, emissions } = recordingIo();
    const job = new RelationWeeklyJob(s.prisma as never, { resolveIO: () => io });

    expect(await job.runNow(NOW)).toMatchObject({ created: 1 });
    expect(raisedTo(emissions)).toEqual(expectedPair);
  });

  it('sans io résolu (Socket.IO pas encore monté), le lien naît quand même', async () => {
    const s = jobStore();
    const job = new RelationWeeklyJob(s.prisma as never, { resolveIO: () => undefined });

    expect(await job.runNow(NOW)).toMatchObject({ created: 1 });
    expect(s.relations()).toHaveLength(1);
  });
});
