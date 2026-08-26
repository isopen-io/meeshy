/**
 * La notification qu'une réaction a produite, retirée avec la réaction.
 *
 * Septième occurrence de la famille ouverte aux cycles 46/47/48/50/51, et la
 * première dont le référent n'est pas un CONTENU mais un GESTE. Le retrait dur
 * était déjà couvert de bout en bout — message, post, commentaire, demande
 * d'ami retirent chacun leurs lignes. Le retrait d'une RÉACTION, lui, ne
 * retirait rien : « X a réagi ❤️ à votre message » survivait indéfiniment au
 * ❤️ qui l'avait produit, et le destinataire gardait dans sa liste la trace
 * d'un geste que son auteur avait défait.
 *
 * Ce qui distingue cette occurrence de ses six aînées, et ce que cette suite
 * démontre :
 *
 *  1. **Le référent n'a pas d'id.** Une réaction n'est pas nommée dans la
 *     notification qu'elle produit — seule la CONJONCTION
 *     (type × cible × acteur × emoji) la désigne. Les quatre sont donc
 *     nécessaires, et les tests d'isolation ci-dessous fixent chacune : une
 *     seule qui manque, et le retrait emporte la réaction d'un tiers, un autre
 *     emoji du même acteur, ou la notification d'un contenu voisin.
 *  2. **L'emoji vit sous DEUX clés.** `message_reaction` et `comment_reaction`
 *     écrivent `metadata.reactionEmoji` ; `post_like` et `comment_like`
 *     écrivent `metadata.emoji`. Même divergence que les deux chemins de
 *     `commentId` côté `retractCommentNotifications`, et même conséquence : un
 *     retrait qui n'en lirait qu'une laisserait la moitié de la famille en base.
 *  3. **`type` porte la désambiguïsation, pas la cible.** Un `comment_like`
 *     écrit `context.postId` exactement comme un `post_like` : sans le scope
 *     par type, retirer une réaction de POST emporterait les réactions aux
 *     COMMENTAIRES du même post par le même acteur avec le même emoji.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { retractReactionNotifications } from '../retractReactionNotifications';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439012';
const COMMENT_ID = '507f1f77bcf86cd799439013';

const REACTOR_ID = '64a000000000000000000001';
const OTHER_REACTOR_ID = '64a000000000000000000002';
const AUTHOR_ID = '64a000000000000000000003';

/**
 * Une ligne `Notification` réduite aux quatre coordonnées qui identifient la
 * réaction dont elle est née. `contextPostId` et `contextCommentId` sont
 * indépendants parce qu'ils le sont en production : un `comment_like` porte les
 * deux, un `post_like` seulement le premier.
 */
interface NotificationRow {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly actorId: string;
  readonly contextMessageId?: string;
  readonly contextPostId?: string;
  readonly contextCommentId?: string;
  readonly metadataCommentId?: string;
  /** `message_reaction` / `comment_reaction`. */
  readonly reactionEmoji?: string;
  /** `post_like` / `story_reaction` / `status_reaction` / `comment_like`. */
  readonly emoji?: string;
}

let rows: NotificationRow[] = [];

const runCommandRaw = jest.fn<any>();
const deleteMany = jest.fn<any>();
const announceNotificationsRetracted = jest.fn<any>();

const announcer = { announceNotificationsRetracted } as any;
const prisma = {
  $runCommandRaw: runCommandRaw,
  notification: { deleteMany },
} as any;

/** Lit un chemin JSON d'une ligne, avec la même clé que le filtre Mongo. */
function pathValue(row: NotificationRow, path: string): string | undefined {
  switch (path) {
    case 'context.messageId':
      return row.contextMessageId;
    case 'context.postId':
      return row.contextPostId;
    case 'context.commentId':
      return row.contextCommentId;
    case 'metadata.commentId':
      return row.metadataCommentId;
    case 'metadata.reactionEmoji':
      return row.reactionEmoji;
    case 'metadata.emoji':
      return row.emoji;
    default:
      return undefined;
  }
}

/** `{ $or: [...] }` → au moins une clause d'égalité satisfaite. */
function matchesAnyClause(row: NotificationRow, clauses: readonly any[]): boolean {
  return clauses.some((clause) =>
    Object.entries(clause).some(([path, expected]) => pathValue(row, path) === expected)
  );
}

/**
 * Le double APPLIQUE le filtre reçu — il n'accepte QUE la forme correcte, si
 * bien qu'un retrait sous-spécifié se voit comme un retrait qui emporte trop,
 * et non comme un vert silencieux.
 *
 * La conjonction attendue : `type ∈ …` ET `actor.id = …` ET (`$and` de deux
 * `$or`, l'un sur la cible, l'autre sur l'emoji).
 */
function seed(seeded: NotificationRow[]): void {
  rows = [...seeded];
  runCommandRaw.mockImplementation(async (command: any) => {
    const filter = command?.filter ?? {};
    const types: string[] | undefined = filter.type?.$in;
    const actorId: string | undefined = filter['actor.id'];
    const conjuncts: any[] = filter.$and ?? [];

    const matched = rows.filter((row) => {
      if (!types?.includes(row.type)) return false;
      if (actorId !== row.actorId) return false;
      return conjuncts.every((conjunct) => matchesAnyClause(row, conjunct.$or ?? []));
    });

    return {
      cursor: {
        firstBatch: matched.map((row) => ({
          _id: { $oid: row.id },
          userId: { $oid: row.userId },
          // La projection relit `delivery.pushSent` : la révocation push ne
          // réveille un appareil que là où un push nominal est parti.
          delivery: { pushSent: true },
        })),
      },
    };
  });
}

/** Les ids que la suppression a réellement emportés. */
function deletedIds(): string[] {
  return deleteMany.mock.calls.flatMap((call: any) => call[0].where.id.in as string[]);
}

const messageReaction = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: '607f1f77bcf86cd799439001',
  userId: AUTHOR_ID,
  type: 'message_reaction',
  actorId: REACTOR_ID,
  contextMessageId: MESSAGE_ID,
  reactionEmoji: '❤️',
  ...over,
});

const postLike = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: '607f1f77bcf86cd799439002',
  userId: AUTHOR_ID,
  type: 'post_like',
  actorId: REACTOR_ID,
  contextPostId: POST_ID,
  emoji: '❤️',
  ...over,
});

const commentReaction = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: '607f1f77bcf86cd799439003',
  userId: AUTHOR_ID,
  type: 'comment_reaction',
  actorId: REACTOR_ID,
  contextPostId: POST_ID,
  contextCommentId: COMMENT_ID,
  reactionEmoji: '❤️',
  ...over,
});

const commentLike = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: '607f1f77bcf86cd799439004',
  userId: AUTHOR_ID,
  type: 'comment_like',
  actorId: REACTOR_ID,
  contextPostId: POST_ID,
  metadataCommentId: COMMENT_ID,
  emoji: '❤️',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  rows = [];
  deleteMany.mockResolvedValue({ count: 0 });
  announceNotificationsRetracted.mockResolvedValue(undefined);
});

describe('retractReactionNotifications', () => {
  describe('la réaction retirée emporte la notification qu’elle a produite', () => {
    it('retire le message_reaction du message dé-réagi', async () => {
      seed([messageReaction()]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(1);
      expect(deletedIds()).toEqual(['607f1f77bcf86cd799439001']);
    });

    /**
     * L'emoji sous `metadata.emoji` et non `metadata.reactionEmoji` : la
     * seconde des deux clés, celle qu'une transposition littérale du jumeau
     * « message » laisserait en base.
     */
    it('retire le post_like du post dé-réagi malgré la clé d’emoji divergente', async () => {
      seed([postLike()]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(1);
      expect(deletedIds()).toEqual(['607f1f77bcf86cd799439002']);
    });

    /**
     * Une story et un statut produisent `story_reaction` / `status_reaction` et
     * non `post_like` — même geste, même cible, trois types. Le retrait les
     * couvre tous les trois, sans quoi réagir puis dé-réagir à une story
     * laisserait la ligne.
     */
    it.each(['story_reaction', 'status_reaction'])(
      'retire aussi le %s, produit par le même geste sur une story/un statut',
      async (type) => {
        seed([postLike({ type })]);

        const retracted = await retractReactionNotifications(
          prisma,
          { subject: { kind: 'post', id: POST_ID }, actorId: REACTOR_ID, emoji: '❤️' },
          announcer
        );

        expect(retracted).toBe(1);
      }
    );

    /**
     * Le commentaire porte les DEUX familles : `comment_reaction` nomme sa
     * cible sous `context.commentId`, `comment_like` sous `metadata.commentId`.
     * Un retrait qui ne lirait qu'un chemin en laisserait la moitié.
     */
    it('retire les deux familles de réaction à un commentaire, quel que soit le chemin de l’id', async () => {
      seed([commentReaction(), commentLike()]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'comment', id: COMMENT_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(2);
      expect(deletedIds().sort()).toEqual([
        '607f1f77bcf86cd799439003',
        '607f1f77bcf86cd799439004',
      ]);
    });
  });

  describe('la conjonction qui désigne LA réaction, et rien d’autre', () => {
    it('laisse la réaction d’un autre acteur au même contenu', async () => {
      seed([messageReaction({ actorId: OTHER_REACTOR_ID })]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(0);
      expect(deleteMany).not.toHaveBeenCalled();
    });

    /**
     * Les réactions sont MULTIPLES par acteur : retirer le ❤️ ne dit rien du
     * 👍 laissé en place, et sa notification doit survivre.
     */
    it('laisse les autres emojis du même acteur sur le même contenu', async () => {
      seed([messageReaction({ reactionEmoji: '👍' })]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(0);
    });

    it('laisse la réaction du même acteur à un autre contenu', async () => {
      seed([messageReaction({ contextMessageId: '507f1f77bcf86cd7994390ff' })]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(0);
    });

    /**
     * Le témoin du scope par TYPE. Un `comment_like` porte `context.postId` du
     * post qui héberge le commentaire — exactement la clé du `post_like`. Sans
     * le scope, dé-réagir au POST emporterait la réaction au COMMENTAIRE, que
     * son auteur n'a jamais défaite.
     */
    it('ne confond pas la réaction au post avec la réaction à l’un de ses commentaires', async () => {
      seed([postLike(), commentLike()]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(1);
      expect(deletedIds()).toEqual(['607f1f77bcf86cd799439002']);
    });

    /** Le symétrique : dé-réagir au commentaire ne touche pas le post. */
    it('ne confond pas la réaction au commentaire avec la réaction à son post', async () => {
      seed([postLike({ contextPostId: POST_ID }), commentReaction()]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'comment', id: COMMENT_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(1);
      expect(deletedIds()).toEqual(['607f1f77bcf86cd799439003']);
    });
  });

  describe('l’annonce aux appareils connectés', () => {
    /**
     * L'annonce APRÈS l'écriture durable, comme dans toute la famille : les
     * compteurs qu'elle recalcule doivent voir la base d'après le retrait.
     */
    it('annonce le retrait au destinataire, après la suppression', async () => {
      seed([messageReaction()]);
      const order: string[] = [];
      deleteMany.mockImplementation(async () => {
        order.push('delete');
        return { count: 1 };
      });
      announceNotificationsRetracted.mockImplementation(async () => {
        order.push('announce');
      });

      await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(order).toEqual(['delete', 'announce']);
      expect(announceNotificationsRetracted).toHaveBeenCalledWith([
        { id: '607f1f77bcf86cd799439001', userId: AUTHOR_ID, pushSent: true },
      ]);
    });

    /**
     * Le throttle par paire (`shouldCreateReactionNotification`) fait que la
     * plupart des réactions ne produisent AUCUNE ligne. Le retrait tombe donc
     * sur l'ensemble vide en régime normal : il ne doit ni écrire, ni annoncer.
     */
    it('n’écrit ni n’annonce quand la réaction n’avait produit aucune ligne', async () => {
      seed([]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        announcer
      );

      expect(retracted).toBe(0);
      expect(deleteMany).not.toHaveBeenCalled();
      expect(announceNotificationsRetracted).not.toHaveBeenCalled();
    });

    /**
     * Le retrait est un EFFET du dé-réagir, jamais sa condition : la réaction
     * est déjà partie de la base quand il s'exécute. Un annonceur absent —
     * process sans `io` — ne doit pas empêcher la suppression.
     */
    it('supprime même sans annonceur câblé', async () => {
      seed([messageReaction()]);

      const retracted = await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        undefined
      );

      expect(retracted).toBe(1);
      expect(deletedIds()).toEqual(['607f1f77bcf86cd799439001']);
    });
  });

  describe('les entrées qui ne méritent pas d’aller jusqu’à Mongo', () => {
    /**
     * Un réacteur ANONYME n'a pas de `User.id` — `notifyReactionAdded` refuse
     * de notifier pour lui. Le retrait doit refuser symétriquement : un
     * `actor.id` vide ne filtre rien et le `$in` sur les types emporterait
     * alors toutes les réactions du contenu, celles des autres comprises.
     */
    it.each([
      ['acteur vide', { subject: { kind: 'message' as const, id: MESSAGE_ID }, actorId: '', emoji: '❤️' }],
      ['cible vide', { subject: { kind: 'message' as const, id: '' }, actorId: REACTOR_ID, emoji: '❤️' }],
      ['emoji vide', { subject: { kind: 'message' as const, id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '' }],
    ])('ne lit même pas la base sur %s', async (_label, removed) => {
      seed([messageReaction()]);

      const retracted = await retractReactionNotifications(prisma, removed, announcer);

      expect(retracted).toBe(0);
      expect(runCommandRaw).not.toHaveBeenCalled();
      expect(deleteMany).not.toHaveBeenCalled();
    });
  });
});
