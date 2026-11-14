import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { resolveCallSummaryParticipants } from '../callSummaryParticipants';

const CALL = '64b7f0c2a1b2c3d4e5f60718';

type Row = {
  readonly participant: {
    readonly userId: string | null;
    readonly displayName: string;
    readonly user: {
      readonly displayName: string | null;
      readonly firstName: string | null;
      readonly lastName: string | null;
      readonly username: string;
    } | null;
  } | null;
};

const account = (overrides: Partial<NonNullable<Row['participant']>['user'] & object> = {}) => ({
  displayName: null,
  firstName: null,
  lastName: null,
  username: 'someone',
  ...overrides
});

const row = (userId: string | null, displayName: string, user: Row['participant'] extends infer P ? (P extends { user: infer U } ? U : never) : never = account()): Row => ({
  participant: { userId, displayName, user }
});

const prismaWith = (rows: ReadonlyArray<Row> | Error) => {
  const findMany = jest.fn(async (_args: unknown) => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { prisma: { callParticipant: { findMany } } as never, findMany };
};

describe('resolveCallSummaryParticipants — ceux qui ont réellement rejoint l\'appel', () => {
  it('rend les participants dans l\'ordre d\'arrivée, avec le nom que la conversation montre', async () => {
    const { prisma, findMany } = prismaWith([
      row('u_awa', 'Awa'),
      row('u_karim', 'Karim'),
      row('u_lina', 'Lina')
    ]);

    const result = await resolveCallSummaryParticipants(prisma, CALL);

    expect(result).toEqual([
      { userId: 'u_awa', displayName: 'Awa' },
      { userId: 'u_karim', displayName: 'Karim' },
      { userId: 'u_lina', displayName: 'Lina' }
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { callSessionId: CALL },
      orderBy: { joinedAt: 'asc' }
    }));
  });

  it('lit le nom comme la conversation : copie du participant, puis nom du compte, puis prénom nom, puis pseudo', async () => {
    const { prisma } = prismaWith([
      row('u_1', 'Copie locale', account({ displayName: 'Compte' })),
      row('u_2', '  ', account({ displayName: 'Compte 2' })),
      row('u_3', '', account({ firstName: 'Lina', lastName: 'Diallo' })),
      row('u_4', '', account({ username: 'karim_k' }))
    ]);

    const names = (await resolveCallSummaryParticipants(prisma, CALL)).map((entry) => entry.displayName);

    expect(names).toEqual(['Copie locale', 'Compte 2', 'Lina Diallo', 'karim_k']);
  });

  it('ne demande ni e-mail, ni numéro, ni aucune coordonnée à la base', async () => {
    const { prisma, findMany } = prismaWith([row('u_awa', 'Awa')]);

    await resolveCallSummaryParticipants(prisma, CALL);

    const serialized = JSON.stringify(findMany.mock.calls[0]);
    expect(serialized).not.toMatch(/email|phone|Phone|password/i);
  });

  it('écarte une ligne sans compte (anonyme, robot) et une ligne orpheline', async () => {
    const { prisma } = prismaWith([
      row(null, 'ano_visiteur', null as never),
      { participant: null },
      row('u_awa', 'Awa')
    ]);

    expect(await resolveCallSummaryParticipants(prisma, CALL)).toEqual([{ userId: 'u_awa', displayName: 'Awa' }]);
  });

  it('une panne de lecture ne coûte jamais le résumé : liste vide', async () => {
    const { prisma } = prismaWith(new Error('mongo down'));

    expect(await resolveCallSummaryParticipants(prisma, CALL)).toEqual([]);
  });
});
