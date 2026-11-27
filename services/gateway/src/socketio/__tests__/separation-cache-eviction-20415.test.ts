/**
 * **#20415 (constat 2) — LE CACHE DES SÉPARATIONS ÉVINCE, IL NE SE VIDE PAS.**
 *
 * `separatedRooms` tenait `MAX_ENTRIES = 512` et, à la 512e entrée, appelait
 * `cache.clear()` : les 511 autres partaient avec elle. Ce cache sert les sept
 * diffusions de CONTENU de #20216, dont les clés sont STABLES — un seul appelant
 * à clés volatiles suffisait donc à les éviscérer en boucle. #20337 a retiré
 * celui qu'on connaissait (`cached: false`), mais le mécanisme restait, et le
 * prochain n'aurait eu aucun site où rougir : c'est ce trou-là que ces témoins
 * ferment.
 *
 * ─── CE QU'ILS GARDENT, ET CE QU'ILS NE GARDENT PAS ──────────────────────
 *
 * Ils gardent le COMPORTEMENT de pression : une entrée stable survit à
 * l'arrivée de 512 clés neuves, les périmées sortent avant les vivantes, et le
 * plafond tient. Ils ne gardent RIEN de la confidentialité — évincer est
 * toujours sûr (la prochaine lecture repart de la base), et c'est précisément
 * pourquoi ce lot ne touche ni au TTL, ni à l'invalidation, ni à la fraîcheur :
 * `expiresAt` n'est jamais prolongé par un hit, sans quoi un couple resté chaud
 * rouvrirait #20216 pour la durée de sa chaleur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import {
  createSeparatedRoomsResolver,
  resetSeparationCacheForTests,
  separationCacheStats,
  DEFAULT_TTL_MS,
} from '../separatedRooms';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const STABLE = 'sujet-stable-20415';
const MAX_ENTRIES = 512;

/** Une résolution = DEUX lectures, les deux SENS du blocage (`hasSome`, `id.in`). */
const LECTURES_PAR_RESOLUTION = 2;

/** Personne ne bloque personne : ce lot mesure le REMPLISSAGE, pas la séparation. */
function fauxPrisma() {
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map(() => ({ blockedUserIds: [] }));
      }),
    },
  } as unknown as PrismaClient;
}

function faire(options?: { readonly now?: () => number; readonly ttlMs?: number }) {
  const prisma = fauxPrisma();
  const resolver = createSeparatedRoomsResolver({ prisma, ...options });
  const lectures = () => (prisma.user.findMany as unknown as jest.Mock).mock.calls.length;
  return { resolver, lectures };
}

describe('#20415 — la pression sur le cache des séparations évince, elle ne vide pas', () => {
  beforeEach(() => {
    resetSeparationCacheForTests();
  });

  it('une clé neuve au plafond coûte UNE entrée, pas les 512', async () => {
    const { resolver, lectures } = faire();

    /* Le cache est rempli de clés STABLES — celles des sept diffusions de
       CONTENU que #20216 a fermées, qui reviennent en boucle sur les mêmes
       couples de sujets. */
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      await resolver.roomsAround([`stable-20415-${i}`]);
    }
    const apresRemplissage = lectures();
    expect(separationCacheStats()).toMatchObject({ size: MAX_ENTRIES, evictions: 0 });

    /* Une seule clé volatile de plus, et elle atteint le plafond. */
    await resolver.roomsAround(['volatile-20415']);

    /* **La mesure du lot** : le cache est toujours PLEIN, et il n'a perdu
       qu'UNE entrée. Avant ce lot, `cache.clear()` le ramenait à la seule
       entrée volatile — `size: 1`, `evictions: 0`. */
    expect(separationCacheStats()).toMatchObject({ size: MAX_ENTRIES, evictions: 1 });

    /* La plus récemment écrite est toujours servie depuis le cache… */
    await resolver.roomsAround([`stable-20415-${MAX_ENTRIES - 1}`]);
    expect(lectures()).toBe(apresRemplissage + LECTURES_PAR_RESOLUTION);

    /* …et celle qui est sortie est la plus ANCIENNEMENT écrite, donc celle dont
       il restait le moins de vie (toutes portent le même TTL). */
    await resolver.roomsAround(['stable-20415-0']);
    expect(lectures()).toBe(apresRemplissage + 2 * LECTURES_PAR_RESOLUTION);
  });

  /**
   * **CE QUE L'ÉVICTION NE RÉPARE PAS, dit ici parce qu'un silence se lit comme
   * une garantie.** Aucune politique à capacité 512 ne sert un ensemble de
   * travail de 513 clés relues en boucle : chaque relecture d'une clé sortie en
   * fait sortir la suivante. L'éviction ne promet donc pas un taux de hit, elle
   * promet que la pression coûte UNE entrée par insertion au lieu de 512. Le
   * seul remède à un ensemble de travail trop grand est de ne pas peupler le
   * cache depuis un chemin à clés volatiles (`cached: false`, #20337) — et de
   * MESURER, ce que `evictions` rend possible.
   */
  it('un balayage séquentiel plus large que le cache reste tout en défauts — et c’est assumé', async () => {
    const { resolver, lectures } = faire();

    for (let i = 0; i <= MAX_ENTRIES; i += 1) {
      await resolver.roomsAround([`cyclique-20415-${i}`]);
    }
    const apresPremierTour = lectures();

    for (let i = 0; i <= MAX_ENTRIES; i += 1) {
      await resolver.roomsAround([`cyclique-20415-${i}`]);
    }

    expect(lectures()).toBe(apresPremierTour * 2);
  });

  it('les entrées PÉRIMÉES sortent avant les vivantes', async () => {
    let horloge = 1_000;
    const { resolver, lectures } = faire({ now: () => horloge });

    /* 511 entrées écrites dans une première fenêtre, puis périmées. */
    for (let i = 0; i < MAX_ENTRIES - 1; i += 1) {
      await resolver.roomsAround([`perime-20415-${i}`]);
    }
    horloge += DEFAULT_TTL_MS + 1;

    /* Une entrée VIVANTE, écrite après l'expiration des précédentes… */
    await resolver.roomsAround([STABLE]);
    const apresStable = lectures();

    /* …puis l'insertion qui atteint le plafond : elle balaie les 511 périmées,
       et n'a donc aucune vivante à toucher. */
    await resolver.roomsAround(['declencheur-20415']);
    const apresDeclencheur = lectures();

    /* Aucune éviction d'entrée VIVANTE n'a été nécessaire… */
    expect(separationCacheStats().evictions).toBe(0);

    /* …et l'entrée vivante est toujours servie depuis le cache. */
    await resolver.roomsAround([STABLE]);
    expect(lectures()).toBe(apresDeclencheur);
  });

  it('le plafond TIENT — la taille ne dépasse jamais MAX_ENTRIES', async () => {
    const { resolver } = faire();

    for (let i = 0; i < MAX_ENTRIES * 2; i += 1) {
      await resolver.roomsAround([`volatile-20415-${i}`]);
    }

    const stats = separationCacheStats();
    expect(stats.max).toBe(MAX_ENTRIES);
    expect(stats.size).toBeLessThanOrEqual(MAX_ENTRIES);
    /* Et la pression se MESURE : `evictions` à zéro voudrait dire que le plafond
       n'a jamais été atteint, ce qu'aucune lecture de `size` ne prouve (#20415
       demandait cette mesure autant que l'éviction). */
    expect(stats.evictions).toBeGreaterThan(0);
  });

  it('un hit ne PROLONGE pas l’entrée — la fenêtre d’expiration ne glisse pas', async () => {
    let horloge = 1_000;
    const { resolver, lectures } = faire({ now: () => horloge });

    await resolver.roomsAround([STABLE]);
    const apresPremiere = lectures();

    /* Trois hits à l'intérieur de la fenêtre : aucune lecture de plus. */
    for (let i = 0; i < 3; i += 1) {
      horloge += 1_000;
      await resolver.roomsAround([STABLE]);
    }
    expect(lectures()).toBe(apresPremiere);

    /* Passé le TTL compté depuis l'ÉCRITURE — pas depuis le dernier hit —
       l'entrée est périmée. Un cache qui prolongerait à chaque hit garderait un
       couple chaud indéfiniment, et rouvrirait #20216 pour toute sa chaleur. */
    horloge += DEFAULT_TTL_MS;
    await resolver.roomsAround([STABLE]);
    expect(lectures()).toBe(apresPremiere + LECTURES_PAR_RESOLUTION);
  });
});
