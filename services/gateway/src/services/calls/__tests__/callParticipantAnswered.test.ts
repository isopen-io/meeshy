/**
 * Le décroché se porte par LIGNE d'appel (#18242 B1, C1).
 *
 * Les lignes sont des documents MongoDB NUS (`updateManyIn`) : une clé absente
 * est absente du document. Prisma n'écrit pas un champ optionnel qu'on ne lui
 * donne pas, et `{ answeredAt: null }` n'apparie pas une ligne SANS la clé —
 * c'est le RÉSULTAT de l'écriture qui parle, jamais une copie de la clause.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { updateManyIn, type MongoDocument } from '../../../__tests__/helpers/mongo-where';
import { markCallParticipantsAnswered } from '../callParticipantAnswered';

const NOW = new Date('2026-11-14T10:00:05.000Z');
const EARLIER = new Date('2026-11-14T10:00:01.000Z');

const collection = (rows: ReadonlyArray<MongoDocument>) => {
  const { updateMany, touched } = updateManyIn(rows);
  const spy = jest.fn(updateMany);
  return { prisma: { callParticipant: { updateMany: spy } } as never, touched, spy };
};

const ids = (rows: ReadonlyArray<MongoDocument>) => rows.map((row) => row.id);

describe('markCallParticipantsAnswered', () => {
  it('marque une ligne écrite SANS la clé `answeredAt` (toutes les lignes d\'avant le champ, et toute ligne non écrite explicitement)', async () => {
    const { prisma, touched } = collection([{ id: 'row-awa', callSessionId: 'c' }, { id: 'row-moi', callSessionId: 'c' }]);

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa' }, { id: 'row-moi' }], NOW);

    expect(ids(touched)).toEqual(['row-awa', 'row-moi']);
  });

  it('marque une ligne à `answeredAt: null` explicite', async () => {
    const { prisma, touched } = collection([{ id: 'row-awa', answeredAt: null }]);

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa', answeredAt: null }], NOW);

    expect(ids(touched)).toEqual(['row-awa']);
  });

  it('ne redate JAMAIS une ligne déjà marquée, même lue périmée par l\'appelant', async () => {
    const { prisma, touched } = collection([{ id: 'row-awa', answeredAt: EARLIER }, { id: 'row-moi' }]);

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa', answeredAt: null }, { id: 'row-moi' }], NOW);

    expect(ids(touched)).toEqual(['row-moi']);
  });

  it('ne touche aucune autre ligne de la collection', async () => {
    const { prisma, touched } = collection([{ id: 'row-awa' }, { id: 'row-karim' }]);

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa' }], NOW);

    expect(ids(touched)).toEqual(['row-awa']);
  });

  it('n\'écrit rien quand les bouts sont déjà marqués (renégociation en cours d\'appel)', async () => {
    const { prisma, spy } = collection([{ id: 'row-awa', answeredAt: NOW }]);

    await markCallParticipantsAnswered(prisma, [{ id: 'row-awa', answeredAt: NOW }, null, undefined], NOW);

    expect(spy).not.toHaveBeenCalled();
  });

  it('une panne d\'écriture ne fait jamais échouer le relais du signal', async () => {
    const updateMany = jest.fn(async (_args: unknown) => { throw new Error('mongo down'); });

    await expect(markCallParticipantsAnswered({ callParticipant: { updateMany } } as never, [{ id: 'row-awa' }], NOW)).resolves.toBeUndefined();
  });
});
