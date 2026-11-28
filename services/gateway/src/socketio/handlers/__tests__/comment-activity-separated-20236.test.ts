/**
 * **#20236 — LES QUATRE ÉVÉNEMENTS D'ACTIVITÉ D'UN COMMENTAIRE SE TAISENT CHEZ
 * QUI UN BLOCAGE SÉPARE DE L'ACTEUR OU DE L'AUTEUR.**
 *
 * #20216 a fermé ce qui porte le CONTENU d'un commentaire. `comment:liked`,
 * `comment:unliked`, `comment:reaction-added` et `comment:reaction-removed`
 * n'en portent pas — et annoncent pourtant une ACTIVITÉ : « le commentaire
 * d'untel reçoit des cœurs », « untel vient de réagir ». Ils partaient vers
 * `ROOMS.post(postId)` sans aucune exclusion.
 *
 * **DEUX sujets, et taire un seul des deux ne tait rien** : l'ACTEUR, nommé
 * dans la charge (`userId`), et l'AUTEUR du commentaire, dont le compteur
 * bouge. Chaque témoin pose donc un blocage autour de CHACUN séparément — un
 * vecteur qui les bloquerait tous les deux ensemble passerait au vert sous un
 * correctif qui n'en garde qu'un.
 *
 * Le couple (événement, charge) est relevé tel qu'il part sur le fil : une
 * ADRESSE juste ne dit rien de ce qui y arrive.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { SocialEventsHandler } from '../SocialEventsHandler';
import { CommentReactionHandler } from '../CommentReactionHandler';
import { invalidateSeparationAround, resetSeparationCacheForTests } from '../../separatedRooms';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
}));

jest.mock('../../../services/posts/postVisibility', () => ({
  canUserInteractWithThread: jest.fn(async () => true),
  canUserConsumeThread: jest.fn(async () => true),
  loadCommentPostAcl: jest.fn(async () => ({
    postId: '507f191e810c19729de20236',
    authorId: 'auteur-commentaire-20236',
    post: { authorId: 'auteur-post-20236', visibility: 'PUBLIC', visibilityUserIds: [] },
  })),
}));

jest.mock('../../../services/posts/separatedCommentAuthors', () => ({
  commentAuthorSeparatedFrom: jest.fn(async () => false),
}));

const ACTEUR = 'acteur-20236';
const AUTEUR_COMMENTAIRE = 'auteur-commentaire-20236';
const SEPARE_DE_L_ACTEUR = 'separe-acteur-20236';
const SEPARE_DE_L_AUTEUR = 'separe-auteur-20236';
const POST_ID = '507f191e810c19729de20236';
const COMMENT_ID = '507f191e810c19729de20237';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };

/**
 * Qui bloque qui, posé PAR SUJET — c'est ce qui rend le témoin capable de
 * distinguer « le correctif garde l'acteur » de « le correctif garde les deux ».
 * `'panne'` fait lever les deux lectures.
 */
type Blocages = Readonly<Record<string, readonly string[]>> | 'panne';

function fauxPrisma(blocages: Blocages, lectures: string[][]) {
  const bloqueursDe = (sujets: readonly string[]) =>
    Object.entries(blocages === 'panne' ? {} : blocages)
      .filter(([, cibles]) => cibles.some((cible) => sujets.includes(cible)))
      .map(([bloqueur]) => ({ id: bloqueur }));
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        /* « qui a bloqué l'un de ces sujets ? » */
        if (args?.where?.blockedUserIds?.hasSome) {
          lectures.push([...args.where.blockedUserIds.hasSome]);
          return bloqueursDe(args.where.blockedUserIds.hasSome);
        }
        /* « qui ces sujets ont-ils bloqué ? » */
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({ blockedUserIds: [...(blocages[id] ?? [])] }));
      }),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
    },
    friendRequest: { findMany: jest.fn(async () => []) },
    userRelation: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    postComment: { findUnique: jest.fn(async () => ({ authorId: AUTEUR_COMMENTAIRE, content: 'bonjour' })) },
    post: { findUnique: jest.fn(async () => ({ type: 'POST', author: { displayName: 'A', username: 'a' } })) },
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

/** Les deux diffusions REST (SocialEventsHandler) et les deux socket (CommentReactionHandler), sous une seule forme. */
/**
 * `like` et `unlike` passent par le MÊME chemin que la production : la
 * séparation se résout AVANT la mutation (ici : avant l'émission).
 *
 * **Ce harnais n'atteste AUCUN ordre, et il faut le dire ici parce qu'il a
 * affirmé le contraire** (« c'est ce qui rend à ces deux événements l'ordre que
 * leur charge absolue exige ») : une émission synchrone après un `await` ne
 * garantit pas que deux gestes concurrents arrivent dans l'ordre de leurs
 * écritures. Lire avant RESSERRE la fenêtre, elle ne se ferme pas, et c'est une
 * relecture autoritative qui rattrape l'écart (décision du 2026-11-27, #20414). Ce
 * que ces témoins gardent est l'AUDIENCE — à qui l'activité se tait.
 */
const like = async (prisma: PrismaClient, io: any, sens: 'liked' | 'unliked'): Promise<void> => {
  const handler = new SocialEventsHandler({ io, prisma });
  const separated = await handler.commentActivitySeparation(ACTEUR, AUTEUR_COMMENTAIRE);
  const charge = { postId: POST_ID, commentId: COMMENT_ID, userId: ACTEUR, emoji: '❤️', likeCount: 3 } as any;
  if (sens === 'liked') handler.broadcastCommentLiked(charge, AUTEUR_COMMENTAIRE, separated);
  else handler.broadcastCommentUnliked(charge, AUTEUR_COMMENTAIRE, separated);
};

const activites: ReadonlyArray<readonly [string, (p: PrismaClient, io: any) => Promise<void>]> = [
  ['comment:liked', (prisma, io) => like(prisma, io, 'liked')],
  ['comment:unliked', (prisma, io) => like(prisma, io, 'unliked')],
  ['comment:reaction-added', (prisma, io) => reaction(prisma, io, 'add')],
  ['comment:reaction-removed', (prisma, io) => reaction(prisma, io, 'remove')],
];

async function reaction(prisma: PrismaClient, io: any, action: 'add' | 'remove'): Promise<void> {
  const evenement = { commentId: COMMENT_ID, postId: POST_ID, userId: ACTEUR, emoji: '👍', action };
  const commentReactionService = {
    addReaction: jest.fn(async () => ({ id: 'r-1', emoji: '👍' })),
    removeReaction: jest.fn(async () => true),
    getCommentReactions: jest.fn(async () => []),
    createUpdateEvent: jest.fn(async () => evenement),
  };
  const handler = new CommentReactionHandler({
    io,
    prisma,
    notificationService: { createCommentReactionNotification: jest.fn(async () => undefined) } as any,
    commentReactionService: commentReactionService as any,
    connectedUsers: new Map([[ACTEUR, { id: ACTEUR, socketId: 's-1', isAnonymous: false, language: 'fr' } as any]]),
    socketToUser: new Map([['s-1', ACTEUR]]),
  });
  const socket = { id: 's-1', emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) } as any;
  const charge = { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' };
  if (action === 'add') await handler.handleAddReaction(socket, charge as any, undefined as any);
  else await handler.handleRemoveReaction(socket, charge as any, undefined as any);
}

/** La seule émission qui vise la room du POST — l'autre adresse de `comment:liked` est la room de l'auteur. */
const versLePost = (emissions: Emission[]) => emissions.filter((e) => e.rooms.includes(`post:${POST_ID}`));

/**
 * **CE QUE #20337 A CHANGÉ, ET POURQUOI CES TÉMOINS LE METTENT DE CÔTÉ.**
 *
 * #20236 exemptait l'ACTEUR de sa propre exclusion par `keep` : « un sujet ne
 * s'exclut pas de son PROPRE événement ». L'INTENTION est intacte — l'acteur
 * reçoit toujours son événement — mais sur les deux familles de RÉACTION le
 * MÉCANISME a changé : depuis #20337 la charge de room porte le roster
 * nominatif de tous les réacteurs, qu'on ne peut pas filtrer par lecteur ;
 * l'acteur sort donc de la room et reçoit sa charge SERVIE sur sa room
 * personnelle, filtrée pour lui, donc sur tous ses appareils.
 *
 * Ces témoins gardent la propriété de #20236 — « qui a bloqué l'acteur ou
 * l'auteur est TU » — et mettent de côté la room de l'acteur, dont la question
 * est gardée chez elle (`comment-reaction-roster-20337.test.ts`, § « l'acteur
 * ne lit pas, dans son propre événement, l'id d'un compte qu'il a bloqué »),
 * où un témoin assert qu'il REÇOIT et pas seulement qu'il n'est pas exclu.
 */
const tiersExclus = (emission: Emission | undefined) =>
  [...(emission?.exclues ?? [])].filter((room) => room !== `user:${ACTEUR}`).sort();

describe('#20236 — l’activité d’un commentaire ne s’annonce pas à qui un blocage sépare', () => {
  /* Le cache est PARTAGÉ par le processus (une seule chose à invalider quand un
     blocage bouge) : chaque témoin repart donc d'une ardoise vide, sans quoi il
     lirait la réponse du précédent. */
  beforeEach(() => resetSeparationCacheForTests());

  it.each(activites)('%s exclut la room de qui a bloqué l’ACTEUR', async (evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({ [SEPARE_DE_L_ACTEUR]: [ACTEUR] }, []), fauxIo(emissions));

    const [emission] = versLePost(emissions);
    expect(emission?.evenement).toBe(evenement);
    expect(tiersExclus(emission)).toEqual([`user:${SEPARE_DE_L_ACTEUR}`]);
  });

  it.each(activites)('%s exclut la room de qui a bloqué l’AUTEUR du commentaire', async (evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({ [SEPARE_DE_L_AUTEUR]: [AUTEUR_COMMENTAIRE] }, []), fauxIo(emissions));

    const [emission] = versLePost(emissions);
    expect(emission?.evenement).toBe(evenement);
    expect(tiersExclus(emission)).toEqual([`user:${SEPARE_DE_L_AUTEUR}`]);
  });

  it.each(activites)('%s exclut aussi qui l’ACTEUR ou l’AUTEUR a bloqué — les deux sens', async (_evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(
      fauxPrisma({ [ACTEUR]: [SEPARE_DE_L_ACTEUR], [AUTEUR_COMMENTAIRE]: [SEPARE_DE_L_AUTEUR] }, []),
      fauxIo(emissions),
    );

    const [emission] = versLePost(emissions);
    expect(tiersExclus(emission)).toEqual([`user:${SEPARE_DE_L_ACTEUR}`, `user:${SEPARE_DE_L_AUTEUR}`]);
  });

  it.each(activites)('%s n’exclut personne quand aucun blocage ne touche les deux sujets', async (evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma({}, []), fauxIo(emissions));

    const [emission] = versLePost(emissions);
    expect(emission?.evenement).toBe(evenement);
    expect(tiersExclus(emission)).toEqual([]);
  });

  /**
   * **UN FAIL-CLOSED PARTIEL N'EST PAS UN FAIL-CLOSED** (audit adversarial du
   * lot). L'assertion porte sur TOUTES les émissions, pas sur la seule room du
   * post : `comment:liked` a DEUX adresses, et la feed room de l'auteur partait
   * avant que la lecture des blocages ait répondu — donc même quand elle
   * échouait. Un témoin qui ne regarde que la room du post reste vert sur ce
   * défaut-là (mesuré : la mutation passait).
   */
  it.each(activites)('%s n’émet RIEN, sur AUCUNE adresse, quand la lecture des blocages échoue (fermé)', async (_evenement, diffuser) => {
    const emissions: Emission[] = [];
    await diffuser(fauxPrisma('panne', []), fauxIo(emissions));

    expect(emissions).toEqual([]);
  });

  it('comment:liked sert sa charge ABSOLUE à qui reste dans l’audience, et l’auteur garde son adresse personnelle', async () => {
    const emissions: Emission[] = [];
    await like(fauxPrisma({ [SEPARE_DE_L_ACTEUR]: [ACTEUR] }, []), fauxIo(emissions), 'liked');

    expect(versLePost(emissions)[0].charge).toEqual({ postId: POST_ID, commentId: COMMENT_ID, userId: ACTEUR, emoji: '❤️', likeCount: 3 });
    /* `emitToUser` adresse la FEED room de l'auteur, jamais sa room `user:` — l'exclusion, elle, porte sur `user:` (comme #20216). */
    expect(emissions.some((e) => e.rooms.includes(`feed:${AUTEUR_COMMENTAIRE}`) && e.evenement === 'comment:liked')).toBe(true);
  });

  /**
   * **L'AUTEUR N'EST PAS EXEMPTÉ, ET C'EST UN CHEMIN VIVANT** (audit
   * adversarial du lot). Exempter « tout sujet » de sa propre exclusion
   * paraissait défensif, au motif que la porte de l'action aurait déjà refusé
   * un acteur séparé de l'auteur. **Mesuré FAUX** : retirer sa réaction reste
   * permis après un blocage (décision écrite de #20216), donc `DELETE …/like`
   * et `comment:reaction-remove` n'ont PAS cette porte. A, que B a bloqué, y
   * retire sa réaction au commentaire de B — et B se voyait annoncer l'activité
   * de A, sur sa feed room ET dans la room du post.
   *
   * Le témoin ne peut tomber que sur ce vecteur-là : partout ailleurs le
   * bloqueur est un TIERS, et exempter l'auteur ne change alors rien.
   */
  it('quand l’AUTEUR a bloqué l’ACTEUR, le retrait ne lui annonce rien — ni sa feed room, ni la room du post', async () => {
    const emissions: Emission[] = [];
    await like(fauxPrisma({ [AUTEUR_COMMENTAIRE]: [ACTEUR] }, []), fauxIo(emissions), 'unliked');

    expect(emissions.some((e) => e.rooms.includes(`feed:${AUTEUR_COMMENTAIRE}`))).toBe(false);
    expect(tiersExclus(versLePost(emissions)[0])).toEqual([`user:${AUTEUR_COMMENTAIRE}`]);
  });

  it('le même vecteur sur la réaction retirée : la room du post tait l’auteur qui a bloqué l’acteur', async () => {
    const emissions: Emission[] = [];
    await reaction(fauxPrisma({ [AUTEUR_COMMENTAIRE]: [ACTEUR] }, []), fauxIo(emissions), 'remove');

    expect(tiersExclus(versLePost(emissions)[0])).toEqual([`user:${AUTEUR_COMMENTAIRE}`]);
  });

  /**
   * **LA FRAÎCHEUR TIENT À L'INVALIDATION, PAS AU TTL** (audit adversarial).
   * Le cache sert aussi les sept diffusions de CONTENU (`commentEmitter`) : une
   * fenêtre d'expiration y rouvrirait #20216 pendant toute sa durée — le TEXTE
   * et les MÉDIAS d'un commentaire livrés à qui vient de bloquer. Les deux
   * écrivains de `blockedUserIds` rappellent donc `invalidateSeparationAround`.
   *
   * Le témoin ne peut tomber que si le cache est VIVANT entre les deux
   * diffusions : il réutilise le MÊME handler, comme la production, qui n'en
   * construit qu'un (`MeeshySocketIOManager`).
   */
  it('un blocage posé entre deux diffusions de CONTENU est vu par la seconde', async () => {
    const emissions: Emission[] = [];
    const blocages: Record<string, string[]> = {};
    const handler = new SocialEventsHandler({ io: fauxIo(emissions), prisma: fauxPrisma(blocages, []) });
    const commentaire = (): any => ({ id: 'c-20236', postId: POST_ID, content: 'bonjour', author: { id: AUTEUR_COMMENTAIRE, username: 'b', displayName: 'B' } });

    await handler.broadcastCommentAdded({ postId: POST_ID, comment: commentaire(), commentCount: 1 }, 'auteur-post-20236', 'PUBLIC', []);
    expect(emissions[0].exclues).toEqual([]);

    /* Le lecteur bloque l'auteur du commentaire — ce que fait `POST /directory/blocks`. */
    blocages[SEPARE_DE_L_AUTEUR] = [AUTEUR_COMMENTAIRE];
    invalidateSeparationAround([SEPARE_DE_L_AUTEUR, AUTEUR_COMMENTAIRE]);

    await handler.broadcastCommentAdded({ postId: POST_ID, comment: commentaire(), commentCount: 2 }, 'auteur-post-20236', 'PUBLIC', []);

    expect(emissions[1].exclues).toEqual([`user:${SEPARE_DE_L_AUTEUR}`]);
  });

  /**
   * LE COÛT (dimension 2). `getBlockRelatedUserIds` répond pour UN sujet en
   * deux lectures : l'appeler par sujet en ferait quatre. Les deux sens se
   * lisent ici pour TOUS les sujets à la fois, et le même couple de sujets
   * revient — une traduction diffuse une fois par langue cible. Le témoin lit
   * les ARGUMENTS de la lecture, parce que c'est la seule chose qui distingue
   * « une lecture par sujet » de « une lecture pour les sujets ».
   */
  it('deux sujets ne coûtent qu’UNE paire de lectures, et la diffusion suivante n’en coûte aucune', async () => {
    const emissions: Emission[] = [];
    const lectures: string[][] = [];
    const prisma = fauxPrisma({}, lectures);
    const handler = new SocialEventsHandler({ io: fauxIo(emissions), prisma });
    const charge = { postId: POST_ID, commentId: COMMENT_ID, userId: ACTEUR, emoji: '❤️', likeCount: 1 } as any;

    handler.broadcastCommentLiked(charge, AUTEUR_COMMENTAIRE, await handler.commentActivitySeparation(ACTEUR, AUTEUR_COMMENTAIRE));
    expect(lectures).toEqual([[ACTEUR, AUTEUR_COMMENTAIRE].sort()]);

    handler.broadcastCommentLiked({ ...charge, likeCount: 2 }, AUTEUR_COMMENTAIRE, await handler.commentActivitySeparation(ACTEUR, AUTEUR_COMMENTAIRE));
    expect(lectures).toHaveLength(1);
    expect(versLePost(emissions)).toHaveLength(2);
  });
});
