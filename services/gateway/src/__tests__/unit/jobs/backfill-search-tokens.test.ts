/**
 * Le rattrapage des jetons de recherche (#4159).
 *
 * Une route de recherche adossée à un index VIDE ne trouve personne : le
 * rattrapage doit précéder l'usage, et il ne doit pas dépendre de quelqu'un qui
 * se souvient de le lancer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { backfillSearchTokens } from '../../../jobs/backfill-search-tokens';

function prismaAvec(lots: Array<Array<Record<string, unknown>>>) {
  let tour = 0;
  const ecritures: Array<{ id: string; searchTokens: string[] }> = [];
  const prisma = {
    user: {
      findMany: jest.fn<any>(async () => lots[tour++] ?? []),
      update: jest.fn<any>(async ({ where, data }: any) => {
        ecritures.push({ id: where.id, searchTokens: data.searchTokens });
        return {};
      }),
    },
  };
  return { prisma: prisma as never, ecritures, findMany: prisma.user.findMany };
}

const compte = (id: string, prenom: string) => ({
  id,
  username: `${prenom.toLowerCase()}_u`,
  displayName: prenom,
  firstName: prenom,
  lastName: 'Dupont',
});

describe('backfillSearchTokens', () => {
  it('indexe les comptes dont les jetons manquent', async () => {
    const { prisma, ecritures } = prismaAvec([[compte('u-1', 'Jean')]]);

    const traites = await backfillSearchTokens(prisma);

    expect(traites).toBe(1);
    expect(ecritures[0].id).toBe('u-1');
    expect(ecritures[0].searchTokens).toContain('jean');
    expect(ecritures[0].searchTokens).toContain('dupont');
  });

  it('cherche AUSSI les lignes où le champ est ABSENT, pas seulement vide', async () => {
    const { prisma, findMany } = prismaAvec([[]]);

    await backfillSearchTokens(prisma);

    const where = findMany.mock.calls[0][0].where as Record<string, any>;
    // Sur le connecteur MongoDB, un filtre scalaire ne matche pas les documents
    // où le champ est absent — et c'est le cas de TOUTES les lignes créées
    // avant la colonne, donc de toutes celles qu'il faut rattraper (leçon 307).
    expect(JSON.stringify(where.OR)).toContain('isSet');
    expect(JSON.stringify(where.OR)).toContain('isEmpty');
  });

  it('s’ARRÊTE sur un lot incomplet — sinon un compte sans nom boucle sans fin', async () => {
    // Un compte dont les quatre champs de nom sont vides rend un tableau vide,
    // et serait donc resélectionné au tour suivant. Le lot incomplet est la
    // seule condition d'arrêt sûre.
    const sansNom = { id: 'u-vide', username: '', displayName: null, firstName: null, lastName: null };
    const { prisma, findMany } = prismaAvec([[sansNom], [sansNom], [sansNom]]);

    const traites = await backfillSearchTokens(prisma);

    expect(traites).toBe(1);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('ne fait RIEN quand tout est déjà indexé', async () => {
    const { prisma, ecritures } = prismaAvec([[]]);

    expect(await backfillSearchTokens(prisma)).toBe(0);
    expect(ecritures).toEqual([]);
  });
});
