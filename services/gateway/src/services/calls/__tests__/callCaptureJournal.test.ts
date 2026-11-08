import { describe, it, expect } from '@jest/globals';
import { prismaCallCaptureJournal, toTranscriptCaptures, type CallCaptureRow } from '../callCaptureJournal';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const STARTED = new Date('2026-11-07T10:00:00.000Z');

type Row = { id: string; callSessionId: string; participantId: string | null; userId: string | null; kind: string; offsetMs: number; createdAt: Date };

const fakePrisma = (options: { session?: boolean; participants?: ReadonlyArray<{ participantId: string; userId: string }> } = {}) => {
  const state: { rows: Row[] } = { rows: [] };
  const session = options.session ?? true;
  const participants = options.participants ?? [];
  return {
    state,
    callSession: {
      findUnique: async () => (session ? { startedAt: STARTED } : null),
    },
    callParticipant: {
      findFirst: async ({ where }: { where: { participant: { userId: string } } }) => {
        const hit = participants.find((entry) => entry.userId === where.participant.userId);
        return hit === undefined ? null : { participantId: hit.participantId };
      },
    },
    callCaptureEvent: {
      create: async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row = { id: `c${state.rows.length}`, ...data };
        state.rows = [...state.rows, row];
        return row;
      },
      findFirst: async ({ where }: { where: { callSessionId: string; participantId: string; kind: string; createdAt: { gte: Date } } }) =>
        state.rows.find(
          (row) =>
            row.callSessionId === where.callSessionId &&
            row.participantId === where.participantId &&
            row.kind === where.kind &&
            row.createdAt.getTime() >= where.createdAt.gte.getTime(),
        ) ?? null,
      findMany: async () => [...state.rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
  };
};

const at = (seconds: number) => () => new Date(STARTED.getTime() + seconds * 1000);

describe('callCaptureJournal — chaque début de capture d’écran se garde (#16665)', () => {
  it('écrit le début d’une capture avec son décalage depuis le début de l’appel', async () => {
    const prisma = fakePrisma();
    const journal = prismaCallCaptureJournal(prisma as never, at(760));

    const written = await journal.screenCaptureStarted({ callId: CALL, participantId: 'p-karim', userId: 'u-karim', kind: 'screenshot' });

    expect(written).toBe(true);
    expect(prisma.state.rows).toEqual([
      expect.objectContaining({ callSessionId: CALL, participantId: 'p-karim', userId: 'u-karim', kind: 'screenshot', offsetMs: 760_000 }),
    ]);
  });

  it('n’écrit qu’une ligne par participant et par sorte dans une fenêtre de 5 s', async () => {
    const prisma = fakePrisma();
    const clock = { now: 10 };
    const journal = prismaCallCaptureJournal(prisma as never, () => at(clock.now)());
    const karim = { callId: CALL, participantId: 'p-karim', userId: 'u-karim' } as const;

    await journal.screenCaptureStarted({ ...karim, kind: 'screenshot' });
    clock.now = 14;
    const repeated = await journal.screenCaptureStarted({ ...karim, kind: 'screenshot' });
    const otherKind = await journal.screenCaptureStarted({ ...karim, kind: 'recording' });
    clock.now = 16;
    const later = await journal.screenCaptureStarted({ ...karim, kind: 'screenshot' });

    expect([repeated, otherKind, later]).toEqual([false, true, true]);
    expect(prisma.state.rows.map((row) => row.kind)).toEqual(['screenshot', 'recording', 'screenshot']);
  });

  it('n’écrit qu’une ligne pour deux débuts simultanés du même participant', async () => {
    const prisma = fakePrisma();
    const slowFindFirst = prisma.callCaptureEvent.findFirst;
    const created: unknown[] = [];
    const slowCreate = prisma.callCaptureEvent.create;
    const racy = {
      ...prisma,
      callCaptureEvent: {
        ...prisma.callCaptureEvent,
        findFirst: async (args: Parameters<typeof slowFindFirst>[0]) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return slowFindFirst(args);
        },
        create: async (args: Parameters<typeof slowCreate>[0]) => {
          created.push(args);
          return slowCreate(args);
        },
      },
    };
    const journal = prismaCallCaptureJournal(racy as never, at(30));
    const input = { callId: CALL, participantId: 'p-karim', userId: 'u-karim', kind: 'screenshot' } as const;

    const results = await Promise.all([journal.screenCaptureStarted(input), journal.screenCaptureStarted(input)]);

    expect(created).toHaveLength(1);
    expect([...results].sort()).toEqual([false, true]);
  });

  it('n’écrit rien pour un appel inconnu', async () => {
    const prisma = fakePrisma({ session: false });
    const journal = prismaCallCaptureJournal(prisma as never, at(1));

    expect(await journal.screenCaptureStarted({ callId: CALL, participantId: 'p', userId: 'u', kind: 'recording' })).toBe(false);
    expect(prisma.state.rows).toEqual([]);
  });
});

describe('callCaptureJournal — l’enregistrement consenti note son début et sa fin', () => {
  it('rattache le début à la participation de l’enregistreur', async () => {
    const prisma = fakePrisma({ participants: [{ participantId: 'p-awa', userId: 'u-awa' }] });
    const journal = prismaCallCaptureJournal(prisma as never, at(30));

    await journal.callRecording({ callId: CALL, userId: 'u-awa', kind: 'call-recording-started' });

    expect(prisma.state.rows).toEqual([expect.objectContaining({ participantId: 'p-awa', userId: 'u-awa', kind: 'call-recording-started', offsetMs: 30_000 })]);
  });

  it('écrit un arrêt que personne n’a demandé sans auteur', async () => {
    const prisma = fakePrisma();
    const journal = prismaCallCaptureJournal(prisma as never, at(90));

    await journal.callRecording({ callId: CALL, userId: null, kind: 'call-recording-stopped' });

    expect(prisma.state.rows).toEqual([expect.objectContaining({ participantId: null, userId: null, kind: 'call-recording-stopped', offsetMs: 90_000 })]);
  });

  it('ne dédoublonne pas deux moments d’enregistrement rapprochés', async () => {
    const prisma = fakePrisma({ participants: [{ participantId: 'p-awa', userId: 'u-awa' }] });
    const journal = prismaCallCaptureJournal(prisma as never, at(30));

    await journal.callRecording({ callId: CALL, userId: 'u-awa', kind: 'call-recording-started' });
    await journal.callRecording({ callId: CALL, userId: 'u-awa', kind: 'call-recording-stopped' });
    await journal.callRecording({ callId: CALL, userId: 'u-awa', kind: 'call-recording-started' });

    expect(prisma.state.rows).toHaveLength(3);
  });
});

describe('toTranscriptCaptures — la forme servie à côté des segments', () => {
  const row = (overrides: Partial<CallCaptureRow> = {}): CallCaptureRow => ({
    id: 'c1',
    participantId: 'p-karim',
    userId: 'u-karim',
    kind: 'screenshot',
    offsetMs: 760_000,
    createdAt: new Date('2026-11-07T10:12:40.000Z'),
    ...overrides,
  });

  it('nomme l’auteur depuis les participants de l’appel et date la ligne', () => {
    const participants = new Map([['p-karim', { userId: 'u-karim', user: { displayName: 'Karim', username: 'karim' } }]]);

    expect(toTranscriptCaptures([row()], participants)).toEqual([
      { id: 'c1', participantId: 'p-karim', userId: 'u-karim', displayName: 'Karim', kind: 'screenshot', offsetMs: 760_000, at: '2026-11-07T10:12:40.000Z' },
    ]);
  });

  it('se replie sur le pseudo, puis sur rien', () => {
    const participants = new Map([['p-karim', { userId: 'u-karim', user: { displayName: null, username: 'karim' } }]]);

    expect(toTranscriptCaptures([row()], participants)[0]?.displayName).toBe('karim');
    expect(toTranscriptCaptures([row({ participantId: null, userId: null, kind: 'call-recording-stopped' })], participants)[0]).toEqual(
      expect.objectContaining({ participantId: null, userId: null, displayName: null }),
    );
  });

  it('écarte une sorte inconnue', () => {
    expect(toTranscriptCaptures([row({ kind: 'call-recording-paused' as never })], new Map())).toEqual([]);
  });
});
