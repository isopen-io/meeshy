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
      findRaw: jest.fn<any>(async () => lots[tour++] ?? []),
      update: jest.fn<any>(async ({ where, data }: any) => {
        ecritures.push({ id: where.id, searchTokens: data.searchTokens });
        return {};
      }),
    },
  };
  return { prisma: prisma as never, ecritures, findRaw: prisma.user.findRaw };
}

/** `findRaw` rend le document MONGO : la clé est `_id`, portant un `{ $oid }`. */
const compte = (id: string, prenom: string) => ({
  _id: { $oid: id },
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
    const { prisma, findRaw } = prismaAvec([[]]);

    await backfillSearchTokens(prisma);

    const filtre = JSON.stringify(findRaw.mock.calls[0][0].filter);
    // En MongoDB, `$size: 0` ne matche PAS un document où le champ manque — et
    // c'est le cas de toutes les lignes créées avant la colonne, donc de toutes
    // celles qu'il faut rattraper (leçon 307). Les deux clauses sont
    // nécessaires, et c'est leur CONJONCTION que ce témoin garde.
    expect(filtre).toContain('$exists');
    expect(filtre).toContain('$size');
  });

  it('lit `_id` et non `id` — `findRaw` rend le document Mongo', async () => {
    const { prisma, ecritures } = prismaAvec([[compte('507f1f77bcf86cd799439011', 'Jean')]]);

    await backfillSearchTokens(prisma);

    // Confondre les deux formes ferait écrire sur `undefined` : la boucle
    // tournerait, ne mettrait rien à jour, et resélectionnerait les mêmes
    // lignes au tour suivant.
    expect(ecritures[0].id).toBe('507f1f77bcf86cd799439011');
  });

  it('s’ARRÊTE sur un lot incomplet — sinon un compte sans nom boucle sans fin', async () => {
    // Un compte dont les quatre champs de nom sont vides rend un tableau vide,
    // et serait donc resélectionné au tour suivant. Le lot incomplet est la
    // seule condition d'arrêt sûre.
    const sansNom = { _id: { $oid: 'u-vide' }, username: '', displayName: null, firstName: null, lastName: null };
    const { prisma, findRaw } = prismaAvec([[sansNom], [sansNom], [sansNom]]);

    const traites = await backfillSearchTokens(prisma);

    expect(traites).toBe(1);
    expect(findRaw).toHaveBeenCalledTimes(1);
  });

  it('ne fait RIEN quand tout est déjà indexé', async () => {
    const { prisma, ecritures } = prismaAvec([[]]);

    expect(await backfillSearchTokens(prisma)).toBe(0);
    expect(ecritures).toEqual([]);
  });
});
