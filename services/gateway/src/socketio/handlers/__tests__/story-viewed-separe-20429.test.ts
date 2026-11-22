/**
 * **#20429 — `story:viewed` SE TAIT CHEZ L'AUTEUR QU'UN BLOCAGE SÉPARE DU
 * VIEWER.**
 *
 * C'est la **HUITIÈME** famille d'activité : #20338 en nommait six, son lot en
 * a trouvé sept, et son audit adversarial celle-ci. Elle est la plus
 * NOMINATIVE des huit — là où les sept autres ne portent qu'un `userId`, sa
 * charge nomme le viewer par son id **ET son pseudo** (`viewerUsername`) — et
 * elle partait vers `ROOMS.feed(storyAuthorId)` sans aucune exclusion.
 *
 * ─── POURQUOI UN SEUL SUJET SUFFIT ICI, ET C'EST UNE MESURE ──────────────
 *
 * Les sept familles de #20338 passent par `activitySeparation(acteur, auteur)`
 * : leur audience contient des TIERS (la room du post, les feed rooms des
 * amis), donc il faut taire aussi les lecteurs séparés de l'AUTEUR.
 *
 * L'audience de `story:viewed` est **UNE SEULE personne** — l'auteur. La seule
 * question est donc « l'auteur est-il séparé du viewer ? », et
 * `roomsAround([viewerId])` y répond exactement : l'auteur y figure si et
 * seulement s'il a bloqué le viewer ou si le viewer l'a bloqué. Les deux
 * formes rendent le MÊME verdict sur cette audience — `roomsAround([viewer,
 * auteur])` n'y ajoute que « l'auteur séparé de lui-même », qui est vide.
 *
 * Ce qui les sépare est le COÛT, et il décide : la vue est un chemin CHAUD
 * (jusqu'à 120 événements par requête, la plupart sur des posts ordinaires
 * dont l'auteur n'est pas connu avant l'écriture). Par couple, c'est deux
 * lectures par AUTEUR DISTINCT du lot ; par sujet unique, c'est **deux
 * lectures pour le lot entier**, sous une clé de cache STABLE (`[viewer]`) que
 * les requêtes suivantes du même lecteur retrouvent. Une lenteur est un bug
 * (dimension 2) : le témoin de coût ci-dessous gèle cette propriété.
 *
 * ─── CE QUE CES TÉMOINS GARDENT ──────────────────────────────────────────
 *
 * Le blocage est posé autour de CHAQUE sujet séparément — un vecteur qui les
 * bloquerait tous les deux passerait au vert sous un correctif qui n'en garde
 * qu'un. Et le couple (événement, charge) est relevé tel qu'il part sur le
 * fil : une adresse juste ne dit rien de ce qui y arrive.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { SocialEventsHandler } from '../SocialEventsHandler';
import { resetSeparationCacheForTests } from '../../separatedRooms';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const VIEWER = 'viewer-20429';
const VIEWER_PSEUDO = 'alice-20429';
const AUTEUR = 'auteur-story-20429';
const AUTRE_AUTEUR = 'autre-auteur-20429';
const STORY_ID = '507f191e810c19729de20429';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };
type Blocages = Readonly<Record<string, readonly string[]>> | 'panne';

function fauxPrisma(blocages: Blocages) {
  const carte = () => (blocages === 'panne' ? {} : blocages);
  const bloqueursDe = (sujets: readonly string[]) =>
    Object.entries(carte())
      .filter(([, cibles]) => cibles.some((c) => sujets.includes(c)))
      .map(([b]) => ({ id: b }));
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        if (args?.where?.blockedUserIds?.hasSome) return bloqueursDe(args.where.blockedUserIds.hasSome);
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({ blockedUserIds: [...(carte()[id] ?? [])] }));
      }),
    },
    friendRequest: { findMany: jest.fn(async () => []) },
  } as unknown as PrismaClient;
}

function fauxIo(emissions: Emission[]) {
  const operateur = (rooms: string[], exclues: string[]): any => ({
    to: (r: string | string[]) => operateur([...rooms, ...[r].flat()], exclues),
    except: (r: string | string[]) => operateur(rooms, [...exclues, ...[r].flat()]),
    emit: (evenement: string, data: unknown) => {
      emissions.push({ evenement, rooms, exclues, charge: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  });
  return { to: (r: string | string[]) => operateur([r].flat(), []) };
}

const charge = () => ({
  storyId: STORY_ID,
  viewerId: VIEWER,
  viewerUsername: VIEWER_PSEUDO,
  viewCount: 7,
});

/** Résout la séparation PUIS diffuse — l'ordre que la production tient. */
async function diffuser(blocages: Blocages, auteur: string = AUTEUR) {
  const emissions: Emission[] = [];
  const prisma = fauxPrisma(blocages);
  const handler = new SocialEventsHandler({ io: fauxIo(emissions) as any, prisma });
  const separated = await handler.separationAroundActor(VIEWER);
  handler.broadcastStoryViewed(charge() as any, auteur, separated);
  return { emissions, prisma, separated };
}

/** Ce que l'auteur reçoit RÉELLEMENT : sa feed room, moins les rooms exclues. */
const recuParLAuteur = (emissions: Emission[], auteur: string = AUTEUR) =>
  emissions.filter((e) => e.rooms.includes(`feed:${auteur}`) && !e.exclues.includes(`user:${auteur}`));

beforeEach(() => {
  resetSeparationCacheForTests();
  jest.clearAllMocks();
});

describe('#20429 — story:viewed et la séparation autour du viewer', () => {
  it('SANS blocage, l’auteur reçoit bien le couple (story:viewed, charge complète)', async () => {
    const { emissions } = await diffuser({});

    const recues = recuParLAuteur(emissions);
    expect(recues).toHaveLength(1);
    expect(recues[0].evenement).toBe('story:viewed');
    expect(recues[0].charge).toEqual({
      storyId: STORY_ID,
      viewerId: VIEWER,
      viewerUsername: VIEWER_PSEUDO,
      viewCount: 7,
    });
  });

  it('quand l’AUTEUR a bloqué le viewer, l’auteur ne reçoit RIEN', async () => {
    const { emissions } = await diffuser({ [AUTEUR]: [VIEWER] });
    expect(recuParLAuteur(emissions)).toHaveLength(0);
  });

  it('quand le VIEWER a bloqué l’auteur, l’auteur ne reçoit RIEN', async () => {
    const { emissions } = await diffuser({ [VIEWER]: [AUTEUR] });
    expect(recuParLAuteur(emissions)).toHaveLength(0);
  });

  it('une lecture de blocages IMPOSSIBLE tait la diffusion — fermé, jamais ouvert', async () => {
    const { emissions, separated } = await diffuser('panne');
    expect(separated).toBeNull();
    expect(emissions).toHaveLength(0);
  });

  it('ni l’id NI LE PSEUDO du viewer ne partent quand un blocage sépare', async () => {
    for (const blocages of [{ [AUTEUR]: [VIEWER] }, { [VIEWER]: [AUTEUR] }, 'panne' as const]) {
      const { emissions } = await diffuser(blocages);
      const surLeFil = JSON.stringify(emissions);
      expect(surLeFil).not.toContain(VIEWER);
      expect(surLeFil).not.toContain(VIEWER_PSEUDO);
    }
  });

  it('un blocage qui ne concerne PAS le viewer ne tait pas l’auteur', async () => {
    const { emissions } = await diffuser({ [AUTRE_AUTEUR]: [AUTEUR] });
    expect(recuParLAuteur(emissions)).toHaveLength(1);
  });

  it('TÉMOIN DE COÛT — une résolution sert TOUT le lot : deux lectures, un seul sujet', async () => {
    const emissions: Emission[] = [];
    const prisma = fauxPrisma({ [AUTEUR]: [VIEWER] });
    const handler = new SocialEventsHandler({ io: fauxIo(emissions) as any, prisma });

    const separated = await handler.separationAroundActor(VIEWER);
    for (const auteur of [AUTEUR, AUTRE_AUTEUR, 'troisieme-auteur-20429']) {
      handler.broadcastStoryViewed({ ...charge(), storyId: `${STORY_ID}` } as any, auteur, separated);
    }

    const lectures = (prisma.user.findMany as unknown as jest.Mock).mock.calls;
    expect(lectures).toHaveLength(2);
    for (const [args] of lectures as any[]) {
      const sujets: string[] = args?.where?.blockedUserIds?.hasSome ?? args?.where?.id?.in ?? [];
      expect(sujets).toEqual([VIEWER]);
    }

    expect(recuParLAuteur(emissions, AUTEUR)).toHaveLength(0);
    expect(recuParLAuteur(emissions, AUTRE_AUTEUR)).toHaveLength(1);
  });
});
