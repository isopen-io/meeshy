/**
 * Les notifications qu'un commentaire a produites, retirées avec lui.
 *
 * Sixième occurrence de la famille ouverte aux cycles 46/47/48/50/51 : une ligne
 * dénormalisée survit au retrait de son référent parce que le retrait ne l'a
 * jamais nommée. Ce qui distingue CELLE-CI de ses cinq aînées tient en une
 * ligne, et c'est le témoin central de cette suite :
 *
 * **le lien vers le commentaire vit dans DEUX chemins JSON, et aucun des deux
 * ne couvre tous les types.** `comment_reaction` n'écrit que
 * `context.commentId` ; `post_comment` et `comment_like` n'écrivent que
 * `metadata.commentId`. Un retrait qui ne lirait que `context.commentId` — le
 * seul chemin que le jumeau côté post connaît — laisserait derrière lui les
 * « X a commenté votre publication », c'est-à-dire la MAJORITÉ du volume.
 *
 * L'autre différence est la portée : `deleteComment` retire le SOUS-ARBRE
 * entier (le commentaire et toutes ses réponses), donc le retrait prend une
 * LISTE d'ids et non un id. Une implémentation qui ne traiterait que la cible
 * laisserait les notifications des réponses emportées avec elle.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import {
  retractCommentNotifications,
  COMMENT_NOTIFICATION_RETRACTION_BATCH_SIZE,
} from '../retractCommentNotifications';

const COMMENT_ID = '507f1f77bcf86cd799439021';
const REPLY_ID = '507f1f77bcf86cd799439022';
const OTHER_COMMENT_ID = '507f1f77bcf86cd799439023';

const POST_AUTHOR_ID = '64a000000000000000000001';
const COMMENT_AUTHOR_ID = '64a000000000000000000002';
const MENTIONED_ID = '64a000000000000000000003';

/**
 * Une ligne de notification, réduite aux deux chemins qui peuvent porter le
 * lien. `contextCommentId` et `metadataCommentId` sont INDÉPENDANTS parce
 * qu'ils le sont en production : les huit types producteurs se répartissent en
 * trois familles (context seul, metadata seul, les deux).
 */
interface NotificationRow {
  readonly id: string;
  readonly userId: string;
  readonly contextCommentId: string | null;
  readonly metadataCommentId: string | null;
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

/**
 * Le double APPLIQUE le filtre reçu, et rend l'Extended JSON de Mongo.
 *
 * Il n'interprète QUE la forme `$or` de deux `$in` — c'est-à-dire exactement le
 * filtre correct. Toute autre forme (un seul chemin, une égalité simple) rend
 * un ensemble VIDE : une lecture partielle se voit alors comme un retrait qui
 * n'a rien fait, et non comme un vert silencieux.
 */
function seed(seeded: NotificationRow[]): void {
  rows = [...seeded];
  runCommandRaw.mockImplementation(async (command: any) => {
    const clauses: any[] = command?.filter?.$or ?? [];
    const wantedContext: string[] | undefined = clauses.find((c) => 'context.commentId' in c)?.[
      'context.commentId'
    ]?.$in;
    const wantedMetadata: string[] | undefined = clauses.find((c) => 'metadata.commentId' in c)?.[
      'metadata.commentId'
    ]?.$in;
    const matched = rows.filter(
      (row) =>
        (row.contextCommentId !== null && (wantedContext ?? []).includes(row.contextCommentId)) ||
        (row.metadataCommentId !== null && (wantedMetadata ?? []).includes(row.metadataCommentId))
    );
    const batch = matched.slice(0, command?.batchSize ?? matched.length);
    return {
      cursor: {
        firstBatch: batch.map((row) => ({
          _id: { $oid: row.id },
          userId: { $oid: row.userId },
          delivery: { pushSent: true },
        })),
        id: 0,
        ns: 'meeshy.Notification',
      },
      ok: 1,
    };
  });
  deleteMany.mockImplementation(async ({ where }: any) => {
    const removing: string[] = where?.id?.in ?? [];
    const before = rows.length;
    rows = rows.filter((row) => !removing.includes(row.id));
    return { count: before - rows.length };
  });
}

/** `comment_reaction` : le lien ne vit QUE dans `context`. */
function contextOnly(id: string, userId: string, commentId: string): NotificationRow {
  return { id, userId, contextCommentId: commentId, metadataCommentId: null };
}

/** `post_comment`, `comment_like` : le lien ne vit QUE dans `metadata`. */
function metadataOnly(id: string, userId: string, commentId: string): NotificationRow {
  return { id, userId, contextCommentId: null, metadataCommentId: commentId };
}

/** `comment_reply`, `user_mentioned`, la famille story : les deux chemins. */
function bothPaths(id: string, userId: string, commentId: string): NotificationRow {
  return { id, userId, contextCommentId: commentId, metadataCommentId: commentId };
}

beforeEach(() => {
  jest.clearAllMocks();
  announceNotificationsRetracted.mockResolvedValue(undefined);
  seed([]);
});

describe('retractCommentNotifications', () => {
  it('lit les DEUX chemins JSON — aucun des deux ne couvre tous les types', async () => {
    seed([bothPaths('n1', POST_AUTHOR_ID, COMMENT_ID)]);

    await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        find: 'Notification',
        filter: {
          $or: [
            { 'context.commentId': { $in: [COMMENT_ID] } },
            { 'metadata.commentId': { $in: [COMMENT_ID] } },
          ],
        },
        projection: { _id: 1, userId: 1, 'delivery.pushSent': 1 },
      })
    );
  });

  /**
   * Le témoin qui aurait manqué à une transposition littérale du jumeau post :
   * « X a commenté votre publication » (`post_comment`) est la notification la
   * plus fréquente de la famille, et son `commentId` ne vit QUE dans
   * `metadata`. Un filtre sur le seul `context.commentId` la laisserait en base.
   */
  it('retire aussi les lignes dont le lien ne vit que dans metadata', async () => {
    seed([
      metadataOnly('n-post-comment', POST_AUTHOR_ID, COMMENT_ID),
      metadataOnly('n-comment-like', COMMENT_AUTHOR_ID, COMMENT_ID),
    ]);

    const count = await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(count).toBe(2);
    expect(rows).toHaveLength(0);
  });

  it('retire aussi les lignes dont le lien ne vit que dans context', async () => {
    seed([contextOnly('n-comment-reaction', COMMENT_AUTHOR_ID, COMMENT_ID)]);

    const count = await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(count).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it("retire le SOUS-ARBRE et annonce chaque ligne à SON destinataire", async () => {
    seed([
      metadataOnly('n-auteur-post', POST_AUTHOR_ID, COMMENT_ID),
      contextOnly('n-reaction', COMMENT_AUTHOR_ID, COMMENT_ID),
      bothPaths('n-reponse', MENTIONED_ID, REPLY_ID),
    ]);

    const count = await retractCommentNotifications(prisma, [COMMENT_ID, REPLY_ID], announcer);

    expect(count).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-auteur-post', 'n-reaction', 'n-reponse'] } },
    });
    expect(announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n-auteur-post', userId: POST_AUTHOR_ID, pushSent: true },
      { id: 'n-reaction', userId: COMMENT_AUTHOR_ID, pushSent: true },
      { id: 'n-reponse', userId: MENTIONED_ID, pushSent: true },
    ]);
  });

  it("ne touche pas les notifications d'un AUTRE commentaire, ni celles hors commentaire", async () => {
    seed([
      bothPaths('n-cible', POST_AUTHOR_ID, COMMENT_ID),
      bothPaths('n-voisin', POST_AUTHOR_ID, OTHER_COMMENT_ID),
      { id: 'n-hors', userId: POST_AUTHOR_ID, contextCommentId: null, metadataCommentId: null },
    ]);

    await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n-cible'] } } });
    expect(rows.map((row) => row.id)).toEqual(['n-voisin', 'n-hors']);
  });

  it("annonce APRÈS l'écriture durable — les compteurs voient la base d'après le retrait", async () => {
    seed([bothPaths('n1', POST_AUTHOR_ID, COMMENT_ID)]);
    const order: string[] = [];
    deleteMany.mockImplementation(async () => {
      order.push('delete');
      return { count: 1 };
    });
    announceNotificationsRetracted.mockImplementation(async () => {
      order.push('announce');
    });

    await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(order).toEqual(['delete', 'announce']);
  });

  /**
   * Un fil populaire dépasse un lot : `post_comment` + `comment_reply` +
   * `comment_like` + mentions se cumulent sur un seul commentaire, et le
   * sous-arbre multiplie le tout. Un lot PLEIN ne prouve pas que la base est
   * vide, et une lecture unique laisserait la queue sans le moindre signal.
   */
  it("draine au-delà d'un lot plein", async () => {
    const audience = Array.from(
      { length: COMMENT_NOTIFICATION_RETRACTION_BATCH_SIZE + 5 },
      (_, index) => bothPaths(`n${index}`, POST_AUTHOR_ID, COMMENT_ID)
    );
    seed(audience);

    const count = await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(count).toBe(audience.length);
    expect(rows).toHaveLength(0);
    expect(runCommandRaw).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  it("s'arrête au premier lot INCOMPLET — pas de lecture de trop", async () => {
    seed([bothPaths('n1', POST_AUTHOR_ID, COMMENT_ID)]);

    await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(runCommandRaw).toHaveBeenCalledTimes(1);
  });

  it("ne supprime rien et n'annonce rien quand le commentaire n'a produit aucune ligne", async () => {
    seed([bothPaths('n-voisin', POST_AUTHOR_ID, OTHER_COMMENT_ID)]);

    const count = await retractCommentNotifications(prisma, [COMMENT_ID], announcer);

    expect(count).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  /**
   * Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
   * question qui n'a pas lieu d'être posée.
   */
  it('ne lit même pas la base quand la liste est vide', async () => {
    const count = await retractCommentNotifications(prisma, [], announcer);

    expect(count).toBe(0);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it("retire les lignes même sans annonceur branché", async () => {
    seed([bothPaths('n1', POST_AUTHOR_ID, COMMENT_ID)]);

    const count = await retractCommentNotifications(prisma, [COMMENT_ID], undefined);

    expect(count).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it("laisse remonter un échec Mongo — c'est l'appelant qui décide de l'absorber", async () => {
    runCommandRaw.mockRejectedValue(new Error('mongo down'));

    await expect(retractCommentNotifications(prisma, [COMMENT_ID], announcer)).rejects.toThrow(
      'mongo down'
    );
  });
});
