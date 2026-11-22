/**
 * **#20337 — LA CHARGE D'UNE RÉACTION DE COMMENTAIRE NOMME TOUS LES RÉACTEURS.**
 *
 * #20236 a fermé les ROOMS des quatre événements d'activité d'un commentaire,
 * en nommant DEUX sujets : l'ACTEUR et l'AUTEUR du commentaire. Il ne pouvait
 * pas fermer ce que la CHARGE transporte — c'est la leçon 275 (« une
 * protection se mesure sur tout ce que la charge TRANSPORTE ») appliquée à ce
 * lot-ci.
 *
 * `CommentReactionAggregation.userIds` est le roster NOMINATIF de TOUS les
 * réacteurs. R a bloqué X ; X réagit au commentaire de B ; A réagit aussi. R
 * n'est séparé ni de A ni de B, donc il REÇOIT l'événement — et son
 * `aggregation.userIds` contient l'id de X.
 *
 * ─── DEUX MÉCANISMES, PARCE QU'IL Y A DEUX FORMES DE CHARGE ──────────────
 *
 * La DIFFUSION est une charge UNIQUE pour N lecteurs : on ne peut pas y
 * filtrer par lecteur. Le payload nomme donc TROIS familles de sujets —
 * acteur, auteur du commentaire, **et chaque réacteur du roster** — et
 * l'exclusion de rooms porte sur les trois. C'est la lecture honnête de ce que
 * la charge nomme ; trimmer le roster serait un changement de CONTRAT (voir
 * ci-dessous).
 *
 * La SYNCHRONISATION est un ack NOMINATIF : sa charge n'a qu'un lecteur, donc
 * elle se filtre PAR LECTEUR — c'est strictement mieux qu'un refus, et le
 * lecteur ne perd jamais son PROPRE id (on n'est séparé de personne de
 * soi-même).
 *
 * ─── POURQUOI LE ROSTER N'EST PAS COUPÉ ──────────────────────────────────
 *
 * `PostReactionAggregation` ne porte que `{ emoji, count }` (« NO userIds,
 * count only »), et l'issue proposait la même coupe ici. **Mesuré sur les
 * trois clients : elle n'est pas neutre.** `CommentHeartLedger.reconcile`
 * (iOS, `apps/ios/.../CommentHeartLedger.swift`) dérive « mon cœur » de
 * `reactorUserIds.contains(myUserId)` — et PAS de `hasCurrentUser`, qui est
 * calculé relativement à l'ACTEUR, donc faux pour les destinataires d'un
 * broadcast. Un roster vide ou tronqué fait tomber ce test, donc la branche
 * suivante (`likedIds.contains ? count + 1 : count`) sur-compte d'un cœur à
 * chaque événement d'un TIERS pour tout lecteur qui avait réagi. Ce sont les
 * clients DÉJÀ DÉPLOYÉS qui le paieraient (rétrocompatibilité, #9223) : la
 * coupe est une décision de contrat, pas un correctif de confidentialité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { CommentReactionHandler } from '../CommentReactionHandler';
import { resetSeparationCacheForTests } from '../../separatedRooms';

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
    postId: '507f191e810c19729de20337',
    authorId: 'auteur-commentaire-20337',
    post: { authorId: 'auteur-post-20337', visibility: 'PUBLIC', visibilityUserIds: [] },
  })),
}));

jest.mock('../../../services/posts/separatedCommentAuthors', () => ({
  commentAuthorSeparatedFrom: jest.fn(async () => false),
}));

const ACTEUR = 'acteur-20337';
const AUTEUR_COMMENTAIRE = 'auteur-commentaire-20337';
/** Le TROISIÈME sujet : un réacteur que ni #20236 ni la porte d'action ne nomment. */
const TIERS_REACTEUR = 'tiers-reacteur-20337';
const SEPARE_DU_TIERS = 'separe-du-tiers-20337';
const LECTEUR = 'lecteur-20337';
const POST_ID = '507f191e810c19729de20337';
const COMMENT_ID = '507f191e810c19729de20338';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };
type Blocages = Readonly<Record<string, readonly string[]>> | 'panne';

/** Sert les QUATRE formes de lecture de blocage du dépôt : `hasSome`, `has`, `id.in`, `findUnique`. */
function fauxPrisma(blocages: Blocages) {
  const carte = () => (blocages === 'panne' ? {} : blocages);
  const bloqueursDe = (sujets: readonly string[]) =>
    Object.entries(carte())
      .filter(([, cibles]) => cibles.some((cible) => sujets.includes(cible)))
      .map(([bloqueur]) => ({ id: bloqueur }));
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        if (args?.where?.blockedUserIds?.hasSome) return bloqueursDe(args.where.blockedUserIds.hasSome);
        if (args?.where?.blockedUserIds?.has) return bloqueursDe([args.where.blockedUserIds.has]);
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({ blockedUserIds: [...(carte()[id] ?? [])] }));
      }),
      findUnique: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        return { blockedUserIds: [...(carte()[args?.where?.id] ?? [])] };
      }),
      findFirst: jest.fn(async () => null),
    },
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

function fabriquerHandler(options: {
  prisma: PrismaClient;
  io: any;
  acteur: string;
  roster?: readonly string[];
  sync?: unknown;
}) {
  const roster = options.roster ?? [];
  const commentReactionService = {
    addReaction: jest.fn(async () => ({ id: 'r-1', emoji: '👍' })),
    removeReaction: jest.fn(async () => true),
    getCommentReactions: jest.fn(async () => options.sync ?? { commentId: COMMENT_ID, postId: POST_ID, reactions: [], totalCount: 0, userReactions: [] }),
    createUpdateEvent: jest.fn(async (commentId: string, emoji: string, action: string, userId: string, postId: string) => ({
      commentId,
      postId,
      userId,
      emoji,
      action,
      aggregation: { emoji, count: roster.length, userIds: [...roster], hasCurrentUser: roster.includes(userId) },
      timestamp: new Date().toISOString(),
    })),
  };
  const handler = new CommentReactionHandler({
    io: options.io,
    prisma: options.prisma,
    notificationService: { createCommentReactionNotification: jest.fn(async () => undefined) } as any,
    commentReactionService: commentReactionService as any,
    connectedUsers: new Map([[options.acteur, { id: options.acteur, socketId: 's-1', isAnonymous: false, language: 'fr' } as any]]),
    socketToUser: new Map([['s-1', options.acteur]]),
  });
  const socket = { id: 's-1', emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) } as any;
  return { handler, socket };
}

const versLePost = (emissions: Emission[]) => emissions.filter((e) => e.rooms.includes(`post:${POST_ID}`));

/**
 * Les rooms de TIERS exclues, la room de l'acteur mise de côté : il en sort
 * TOUJOURS depuis le 2e audit (il reçoit sa charge servie sur sa room
 * personnelle), donc son exclusion ne dit rien de la séparation mesurée ici.
 * Elle est gardée par le § « l'acteur ne lit pas … » plus bas.
 */
const tiersExclus = (emission: Emission | undefined) =>
  [...(emission?.exclues ?? [])].filter((room) => room !== `user:${ACTEUR}`).sort();

describe('#20337 — le roster d’une réaction de commentaire ne nomme que des comptes autorisés', () => {
  beforeEach(() => resetSeparationCacheForTests());

  describe('diffusion — le roster est un SUJET de l’exclusion, au même titre que l’acteur et l’auteur', () => {
    it.each([['add'], ['remove']] as const)(
      'comment:reaction-%s exclut la room de qui a bloqué un RÉACTEUR TIERS',
      async (action) => {
        const emissions: Emission[] = [];
        const prisma = fauxPrisma({ [SEPARE_DU_TIERS]: [TIERS_REACTEUR] });
        const { handler, socket } = fabriquerHandler({
          prisma,
          io: fauxIo(emissions),
          acteur: ACTEUR,
          roster: [ACTEUR, TIERS_REACTEUR],
        });

        if (action === 'add') await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);
        else await handler.handleRemoveReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

        const [emission] = versLePost(emissions);
        expect(emission?.charge?.aggregation?.userIds).toContain(TIERS_REACTEUR);
        expect(tiersExclus(emission)).toEqual([`user:${SEPARE_DU_TIERS}`]);
      },
    );

    it('exclut aussi qui un RÉACTEUR TIERS a bloqué — les deux sens', async () => {
      const emissions: Emission[] = [];
      const prisma = fauxPrisma({ [TIERS_REACTEUR]: [SEPARE_DU_TIERS] });
      const { handler, socket } = fabriquerHandler({
        prisma,
        io: fauxIo(emissions),
        acteur: ACTEUR,
        roster: [ACTEUR, TIERS_REACTEUR],
      });

      await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      expect(tiersExclus(versLePost(emissions)[0])).toEqual([`user:${SEPARE_DU_TIERS}`]);
    });

    /**
     * Le témoin NÉGATIF : sans réacteur tiers, rien ne change. Il distingue
     * « le correctif nomme le roster » de « le correctif exclut tout le monde ».
     */
    it('n’exclut personne quand aucun blocage ne touche acteur, auteur ni roster', async () => {
      const emissions: Emission[] = [];
      const { handler, socket } = fabriquerHandler({
        prisma: fauxPrisma({}),
        io: fauxIo(emissions),
        acteur: ACTEUR,
        roster: [ACTEUR, TIERS_REACTEUR],
      });

      await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      expect(tiersExclus(versLePost(emissions)[0])).toEqual([]);
    });

    /** Un roster vide (ou une agrégation absente) ne doit pas faire tomber la diffusion. */
    it('diffuse encore quand l’agrégation ne porte aucun roster', async () => {
      const emissions: Emission[] = [];
      const { handler, socket } = fabriquerHandler({
        prisma: fauxPrisma({}),
        io: fauxIo(emissions),
        acteur: ACTEUR,
        roster: [],
      });

      await handler.handleRemoveReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      expect(versLePost(emissions)).toHaveLength(1);
    });

    /** FERMÉ : une lecture de blocage qui échoue n’émet RIEN, sur AUCUNE adresse. */
    it('n’émet rien quand la lecture des blocages échoue', async () => {
      const emissions: Emission[] = [];
      const { handler, socket } = fabriquerHandler({
        prisma: fauxPrisma('panne'),
        io: fauxIo(emissions),
        acteur: ACTEUR,
        roster: [ACTEUR, TIERS_REACTEUR],
      });

      await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      expect(emissions).toEqual([]);
    });
  });

  describe('synchronisation — un ack NOMINATIF se filtre par LECTEUR', () => {
    /**
     * **LA FIXTURE PORTE LA FORME RÉELLE, ET C'EST LE CORRECTIF DU TÉMOIN.**
     *
     * Elle ne portait que `{ emoji, count, userIds, hasCurrentUser }` quand
     * `getCommentReactions` rendait EN PLUS un `users[]` nominatif (nom affiché,
     * avatar, horodatage à la seconde). Le harnais ne pouvait donc pas rougir
     * sur le champ VOISIN, et c'est exactement par là que la fuite est passée :
     * `rosterServedTo` gardait `userIds` et recopiait `users` par un spread.
     *
     * `users[]` est désormais COUPÉ à la source. Le témoin ci-dessous le garde
     * en posant la forme d'AVANT — si quelqu'un la rétablit, il rougit.
     */
    const syncBrut = {
      commentId: COMMENT_ID,
      postId: POST_ID,
      reactions: [
        { emoji: '👍', count: 3, userIds: [LECTEUR, TIERS_REACTEUR, ACTEUR], hasCurrentUser: true },
        { emoji: '❤️', count: 1, userIds: [TIERS_REACTEUR], hasCurrentUser: false },
      ],
      totalCount: 4,
      userReactions: ['👍'],
    };

    /** La forme d'AVANT la coupe : `users[]`, index-parallèle à `userIds`. */
    const syncAvecUsers = {
      ...syncBrut,
      reactions: syncBrut.reactions.map((r) => ({
        ...r,
        users: r.userIds.map((id) => ({ userId: id, username: `nom-${id}`, avatar: `https://cdn/${id}.jpg`, createdAt: '2026-11-22T10:00:00.000Z' })),
      })),
    };

    it('retire du roster servi les comptes dont un blocage sépare le lecteur, et GARDE le compte', async () => {
      const prisma = fauxPrisma({ [LECTEUR]: [TIERS_REACTEUR] });
      const { handler, socket } = fabriquerHandler({ prisma, io: fauxIo([]), acteur: LECTEUR, sync: syncBrut });
      const ack = jest.fn();

      await handler.handleRequestSync(socket, { commentId: COMMENT_ID, postId: POST_ID } as any, ack as any);

      const servi = (ack.mock.calls[0] as any[])[0];
      expect(servi.success).toBe(true);
      expect(servi.data.reactions[0].userIds).toEqual([LECTEUR, ACTEUR]);
      expect(servi.data.reactions[1].userIds).toEqual([]);
      /* Un AGRÉGAT sans identité n'est pas visé : le compte ne bouge pas. */
      expect(servi.data.reactions.map((r: any) => r.count)).toEqual([3, 1]);
      expect(servi.data.totalCount).toBe(4);
    });

    it('sert le roster entier quand aucun blocage ne sépare le lecteur', async () => {
      const { handler, socket } = fabriquerHandler({ prisma: fauxPrisma({}), io: fauxIo([]), acteur: LECTEUR, sync: syncBrut });
      const ack = jest.fn();

      await handler.handleRequestSync(socket, { commentId: COMMENT_ID, postId: POST_ID } as any, ack as any);

      expect((ack.mock.calls[0] as any[])[0].data.reactions[0].userIds).toEqual([LECTEUR, TIERS_REACTEUR, ACTEUR]);
    });

    /**
     * Le sens INVERSE : c'est le TIERS qui a bloqué le lecteur. Un témoin posé
     * sur le seul sens « le lecteur a bloqué » reste vert sous un correctif qui
     * n'en lit qu'un.
     */
    it('retire aussi un compte qui a bloqué le LECTEUR — les deux sens', async () => {
      const prisma = fauxPrisma({ [TIERS_REACTEUR]: [LECTEUR] });
      const { handler, socket } = fabriquerHandler({ prisma, io: fauxIo([]), acteur: LECTEUR, sync: syncBrut });
      const ack = jest.fn();

      await handler.handleRequestSync(socket, { commentId: COMMENT_ID, postId: POST_ID } as any, ack as any);

      expect((ack.mock.calls[0] as any[])[0].data.reactions[0].userIds).toEqual([LECTEUR, ACTEUR]);
    });

    /**
     * **CE QUI PART À CÔTÉ DE LA CHAÎNE GARDÉE** (leçon 275). `users[]` portait
     * le nom affiché, l'avatar et l'horodatage de CHAQUE réacteur — strictement
     * plus que `userIds`. Aucun client ne le décodait ; il est coupé à la
     * source. Le témoin pose la forme d'avant pour que son retour rougisse.
     */
    it('ne sert AUCUN champ nominatif voisin du roster — nom, avatar, horodatage', async () => {
      const prisma = fauxPrisma({ [LECTEUR]: [TIERS_REACTEUR] });
      const { handler, socket } = fabriquerHandler({ prisma, io: fauxIo([]), acteur: LECTEUR, sync: syncAvecUsers });
      const ack = jest.fn();

      await handler.handleRequestSync(socket, { commentId: COMMENT_ID, postId: POST_ID } as any, ack as any);

      const servi = (ack.mock.calls[0] as any[])[0];
      const nommes = JSON.stringify(servi.data);
      expect(nommes).not.toContain(TIERS_REACTEUR);
      expect(nommes).not.toContain('nom-');
      expect(nommes).not.toContain('cdn/');
    });

    /** `getCommentReactions` ne PRODUIT plus `users[]` : la coupe est à la source. */
    it('le service ne produit plus aucun champ nominatif enrichi', async () => {
      const { CommentReactionService } = await import('../../../services/CommentReactionService');
      const prisma = {
        commentReaction: { findMany: jest.fn(async () => [
          { id: 'r1', commentId: COMMENT_ID, userId: TIERS_REACTEUR, emoji: '👍', createdAt: new Date() },
        ]) },
        postComment: { findUnique: jest.fn(async () => ({ postId: POST_ID })) },
        user: { findMany: jest.fn(async () => { throw new Error('aucune lecture de profil ne doit avoir lieu'); }) },
      } as any;
      const service = new CommentReactionService(prisma);

      const sync = await service.getCommentReactions({ commentId: COMMENT_ID, currentUserId: LECTEUR });

      expect(JSON.stringify(sync)).not.toContain('username');
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    /** Une forme inattendue se REFUSE : un garde qui ne sait pas filtrer ne sert pas. */
    it('FERMÉ : une forme de roster inattendue est refusée, jamais servie telle quelle', async () => {
      const prisma = fauxPrisma({ [LECTEUR]: [TIERS_REACTEUR] });
      const { handler, socket } = fabriquerHandler({
        prisma, io: fauxIo([]), acteur: LECTEUR,
        sync: { commentId: COMMENT_ID, postId: POST_ID, reactions: 'pas-un-tableau', totalCount: 0, userReactions: [] },
      });
      const ack = jest.fn();

      await handler.handleRequestSync(socket, { commentId: COMMENT_ID, postId: POST_ID } as any, ack as any);

      expect((ack.mock.calls[0] as any[])[0].success).toBe(false);
    });

    it('FERMÉ : une lecture de blocage qui échoue ne sert aucun roster', async () => {
      const { handler, socket } = fabriquerHandler({ prisma: fauxPrisma('panne'), io: fauxIo([]), acteur: LECTEUR, sync: syncBrut });
      const ack = jest.fn();

      await handler.handleRequestSync(socket, { commentId: COMMENT_ID, postId: POST_ID } as any, ack as any);

      expect((ack.mock.calls[0] as any[])[0].success).toBe(false);
    });
  });

  /**
   * **L'ACTEUR EST UN LECTEUR COMME UN AUTRE** (#20337, audit adversarial).
   *
   * Rien ne l'empêche de réagir à un commentaire dont le roster nomme un compte
   * qu'il a bloqué : la porte d'action garde l'ACL du post et l'AUTEUR du
   * commentaire, jamais les RÉACTEURS — et le chemin de RETRAIT n'a pas même la
   * porte de l'auteur. Son ACK se filtre (il est nominatif) et il sort de la
   * diffusion, qui porte le roster entier.
   */
  describe('l’acteur ne lit pas, dans son propre événement, l’id d’un compte qu’il a bloqué', () => {
    it.each([['add'], ['remove']] as const)('l’ACK de comment:reaction-%s est filtré pour l’acteur', async (action) => {
      const prisma = fauxPrisma({ [ACTEUR]: [TIERS_REACTEUR] });
      const { handler, socket } = fabriquerHandler({
        prisma, io: fauxIo([]), acteur: ACTEUR, roster: [ACTEUR, TIERS_REACTEUR],
      });
      const ack = jest.fn();

      if (action === 'add') await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, ack as any);
      else await handler.handleRemoveReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, ack as any);

      const servi = (ack.mock.calls[0] as any[])[0];
      expect(servi.success).toBe(true);
      expect(servi.data.aggregation.userIds).toEqual([ACTEUR]);
    });

    /**
     * **L'ACTEUR REÇOIT SON ÉVÉNEMENT, SUR SA ROOM PERSONNELLE, FILTRÉ.**
     *
     * L'exclure sèchement de la diffusion lui infligeait le défaut même que ce
     * lot refuse d'infliger aux tiers : `CommentHeartLedger` (iOS) garde son
     * delta optimiste après l'envoi — seule la DIFFUSION le purge
     * (`settle(delivered: true)` ne purge rien) — donc un acteur privé de
     * l'événement gardait un `+1` indéfini sur son propre écran, et
     * `except(ROOMS.user(actor))` retirant TOUS ses sockets, ses autres
     * appareils restaient sur un compteur périmé que iOS persiste.
     *
     * Le témoin assert donc qu'il REÇOIT, et pas seulement qu'il n'est pas
     * exclu — « un contrôle existe s'il a un effet ».
     */
    it.each([['add'], ['remove']] as const)(
      'comment:reaction-%s : l’acteur reçoit sa charge FILTRÉE sur sa room personnelle',
      async (action) => {
        const emissions: Emission[] = [];
        const prisma = fauxPrisma({ [ACTEUR]: [TIERS_REACTEUR] });
        const { handler, socket } = fabriquerHandler({
          prisma, io: fauxIo(emissions), acteur: ACTEUR, roster: [ACTEUR, TIERS_REACTEUR],
        });

        if (action === 'add') await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);
        else await handler.handleRemoveReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

        /* La room du post porte le roster entier, l'acteur en est retiré… */
        const [versPost] = versLePost(emissions);
        expect(versPost?.charge?.aggregation?.userIds).toContain(TIERS_REACTEUR);
        expect(versPost?.exclues).toContain(`user:${ACTEUR}`);

        /* …et il reçoit la MÊME famille d'événement sur sa room, sans le tiers. */
        const versActeur = emissions.find((e) => e.rooms.includes(`user:${ACTEUR}`));
        expect(versActeur?.evenement).toBe(versPost?.evenement);
        expect(versActeur?.charge?.aggregation?.userIds).toEqual([ACTEUR]);
      },
    );

    /**
     * **LE TÉMOIN QUE LE DEUXIÈME AUDIT A RÉCLAMÉ, ET QUI NE POUVAIT PAS
     * TOMBER.** Le tour précédent gardait « séparé du seul AUTEUR, l'acteur
     * garde sa diffusion » avec `roster: [ACTEUR]` — l'auteur n'étant PAS dans
     * le roster, le bon comportement et le mauvais rendaient le même verdict.
     * Il suffit que l'auteur ait aimé son propre commentaire, ce que rien
     * n'interdit, pour qu'il devienne un sujet du roster.
     *
     * C'est la leçon 261 portée au SUJET : **un témoin qui garde « seulement
     * l'auteur » doit mettre l'auteur dans l'ensemble qui pourrait le
     * contredire.** Et le chemin est VIVANT — `handleRemoveReaction` n'a pas de
     * porte `commentAuthorSeparatedFrom`, par décision écrite.
     */
    it('reçoit sa charge même séparé de l’AUTEUR, et même quand l’AUTEUR a réagi', async () => {
      const emissions: Emission[] = [];
      const prisma = fauxPrisma({ [ACTEUR]: [AUTEUR_COMMENTAIRE] });
      const { handler, socket } = fabriquerHandler({
        prisma, io: fauxIo(emissions), acteur: ACTEUR, roster: [ACTEUR, AUTEUR_COMMENTAIRE],
      });

      await handler.handleRemoveReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      const versActeur = emissions.find((e) => e.rooms.includes(`user:${ACTEUR}`));
      expect(versActeur).toBeDefined();
      expect(versActeur?.charge?.aggregation?.userIds).toEqual([ACTEUR]);
      expect(versLePost(emissions)[0]?.exclues).toContain(`user:${AUTEUR_COMMENTAIRE}`);
    });

    /** FERMÉ : aucune charge ne part vers l'acteur quand la séparation ne se lit pas. */
    it('n’émet RIEN vers l’acteur quand la lecture des blocages échoue', async () => {
      const emissions: Emission[] = [];
      const { handler, socket } = fabriquerHandler({
        prisma: fauxPrisma('panne'), io: fauxIo(emissions), acteur: ACTEUR, roster: [ACTEUR, TIERS_REACTEUR],
      });

      await handler.handleAddReaction(socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      expect(emissions).toEqual([]);
    });

    /**
     * **LA FORME SERVIE NE DÉPEND PAS DU LECTEUR.** Un repli « rien à taire ⇒
     * je rends la charge telle quelle » faisait disparaître un champ ajouté en
     * amont pour les SEULS lecteurs qui ont des blocages.
     */
    it('sert la même FORME à un lecteur sans blocage qu’à un lecteur qui en a', async () => {
      const sansBlocage: Emission[] = [];
      const avecBlocage: Emission[] = [];
      const a = fabriquerHandler({ prisma: fauxPrisma({}), io: fauxIo(sansBlocage), acteur: ACTEUR, roster: [ACTEUR] });
      const b = fabriquerHandler({ prisma: fauxPrisma({ [ACTEUR]: [TIERS_REACTEUR] }), io: fauxIo(avecBlocage), acteur: ACTEUR, roster: [ACTEUR] });

      await a.handler.handleAddReaction(a.socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);
      await b.handler.handleAddReaction(b.socket, { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' } as any, undefined as any);

      const cles = (liste: Emission[]) =>
        Object.keys(liste.find((e) => e.rooms.includes(`user:${ACTEUR}`))?.charge?.aggregation ?? {}).sort();
      expect(cles(sansBlocage)).toEqual(cles(avecBlocage));
    });
  });
});
