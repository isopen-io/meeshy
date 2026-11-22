/**
 * **#20338 — LES SIX FAMILLES D'ACTIVITÉ D'UN POST, D'UNE STORY ET D'UN STATUT
 * SE TAISENT CHEZ QUI UN BLOCAGE SÉPARE.**
 *
 * #20236 a fermé les quatre événements d'activité d'un COMMENTAIRE. La question
 * posée à son audit — « quels AUTRES sites d'activité ne filtrent rien ? » — en
 * a rendu six, et `post:liked` est la **jumelle exacte** de `comment:liked` :
 * même forme, même défaut, laissée de côté parce que le lot s'arrêtait au
 * commentaire.
 *
 * Chacune nomme un ACTEUR dans sa charge (`userId`) et partait vers la room du
 * post / de la story / du statut **sans aucune exclusion**.
 * `getVisibilityFilteredRecipients` ne filtre que contre les blocages de
 * l'AUTEUR, et seulement les feed rooms — la room de la cible, elle, n'était
 * filtrée par rien.
 *
 * DEUX sujets, et taire un seul des deux ne tait rien : chaque témoin pose donc
 * le blocage autour de CHACUN séparément — un vecteur qui les bloquerait
 * ensemble passerait au vert sous un correctif qui n'en garde qu'un.
 *
 * Le couple (événement, charge) est relevé tel qu'il part sur le fil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { SocialEventsHandler } from '../SocialEventsHandler';
import { PostReactionHandler } from '../PostReactionHandler';
import { resetSeparationCacheForTests } from '../../separatedRooms';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const ACTEUR = 'acteur-20338';
const AUTEUR = 'auteur-cible-20338';
const SEPARE_DE_L_ACTEUR = 'separe-acteur-20338';
const SEPARE_DE_L_AUTEUR = 'separe-auteur-20338';
const CIBLE_ID = '507f191e810c19729de20338';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };
type Blocages = Readonly<Record<string, readonly string[]>> | 'panne';

function fauxPrisma(blocages: Blocages, extra: Record<string, unknown> = {}) {
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
      findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
      findFirst: jest.fn(async () => null),
    },
    friendRequest: { findMany: jest.fn(async () => []) },
    post: {
      findUnique: jest.fn(async () => ({
        authorId: AUTEUR, type: 'POST', likeCount: 3,
        reactionSummary: { '👍': 3 }, visibility: 'PUBLIC', visibilityUserIds: [],
      })),
    },
    ...extra,
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

/** Les six familles, sous une seule forme : chacune diffuse et nomme son acteur. */
const familles: ReadonlyArray<readonly [string, (p: PrismaClient, io: any) => Promise<void>]> = [
  ['post:liked', async (prisma, io) => {
    const h = new SocialEventsHandler({ io, prisma });
    await h.broadcastPostLiked(
      { postId: CIBLE_ID, userId: ACTEUR, emoji: '👍', likeCount: 3, reactionSummary: { '👍': 3 } } as any,
      AUTEUR, 'PUBLIC', [],
    );
  }],
  ['post:unliked', async (prisma, io) => {
    const h = new SocialEventsHandler({ io, prisma });
    await h.broadcastPostUnliked(
      { postId: CIBLE_ID, userId: ACTEUR, emoji: '👍', likeCount: 2, reactionSummary: {} } as any,
      AUTEUR, 'PUBLIC', [],
    );
  }],
  ['story:reacted', async (prisma, io) => {
    const h = new SocialEventsHandler({ io, prisma });
    await h.broadcastStoryReacted(
      { storyId: CIBLE_ID, userId: ACTEUR, emoji: '👍', likeCount: 3, reactionSummary: { '👍': 3 } } as any, AUTEUR,
    );
  }],
  ['story:unreacted', async (prisma, io) => {
    const h = new SocialEventsHandler({ io, prisma });
    await h.broadcastStoryUnreacted(
      { storyId: CIBLE_ID, userId: ACTEUR, emoji: '👍', likeCount: 2, reactionSummary: {} } as any, AUTEUR,
    );
  }],
  ['status:reacted', async (prisma, io) => {
    const h = new SocialEventsHandler({ io, prisma });
    await h.broadcastStatusReacted(
      { statusId: CIBLE_ID, userId: ACTEUR, emoji: '👍', likeCount: 3, reactionSummary: { '👍': 3 } } as any, AUTEUR,
    );
  }],
  ['status:unreacted', async (prisma, io) => {
    const h = new SocialEventsHandler({ io, prisma });
    await h.broadcastStatusUnreacted(
      { statusId: CIBLE_ID, userId: ACTEUR, emoji: '👍', likeCount: 2, reactionSummary: {} } as any, AUTEUR,
    );
  }],
];

/** La room de la CIBLE — l'adresse que rien ne filtrait. */
const versLaCible = (emissions: Emission[]) => emissions.filter((e) => e.rooms.includes(`post:${CIBLE_ID}`));

describe('#20338 — l’activité d’un post, d’une story ou d’un statut ne s’annonce pas à qui un blocage sépare', () => {
  beforeEach(() => resetSeparationCacheForTests());

  it.each(familles)('%s exclut la room de qui a bloqué l’ACTEUR', async (evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({ [SEPARE_DE_L_ACTEUR]: [ACTEUR] }), fauxIo(emissions));

    const [emission] = versLaCible(emissions);
    expect(emission?.evenement).toBe(evenement);
    expect(emission?.exclues).toContain(`user:${SEPARE_DE_L_ACTEUR}`);
  });

  it.each(familles)('%s exclut la room de qui a bloqué l’AUTEUR de la cible', async (evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({ [SEPARE_DE_L_AUTEUR]: [AUTEUR] }), fauxIo(emissions));

    const [emission] = versLaCible(emissions);
    expect(emission?.evenement).toBe(evenement);
    expect(emission?.exclues).toContain(`user:${SEPARE_DE_L_AUTEUR}`);
  });

  it.each(familles)('%s exclut aussi qui l’ACTEUR ou l’AUTEUR a bloqué — les deux sens', async (_e, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(
      fauxPrisma({ [ACTEUR]: [SEPARE_DE_L_ACTEUR], [AUTEUR]: [SEPARE_DE_L_AUTEUR] }),
      fauxIo(emissions),
    );

    const exclues = [...(versLaCible(emissions)[0]?.exclues ?? [])].sort();
    expect(exclues).toContain(`user:${SEPARE_DE_L_ACTEUR}`);
    expect(exclues).toContain(`user:${SEPARE_DE_L_AUTEUR}`);
  });

  /** Le CONTRÔLE : sans blocage, rien ne change — et la charge ABSOLUE est servie. */
  it.each(familles)('%s n’exclut personne quand aucun blocage ne touche les deux sujets', async (evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({}), fauxIo(emissions));

    const [emission] = versLaCible(emissions);
    expect(emission?.evenement).toBe(evenement);
    expect(emission?.exclues).toEqual([]);
    expect(emission?.charge?.userId).toBe(ACTEUR);
  });

  /** FERMÉ, et sur TOUTES les adresses : un fail-closed partiel n'est pas un fail-closed. */
  it.each(familles)('%s n’émet RIEN, sur AUCUNE adresse, quand la lecture des blocages échoue', async (_e, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma('panne'), fauxIo(emissions));

    expect(emissions).toEqual([]);
  });

  /**
   * **L'ACTEUR reste dans l'audience de son propre geste** — décision porteur du
   * 2026-09-13 (« le like n'est pas synchronisé entre les différentes vues »).
   * Contrairement au cycle 219, ces charges ne portent AUCUN roster
   * (`PostReactionAggregation` est `{ emoji, count }`), donc rien n'y nomme un
   * TIERS et `keep` reste son privilège légitime.
   */
  it.each(familles)('%s n’exclut JAMAIS l’acteur lui-même', async (_e, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({ [SEPARE_DE_L_ACTEUR]: [ACTEUR], [ACTEUR]: [SEPARE_DE_L_ACTEUR] }), fauxIo(emissions));

    expect(versLaCible(emissions)[0]?.exclues).not.toContain(`user:${ACTEUR}`);
  });
});

/**
 * La SEPTIÈME famille vit dans un autre handler : `post:reaction-added` /
 * `-removed`, le seul site d'émission de `PostReactionHandler`
 * (`broadcastReactionChange`). Sa charge nomme aussi un acteur, et elle partait
 * vers `ROOMS.post(postId)` sans exclusion.
 */
describe('#20338 — post:reaction-* tait aussi ce qu’un blocage sépare', () => {
  beforeEach(() => resetSeparationCacheForTests());

  const reagir = async (prisma: PrismaClient, io: any, action: 'add' | 'remove'): Promise<void> => {
    const handler = new PostReactionHandler({
      io,
      prisma,
      notificationService: { createPostReactionNotification: jest.fn(async () => undefined) } as any,
      postReactionService: {} as any,
      connectedUsers: new Map(),
      socketToUser: new Map(),
      socialEvents: new SocialEventsHandler({ io, prisma }),
    } as any);
    const updateEvent = {
      postId: CIBLE_ID, userId: ACTEUR, emoji: '🎉', action,
      aggregation: { emoji: '🎉', count: 1 }, timestamp: new Date().toISOString(),
    };
    await (handler as any).broadcastReactionChange(CIBLE_ID, '🎉', action, ACTEUR, updateEvent);
  };

  it.each([['add'], ['remove']] as const)('post:reaction-%s exclut la room de qui a bloqué l’ACTEUR', async (action) => {
    const emissions: Emission[] = [];
    await reagir(fauxPrisma({ [SEPARE_DE_L_ACTEUR]: [ACTEUR] }), fauxIo(emissions), action);

    const [emission] = versLaCible(emissions);
    expect(emission?.evenement).toBe(action === 'add' ? 'post:reaction-added' : 'post:reaction-removed');
    expect(emission?.exclues).toContain(`user:${SEPARE_DE_L_ACTEUR}`);
  });

  it('post:reaction-added exclut la room de qui a bloqué l’AUTEUR du post', async () => {
    const emissions: Emission[] = [];
    await reagir(fauxPrisma({ [SEPARE_DE_L_AUTEUR]: [AUTEUR] }), fauxIo(emissions), 'add');

    expect(versLaCible(emissions)[0]?.exclues).toContain(`user:${SEPARE_DE_L_AUTEUR}`);
  });

  it('post:reaction-added n’exclut personne sans blocage, et sert sa charge', async () => {
    const emissions: Emission[] = [];
    await reagir(fauxPrisma({}), fauxIo(emissions), 'add');

    const [emission] = versLaCible(emissions);
    expect(emission?.exclues).toEqual([]);
    expect(emission?.charge?.userId).toBe(ACTEUR);
  });

  it('post:reaction-added n’émet RIEN quand la lecture des blocages échoue', async () => {
    const emissions: Emission[] = [];
    await reagir(fauxPrisma('panne'), fauxIo(emissions), 'add');

    expect(emissions).toEqual([]);
  });
});
