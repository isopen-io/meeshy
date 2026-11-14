/**
 * Qui a PRIS PART à l'appel, pour la carte du fil (#17868, #18242 B1).
 *
 * iOS et Android émettent `call:join` dès la SONNERIE : une ligne
 * `CallParticipant` existe pour qui a seulement sonné, et un refus la ferme
 * (`leftAt`). `CallSession.answeredAt` est porté par l'appel entier : un seul
 * décroché ne fait entrer personne d'autre. Seul `CallParticipant.answeredAt`
 * dit qui a décroché ; l'initiateur d'un appel décroché compte.
 */
import { describe, it, expect, jest } from '@jest/globals';

const mockWarn = jest.fn();
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: mockWarn, error: jest.fn(), debug: jest.fn() }
}));

import { resolveCallSummaryParticipantIds } from '../callSummaryParticipants';
import { CALL_PARTICIPANT_ANSWERS_TRACKED_SINCE } from '../answeredCallRoster';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const RING = new Date('2026-11-14T10:00:00.000Z');
const ANSWER = new Date('2026-11-14T10:00:05.000Z');
const LATER = new Date('2026-11-14T10:03:00.000Z');

type Row = {
  readonly role: 'initiator' | 'participant';
  readonly answeredAt: Date | null;
  readonly leftAt: Date | null;
  readonly participant: { readonly userId: string | null } | null;
};

const row = (userId: string | null, overrides: Partial<Omit<Row, 'participant'>> = {}): Row => ({
  role: 'participant',
  answeredAt: null,
  leftAt: null,
  ...overrides,
  participant: { userId }
});

const initiator = (overrides: Partial<Omit<Row, 'participant'>> = {}): Row => row('u_moi', { role: 'initiator', ...overrides });

const prismaWith = (rows: ReadonlyArray<Row> | Error) => {
  const findMany = jest.fn(async (_args: unknown): Promise<ReadonlyArray<Row>> => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { prisma: { callParticipant: { findMany } } as never, findMany };
};

const answeredCall = { id: CALL, answeredAt: ANSWER };

describe('resolveCallSummaryParticipantIds — seuls ceux qui ont DÉCROCHÉ', () => {
  it('groupe de trois : Karim rejoint à la sonnerie puis refuse, Awa décroche ⇒ Karim absent', async () => {
    const { prisma } = prismaWith([
      initiator(),
      row('u_karim', { leftAt: RING }),
      row('u_awa', { answeredAt: ANSWER })
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, answeredCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('une sonnerie IGNORÉE pendant que les autres parlent ne fait pas un participant', async () => {
    const { prisma } = prismaWith([
      initiator({ answeredAt: ANSWER }),
      row('u_karim'),
      row('u_awa', { answeredAt: ANSWER })
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, answeredCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('un refus TARDIF (après le décroché d\'Awa) ne fait pas un participant', async () => {
    const { prisma } = prismaWith([
      initiator(),
      row('u_awa', { answeredAt: ANSWER }),
      row('u_karim', { leftAt: LATER })
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, answeredCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('garde l\'ordre d\'arrivée et lit dans l\'ordre de `joinedAt`', async () => {
    const { prisma, findMany } = prismaWith([
      initiator(),
      row('u_lina', { answeredAt: LATER }),
      row('u_awa', { answeredAt: ANSWER })
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, answeredCall)).toEqual(['u_moi', 'u_lina', 'u_awa']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { callSessionId: CALL },
      orderBy: { joinedAt: 'asc' }
    }));
  });

  it('un appel jamais décroché n\'a aucun participant à nommer, et ne lit rien', async () => {
    const { prisma, findMany } = prismaWith([initiator(), row('u_karim')]);

    expect(await resolveCallSummaryParticipantIds(prisma, { id: CALL, answeredAt: null })).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('un appel décroché AVANT le déploiement du champ (aucune ligne marquée) garde la liste d\'avant, sans alerte', async () => {
    mockWarn.mockClear();
    const { prisma } = prismaWith([initiator(), row('u_karim'), row('u_awa')]);
    const before = new Date(CALL_PARTICIPANT_ANSWERS_TRACKED_SINCE.getTime() - 60_000);

    expect(await resolveCallSummaryParticipantIds(prisma, { id: CALL, answeredAt: before })).toEqual(['u_moi', 'u_karim', 'u_awa']);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('un appel décroché APRÈS le déploiement sans aucune ligne marquée ne retombe PAS sur l\'ancienne liste : l\'initiateur seul, et une alerte', async () => {
    mockWarn.mockClear();
    const { prisma } = prismaWith([initiator(), row('u_karim'), row('u_awa')]);
    const after = new Date(CALL_PARTICIPANT_ANSWERS_TRACKED_SINCE.getTime() + 60_000);

    expect(await resolveCallSummaryParticipantIds(prisma, { id: CALL, answeredAt: after })).toEqual(['u_moi']);
    expect(mockWarn).toHaveBeenCalledWith(expect.stringMatching(/answered call has no answered participant/i), expect.objectContaining({ callId: CALL }));
  });

  it('écarte une ligne sans compte, une ligne orpheline et le second appareil d\'un même compte', async () => {
    const { prisma } = prismaWith([
      initiator(),
      row(null, { answeredAt: ANSWER }),
      { ...row('u_x'), participant: null },
      row('u_awa', { answeredAt: ANSWER }),
      row('u_awa', { answeredAt: LATER })
    ]);

    expect(await resolveCallSummaryParticipantIds(prisma, answeredCall)).toEqual(['u_moi', 'u_awa']);
  });

  it('ne demande que le compte : ni nom, ni e-mail, ni numéro', async () => {
    const { prisma, findMany } = prismaWith([initiator()]);

    await resolveCallSummaryParticipantIds(prisma, answeredCall);

    expect(JSON.stringify(findMany.mock.calls[0])).not.toMatch(/displayName|email|phone|password/i);
  });

  it('une panne de lecture REMONTE : c\'est l\'appelant qui décide de reprendre ou de servir sans la ligne', async () => {
    const { prisma } = prismaWith(new Error('mongo down'));

    await expect(resolveCallSummaryParticipantIds(prisma, answeredCall)).rejects.toThrow('mongo down');
  });
});
