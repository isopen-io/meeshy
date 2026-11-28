/**
 * **#20711 — LA MÊME LECTURE, RENDUE PAR LECTEUR (`pairsAround`).**
 *
 * `roomsAround` répond « qui taire » ; `pairsAround` répond « de QUOI chacun
 * est séparé ». La seconde existe parce qu'une charge peut porter le contenu
 * d'un tiers (la source republiée d'un post, l'aperçu de ses commentaires)
 * sans que le lecteur perde le reste : l'exclure serait trop, lui servir la
 * charge entière serait la fuite.
 *
 * **Ce fichier est le témoin de la PRÉCISION**, et c'est ce qui le rend
 * nécessaire. La lecture retombe, par décision, sur « tous les sujets » quand
 * la projection de `blockedUserIds` manque — fail-closed, puisque le `where`
 * prouve déjà la relation. Ce repli est exactement ce qui laisse les doubles
 * partiels des suites voisines verts, donc **aucune d'elles ne peut voir si la
 * précision existe**. Mesuré en livrant le lot : les trois doubles de #20216,
 * #20236 et #20430 ne projettent que `{ id }`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { createSeparatedRoomsResolver, resetSeparationCacheForTests } from '../separatedRooms';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

type Carte = Readonly<Record<string, readonly string[]>>;

/** Un double FIDÈLE : il rend les colonnes que le `select` de production demande. */
function prismaFidele(carte: Carte, options?: { readonly sansColonne?: boolean; readonly panne?: boolean }) {
  const findMany = jest.fn(async (args: any) => {
    if (options?.panne) throw new Error('mongo indisponible');
    if (args?.where?.blockedUserIds?.hasSome) {
      const sujets: string[] = args.where.blockedUserIds.hasSome;
      return Object.entries(carte)
        .filter(([, cibles]) => cibles.some((c) => sujets.includes(c)))
        .map(([id, cibles]) => (options?.sansColonne ? { id } : { id, blockedUserIds: [...cibles] }));
    }
    const ids: string[] = args?.where?.id?.in ?? [];
    return ids.map((id) => ({ id, blockedUserIds: [...(carte[id] ?? [])] }));
  });
  return { prisma: { user: { findMany } } as unknown as PrismaClient, findMany };
}

const resolveur = (carte: Carte, options?: Parameters<typeof prismaFidele>[1]) =>
  createSeparatedRoomsResolver({ prisma: prismaFidele(carte, options).prisma });

beforeEach(() => {
  resetSeparationCacheForTests();
  jest.clearAllMocks();
});

describe('#20711 — `pairsAround`', () => {
  it('sens « le lecteur a bloqué le sujet » : la carte nomme le SUJET, pas seulement le lecteur', async () => {
    const pairs = await resolveur({ A: ['B'] }).pairsAround(['B', 'D']);
    expect(pairs).not.toBeNull();
    expect([...pairs!.keys()]).toEqual(['A']);
    expect(pairs!.get('A')).toEqual(['B']);
  });

  it('sens « le sujet a bloqué le lecteur » : même carte, autre direction', async () => {
    const pairs = await resolveur({ B: ['A'] }).pairsAround(['B', 'D']);
    expect(pairs!.get('A')).toEqual(['B']);
  });

  it('un lecteur séparé d’UN sujet sur deux ne l’est pas de l’autre — c’est toute la raison d’être', async () => {
    const pairs = await resolveur({ A: ['B'] }).pairsAround(['B', 'D']);
    expect(pairs!.get('A')).not.toContain('D');
  });

  it('séparé des DEUX, les deux sont nommés', async () => {
    const pairs = await resolveur({ A: ['B'], D: ['A'] }).pairsAround(['B', 'D']);
    expect([...(pairs!.get('A') ?? [])].sort()).toEqual(['B', 'D']);
  });

  it('la liste de blocages du lecteur est INTERSECTÉE : un tiers hors sujets n’entre pas', async () => {
    const pairs = await resolveur({ A: ['B', 'hors-sujet'] }).pairsAround(['B']);
    expect(pairs!.get('A')).toEqual(['B']);
  });

  it('aucun sujet ⇒ carte vide SANS lecture — le cas nominal ne paie rien', async () => {
    const { prisma, findMany } = prismaFidele({ A: ['B'] });
    const pairs = await createSeparatedRoomsResolver({ prisma }).pairsAround([]);
    expect(pairs).toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('DEUX lectures, quel que soit le nombre de sujets', async () => {
    const { prisma, findMany } = prismaFidele({ A: ['B'] });
    await createSeparatedRoomsResolver({ prisma }).pairsAround(['B', 'C', 'D', 'E', 'F']);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('une lecture impossible rend `null` — jamais une carte vide, qui voudrait dire « personne »', async () => {
    const pairs = await resolveur({ A: ['B'] }, { panne: true }).pairsAround(['B']);
    expect(pairs).toBeNull();
  });

  describe('le repli quand la colonne manque', () => {
    it('FERMÉ : sans `blockedUserIds`, le lecteur est séparé de TOUS les sujets interrogés', async () => {
      const pairs = await resolveur({ A: ['B'] }, { sansColonne: true }).pairsAround(['B', 'D']);
      expect([...(pairs!.get('A') ?? [])].sort()).toEqual(['B', 'D']);
    });

    it('… et `roomsAround` rend la MÊME réponse qu’avec la colonne', async () => {
      const avec = await resolveur({ A: ['B'] }).roomsAround(['B', 'D']);
      const sans = await resolveur({ A: ['B'] }, { sansColonne: true }).roomsAround(['B', 'D']);
      expect(sans).toEqual(avec);
      expect(avec).toEqual(['user:A']);
    });
  });

  describe('le cache est partagé par les DEUX questions', () => {
    it('`pairsAround` puis `roomsAround` sur les mêmes sujets : deux lectures en tout', async () => {
      const { prisma, findMany } = prismaFidele({ A: ['B'] });
      const resolver = createSeparatedRoomsResolver({ prisma });
      await resolver.pairsAround(['B']);
      const rooms = await resolver.roomsAround(['B']);
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(rooms).toEqual(['user:A']);
    });

    it('`cached: false` ne sert ni n’écrit le cache', async () => {
      const { prisma, findMany } = prismaFidele({ A: ['B'] });
      const resolver = createSeparatedRoomsResolver({ prisma });
      await resolver.pairsAround(['B'], { cached: false });
      await resolver.pairsAround(['B'], { cached: false });
      expect(findMany).toHaveBeenCalledTimes(4);
    });
  });

  it('`roomsAround` garde son `keep` : l’acteur ne s’exclut pas de son propre événement', async () => {
    const rooms = await resolveur({ A: ['B'], B: ['C'] }).roomsAround(['B'], { keep: 'A' });
    expect(rooms).not.toContain('user:A');
    expect(rooms).toContain('user:C');
  });
});

/**
 * **LE PLAFOND DU CACHE NE DOIT PAS ÉVINCER CE QUE #20216 GARDE** (audit
 * adversarial de #20711, constat F3).
 *
 * Le cache est PARTAGÉ par tout le processus, et sa fraîcheur ne tient pas au
 * TTL mais à l'invalidation : une entrée évincée est reconstruite, donc juste —
 * mais le `cache.clear()` du plafond évince les entrées des appelants STABLES,
 * et ce sont elles qui portent les sept diffusions de CONTENU. Un appelant dont
 * les clés sont à usage unique doit donc passer `cached: false`.
 *
 * Ce témoin exerce la propriété de SURVIE, pas le nombre de lectures : il
 * tombe si `companionSeparation` revient au cache par défaut.
 */
describe('#20711 — un appelant à clés jetables n’évince pas les appelants stables', () => {
  it('N clés de compagnons laissent intacte l’entrée stable de `roomsAround`', async () => {
    const { prisma, findMany } = prismaFidele({ stable: ['bloque-stable'] });
    const resolver = createSeparatedRoomsResolver({ prisma });
    await resolver.roomsAround(['stable']);
    const apresAmorce = findMany.mock.calls.length;
    for (let i = 0; i < 600; i += 1) await resolver.pairsAround([`compagnon-${i}`], { cached: false });
    await resolver.roomsAround(['stable']);
    expect(findMany.mock.calls.length).toBe(apresAmorce + 1200);
  });

  it('… alors qu’avec le cache, le plafond l’évince — la raison du `cached: false`', async () => {
    const { prisma, findMany } = prismaFidele({ stable: ['bloque-stable'] });
    const resolver = createSeparatedRoomsResolver({ prisma });
    await resolver.roomsAround(['stable']);
    const apresAmorce = findMany.mock.calls.length;
    for (let i = 0; i < 600; i += 1) await resolver.pairsAround([`compagnon-${i}`]);
    await resolver.roomsAround(['stable']);
    expect(findMany.mock.calls.length).toBe(apresAmorce + 1202);
  });
});
