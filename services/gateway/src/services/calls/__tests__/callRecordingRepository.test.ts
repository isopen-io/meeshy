import { describe, it, expect, jest } from '@jest/globals';
import { callRosterFrom, prismaCallRecordingRepository } from '../callRecordingRepository';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Where[]).every((w) => matches(row, w));
    if (key === 'OR') return (condition as Where[]).some((w) => matches(row, w));
    if (key === 'NOT') return !matches(row, condition as Where);
    const value = row[key];
    if (condition === null) return value === null;
    if (typeof condition === 'object' && condition !== null && 'isSet' in condition) return (value !== undefined) === (condition as { isSet: boolean }).isSet;
    if (typeof condition === 'object' && condition !== null && 'has' in condition) return Array.isArray(value) && value.includes((condition as { has: unknown }).has);
    return value === condition;
  });

const fakePrisma = (rows: Row[]) => {
  const state = { rows };
  const apply = (row: Row, data: Row): Row =>
    Object.entries(data).reduce<Row>((acc, [key, value]) => {
      if (value && typeof value === 'object' && 'push' in value) {
        return { ...acc, [key]: [...((acc[key] as unknown[]) ?? []), (value as { push: unknown }).push] };
      }
      return { ...acc, [key]: value };
    }, row);
  return {
    state,
    callRecording: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `r${state.rows.length}`, stopReason: null, ...data };
        state.rows = [...state.rows, row];
        return row;
      },
      findUnique: async ({ where }: { where: Where }) => state.rows.find((row) => matches(row, where)) ?? null,
      findFirst: async ({ where }: { where: Where }) => state.rows.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const hits = state.rows.filter((row) => matches(row, where));
        state.rows = state.rows.map((row) => (hits.includes(row) ? apply(row, data) : row));
        return { count: hits.length };
      },
    },
  };
};

const legacyRow = (overrides: Row = {}): Row => ({
  id: 'r0',
  callSessionId: 'call',
  requesterId: 'alice',
  requiredUserIds: ['bob'],
  consentedUserIds: [],
  requestedAt: new Date(0),
  ...overrides,
});

describe('prismaCallRecordingRepository — chaque transition est une écriture conditionnelle (#8064)', () => {
  it('crée une demande avec des dates explicitement nulles', async () => {
    const prisma = fakePrisma([]);
    const created = await prismaCallRecordingRepository(prisma as never).create({
      callSessionId: 'call', requesterId: 'alice', requiredUserIds: ['bob'], requestedAt: new Date(0), kind: 'audio',
    });
    expect(created).toMatchObject({ startedAt: null, stoppedAt: null, attachmentId: null, consentedUserIds: [] });
  });

  it('stocke le type demandé, et lit « audio » une ligne antérieure au champ (#8437)', async () => {
    const prisma = fakePrisma([legacyRow()]);
    const repository = prismaCallRecordingRepository(prisma as never);
    expect((await repository.findById('r0'))?.kind).toBe('audio');

    const created = await repository.create({
      callSessionId: 'call', requesterId: 'alice', requiredUserIds: ['bob'], requestedAt: new Date(0), kind: 'video',
    });
    expect(created.kind).toBe('video');
    expect(prisma.state.rows[1]?.kind).toBe('video');
  });

  it('traite un champ ABSENT comme nul : une ligne sans dates est ouverte et en attente', async () => {
    const prisma = fakePrisma([legacyRow()]);
    const repository = prismaCallRecordingRepository(prisma as never);
    expect(await repository.findOpen('call')).toMatchObject({ id: 'r0', startedAt: null });
    await repository.addConsent('r0', 'bob');
    expect(await repository.markStarted('r0', new Date(1))).toBe(true);
  });

  it('un accord n’est compté qu’une fois, et plus du tout après le démarrage', async () => {
    const prisma = fakePrisma([legacyRow({ startedAt: null, stoppedAt: null })]);
    const repository = prismaCallRecordingRepository(prisma as never);
    await repository.addConsent('r0', 'bob');
    await repository.addConsent('r0', 'bob');
    expect(prisma.state.rows[0]?.consentedUserIds).toEqual(['bob']);
    await repository.markStarted('r0', new Date(1));
    await repository.addConsent('r0', 'carol');
    expect(prisma.state.rows[0]?.consentedUserIds).toEqual(['bob']);
  });

  it('ne démarre ni un enregistrement arrêté, ni deux fois ; n’arrête qu’une fois', async () => {
    const prisma = fakePrisma([legacyRow({ startedAt: null, stoppedAt: null })]);
    const repository = prismaCallRecordingRepository(prisma as never);
    expect(await repository.markStopped('r0', { reason: 'refused', byUserId: 'bob', at: new Date(1) })).toBe(true);
    expect(await repository.markStarted('r0', new Date(2))).toBe(false);
    expect(await repository.markStopped('r0', { reason: 'stopped', byUserId: 'bob', at: new Date(3) })).toBe(false);
    expect(prisma.state.rows[0]).toMatchObject({ stopReason: 'refused', stoppedByUserId: 'bob' });
  });
});

describe('callRosterFrom — la liste des participants encore présents', () => {
  it('rend les participants sans date de départ, sous leur userId', async () => {
    const roster = callRosterFrom({
      getCallSession: jest.fn(async () => ({
        status: 'active',
        conversationId: 'conv',
        participants: [
          { participantId: 'p1', leftAt: null, participant: { userId: 'alice' } },
          { participantId: 'p2', leftAt: new Date(), participant: { userId: 'bob' } },
          { participantId: 'p3', leftAt: null, participant: { userId: 'carol' } },
        ],
      })),
    } as never);
    expect(await roster('call')).toEqual({ status: 'active', conversationId: 'conv', activeUserIds: ['alice', 'carol'] });
  });

  it('un appel illisible ne rend aucune liste (fail-closed)', async () => {
    const roster = callRosterFrom({ getCallSession: jest.fn(async () => { throw new Error('CALL_NOT_FOUND'); }) } as never);
    expect(await roster('call')).toBeNull();
  });
});
