/**
 * La télémétrie d'appel d'un compte est une DONNÉE PERSONNELLE (#11277) : le
 * modèle d'appareil, la plateforme, la note et son commentaire libre, rattachés
 * à un appel et à un participant. Elle s'exporte (RGPD art. 20) et s'efface à
 * la purge du compte (art. 17) — sans toucher à la ligne `CallParticipant`
 * elle-même, que l'historique d'appel de l'AUTRE participant lit encore, ni à
 * la télémétrie de cet autre participant.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { eraseCallTelemetryOf, exportCallTelemetry } from '../../../services/calls/callTelemetryPrivacy';

const ME = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const AT = new Date('2026-10-20T10:00:00.000Z');

type Row = {
  id: string;
  callSessionId: string;
  participantId: string;
  role: string;
  joinedAt: Date;
  leftAt: Date | null;
  analytics: Record<string, unknown> | null;
  feedback: Record<string, unknown> | null;
};

function fakeDb(rows: Row[]) {
  const participants = [
    { id: 'p-me-1', userId: ME },
    { id: 'p-me-2', userId: ME },
    { id: 'p-other', userId: OTHER },
  ];
  const ofParticipants = (where: { participantId: { in: string[] } }) => rows.filter((row) => where.participantId.in.includes(row.participantId));
  return {
    rows,
    participant: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        participants.filter((participant) => participant.userId === where.userId).map(({ id }) => ({ id })),
    },
    callParticipant: {
      findMany: async ({ where, take, skip }: { where: { participantId: { in: string[] } }; take: number; skip: number }) =>
        ofParticipants(where)
          .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
          .slice(skip, skip + take)
          .map(({ callSessionId, role, joinedAt, leftAt, analytics, feedback }) => ({ callSessionId, role, joinedAt, leftAt, analytics, feedback })),
      count: async ({ where }: { where: { participantId: { in: string[] } } }) => ofParticipants(where).length,
      updateMany: async ({ where, data }: { where: { participantId: { in: string[] } }; data: Partial<Row> }) => {
        const touched = ofParticipants(where);
        touched.forEach((row) => Object.assign(row, data));
        return { count: touched.length };
      },
    },
  };
}

const rowOf = (overrides: Partial<Row>): Row => ({
  id: 'cp',
  callSessionId: 'call-1',
  participantId: 'p-me-1',
  role: 'initiator',
  joinedAt: AT,
  leftAt: AT,
  analytics: { platform: 'ios', deviceModel: 'iPhone16,2', mos: 4.1 },
  feedback: { rating: 2, issues: ['echo'], comment: 'on s’entendait mal' },
  ...overrides,
});

describe('exportCallTelemetry', () => {
  it('rend la télémétrie et la note de CHACUN de mes appels, sur tous mes participants, et rien de celle des autres', async () => {
    const db = fakeDb([
      rowOf({ id: 'a', callSessionId: 'call-1', participantId: 'p-me-1' }),
      rowOf({ id: 'b', callSessionId: 'call-2', participantId: 'p-me-2', joinedAt: new Date('2026-10-21T10:00:00.000Z'), feedback: null }),
      rowOf({ id: 'c', callSessionId: 'call-1', participantId: 'p-other', analytics: { deviceModel: 'Pixel 9' } }),
    ]);

    const section = await exportCallTelemetry(db as never, ME, { limit: 10, offset: 0 });

    expect(section.total).toBe(2);
    expect(section.hasMore).toBe(false);
    expect(section.items.map((item) => item.callId)).toEqual(['call-2', 'call-1']);
    expect(section.items[1]).toEqual({
      callId: 'call-1',
      role: 'initiator',
      joinedAt: AT,
      leftAt: AT,
      analytics: { platform: 'ios', deviceModel: 'iPhone16,2', mos: 4.1 },
      feedback: { rating: 2, issues: ['echo'], comment: 'on s’entendait mal' },
    });
    expect(JSON.stringify(section)).not.toContain('Pixel 9');
  });

  it('pagine : la page suivante dit qu’il en reste', async () => {
    const db = fakeDb([rowOf({ id: 'a' }), rowOf({ id: 'b', callSessionId: 'call-2' })]);

    const section = await exportCallTelemetry(db as never, ME, { limit: 1, offset: 0 });

    expect(section.items).toHaveLength(1);
    expect(section.hasMore).toBe(true);
  });

  it('rend une section vide pour un compte sans participant', async () => {
    const section = await exportCallTelemetry(fakeDb([]) as never, '507f1f77bcf86cd799439033', { limit: 10, offset: 0 });

    expect(section).toEqual({ items: [], total: 0, hasMore: false });
  });
});

describe('eraseCallTelemetryOf', () => {
  it('efface ma télémétrie et ma note, garde la ligne d’appel et la télémétrie de l’autre', async () => {
    const db = fakeDb([
      rowOf({ id: 'a', participantId: 'p-me-1' }),
      rowOf({ id: 'b', participantId: 'p-me-2' }),
      rowOf({ id: 'c', participantId: 'p-other' }),
    ]);

    const erased = await eraseCallTelemetryOf(db as never, ME);

    expect(erased).toBe(2);
    expect(db.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(db.rows.filter((row) => row.participantId !== 'p-other').every((row) => row.analytics === null && row.feedback === null)).toBe(true);
    expect(db.rows.find((row) => row.id === 'c')?.analytics).toEqual(rowOf({}).analytics);
  });

  it('est rejouable : un second passage n’efface rien de plus et ne lève pas', async () => {
    const db = fakeDb([rowOf({ id: 'a' })]);
    await eraseCallTelemetryOf(db as never, ME);

    await expect(eraseCallTelemetryOf(db as never, ME)).resolves.toBe(1);
    expect(db.rows[0].analytics).toBeNull();
  });

  it('ne touche rien pour un compte sans participant', async () => {
    await expect(eraseCallTelemetryOf(fakeDb([rowOf({})]) as never, '507f1f77bcf86cd799439033')).resolves.toBe(0);
  });
});
