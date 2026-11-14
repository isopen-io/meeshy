/**
 * Le décroché se porte par LIGNE d'appel (#18242 B1) : une réponse SDP marque
 * les deux bouts de la négociation qu'elle conclut — celui qui répond, et
 * l'offrant qu'il rejoint. Une sonnerie seule n'échange aucune réponse.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { markCallParticipantsAnswered } from '../callParticipantAnswered';

const NOW = new Date('2026-11-14T10:00:05.000Z');

const prismaWith = (outcome: { count: number } | Error = { count: 1 }) => {
  const updateMany = jest.fn(async (_args: unknown) => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { prisma: { callParticipant: { updateMany } } as never, updateMany };
};

describe('markCallParticipantsAnswered', () => {
  it('marque les lignes pas encore marquées, par une écriture GARDÉE (jamais deux horodatages)', async () => {
    const { prisma, updateMany } = prismaWith({ count: 2 });

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa', answeredAt: null }, { id: 'row-moi' }], NOW);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['row-awa', 'row-moi'] }, answeredAt: null },
      data: { answeredAt: NOW }
    });
  });

  it('n\'écrit rien quand les deux bouts sont déjà marqués (renégociation en cours d\'appel)', async () => {
    const { prisma, updateMany } = prismaWith();

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa', answeredAt: NOW }, { id: 'row-moi', answeredAt: NOW }], NOW);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ne marque qu\'une fois une ligne nommée deux fois, et ignore un bout absent', async () => {
    const { prisma, updateMany } = prismaWith();

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa' }, { id: 'row-awa' }, null, undefined], NOW);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['row-awa'] }, answeredAt: null } }));
  });

  it('une panne d\'écriture ne fait jamais échouer le relais du signal', async () => {
    const { prisma } = prismaWith(new Error('mongo down'));

    await expect(markCallParticipantsAnswered(prisma, [{ id: 'row-awa' }], NOW)).resolves.toBeUndefined();
  });
});
