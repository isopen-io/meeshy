/**
 * Les notifications qu'un post a produites, retirées avec lui.
 *
 * Jumeau de `retractMessageNotifications`, et c'est la DIFFÉRENCE qui structure
 * cette suite : un message rappelé retire les lignes d'une poignée de
 * destinataires nommés par une colonne (`Notification.messageId`) ; un post
 * retiré en retire d'une AUDIENCE — auteur, commentateurs, amis prévenus de la
 * publication — et aucune colonne ne les porte. Le lien vit dans le blob JSON
 * `context.postId`, que Prisma ne sait pas filtrer sur MongoDB.
 *
 * Deux conséquences, et les deux témoins centraux de cette suite :
 *
 *  1. **Chaque ligne repart vers SON destinataire.** Le double rend des
 *     `userId` tous différents ; un retrait qui les confondrait (ou qui
 *     rabattrait tout le monde sur le premier) adresserait
 *     `notification:deleted` à des appareils qui n'ont jamais eu la ligne, et
 *     laisserait les vrais destinataires avec une entrée fantôme.
 *  2. **Le lot n'est pas la fin.** L'audience d'un post dépasse la taille d'un
 *     batch bien plus vite que celle d'un message ; une lecture unique
 *     laisserait la queue en base sans que rien ne le signale.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import {
  retractPostNotifications,
  POST_NOTIFICATION_RETRACTION_BATCH_SIZE,
} from '../retractPostNotifications';

const POST_ID = '507f1f77bcf86cd799439011';
const OTHER_POST_ID = '507f1f77bcf86cd799439012';
const REPOST_ID = '507f1f77bcf86cd799439013';
const OTHER_REPOST_ID = '507f1f77bcf86cd799439014';

const AUTHOR_ID = '64a000000000000000000001';
const COMMENTER_ID = '64a000000000000000000002';
const FRIEND_ID = '64a000000000000000000003';

interface NotificationRow {
  readonly id: string;
  readonly userId: string;
  readonly postId: string | null;
  /** `metadata.repostId` — posé par `post_repost` seulement. */
  readonly repostId?: string;
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

/** `{ '<chemin>': { $in } }` → la valeur de la ligne sous ce chemin est dans `$in`. */
function matchesClause(row: NotificationRow, clause: Record<string, { $in?: string[] }>): boolean {
  return Object.entries(clause).every(([path, predicate]) => {
    const value = path === 'context.postId' ? row.postId : path === 'metadata.repostId' ? row.repostId : undefined;
    return value != null && (predicate.$in ?? []).includes(value);
  });
}

/**
 * Le double APPLIQUE le filtre reçu, et rend l'Extended JSON de Mongo.
 *
 * `_id` ET `userId` arrivent en `{ $oid }` — c'est la forme réelle d'une
 * commande brute, et la seule qui prouve que le retrait normalise les deux.
 * Un double qui rendrait des `string` laisserait passer un code qui adresse
 * `user:[object Object]`.
 *
 * `filter` non reconnu ⇒ AUCUNE contrainte (sémantique Mongo), pour qu'une
 * garde absente en production se voie comme un retrait TROP LARGE et non
 * comme un no-op silencieux. Le filtre attendu est un `$or` de clauses `$in`
 * (`context.postId`, `metadata.repostId`) : une ligne matche dès qu'une
 * clause la matche.
 */
function seed(seeded: NotificationRow[]): void {
  rows = [...seeded];
  runCommandRaw.mockImplementation(async (command: any) => {
    const clauses: Array<Record<string, { $in?: string[] }>> | undefined = command?.filter?.$or;
    const matched = rows.filter(
      (row) => clauses === undefined || clauses.some((clause) => matchesClause(row, clause))
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

function notification(id: string, userId: string, postId: string | null): NotificationRow {
  return { id, userId, postId };
}

/** La ligne `post_repost` : `context.postId` = l'ORIGINAL, `metadata.repostId` = le repost. */
function repostNotification(id: string, userId: string, originalPostId: string, repostId: string): NotificationRow {
  return { id, userId, postId: originalPostId, repostId };
}

beforeEach(() => {
  jest.clearAllMocks();
  announceNotificationsRetracted.mockResolvedValue(undefined);
  seed([]);
});

describe('retractPostNotifications', () => {
  /**
   * Deux chemins, parce qu'une ligne `post_repost` nomme le post sous DEUX
   * clés : `context.postId` porte l'ORIGINAL (c'est lui qu'elle ouvre), et
   * `metadata.repostId` le repost qui l'a produite. Supprimer le repost doit
   * la retirer — et seul le second chemin le sait.
   */
  it('lit par les deux chemins JSON qui nomment un post — context.postId et metadata.repostId', async () => {
    seed([notification('n1', AUTHOR_ID, POST_ID)]);

    await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        find: 'Notification',
        filter: {
          $or: [
            { 'context.postId': { $in: [POST_ID] } },
            { 'metadata.repostId': { $in: [POST_ID] } },
          ],
        },
        projection: { _id: 1, userId: 1, 'delivery.pushSent': 1 },
      })
    );
  });

  it('retire la post_repost de l’auteur original quand c’est le REPOST qui est supprimé', async () => {
    seed([
      repostNotification('n-repost', AUTHOR_ID, POST_ID, REPOST_ID),
      repostNotification('n-autre-repost', AUTHOR_ID, POST_ID, OTHER_REPOST_ID),
      notification('n-like-original', AUTHOR_ID, POST_ID),
    ]);

    const count = await retractPostNotifications(prisma, [REPOST_ID], announcer);

    expect(count).toBe(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n-repost'] } } });
    expect(rows.map((row) => row.id)).toEqual(['n-autre-repost', 'n-like-original']);
  });

  it('retire les lignes de TOUTE l\'audience et annonce chacune à SON destinataire', async () => {
    seed([
      notification('n-auteur', AUTHOR_ID, POST_ID),
      notification('n-commentaire', COMMENTER_ID, POST_ID),
      notification('n-ami', FRIEND_ID, POST_ID),
    ]);

    const count = await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(count).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-auteur', 'n-commentaire', 'n-ami'] } },
    });
    expect(announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n-auteur', userId: AUTHOR_ID, pushSent: true },
      { id: 'n-commentaire', userId: COMMENTER_ID, pushSent: true },
      { id: 'n-ami', userId: FRIEND_ID, pushSent: true },
    ]);
  });

  it('ne touche pas les notifications d\'un AUTRE post', async () => {
    seed([
      notification('n-cible', AUTHOR_ID, POST_ID),
      notification('n-voisin', AUTHOR_ID, OTHER_POST_ID),
      notification('n-hors-post', AUTHOR_ID, null),
    ]);

    await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n-cible'] } } });
    expect(rows.map((row) => row.id)).toEqual(['n-voisin', 'n-hors-post']);
  });

  it('annonce APRÈS l\'écriture durable — les compteurs voient la base d\'après le retrait', async () => {
    seed([notification('n1', AUTHOR_ID, POST_ID)]);
    const order: string[] = [];
    deleteMany.mockImplementation(async () => {
      order.push('delete');
      return { count: 1 };
    });
    announceNotificationsRetracted.mockImplementation(async () => {
      order.push('announce');
    });

    await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(order).toEqual(['delete', 'announce']);
  });

  /**
   * Le témoin de la deuxième différence avec le jumeau message : un lot PLEIN
   * ne prouve pas que la base est vide. Sans reprise, la queue resterait en
   * base — et sans le moindre signal, puisque le premier lot, lui, a réussi.
   */
  it('draine au-delà d\'un lot plein', async () => {
    const audience = Array.from(
      { length: POST_NOTIFICATION_RETRACTION_BATCH_SIZE + 7 },
      (_, index) => notification(`n${index}`, AUTHOR_ID, POST_ID)
    );
    seed(audience);

    const count = await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(count).toBe(audience.length);
    expect(rows).toHaveLength(0);
    expect(runCommandRaw).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  it('s\'arrête au premier lot INCOMPLET — pas de lecture de trop', async () => {
    seed([notification('n1', AUTHOR_ID, POST_ID)]);

    await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(runCommandRaw).toHaveBeenCalledTimes(1);
  });

  it('ne supprime rien et n\'annonce rien quand le post n\'a produit aucune ligne', async () => {
    seed([notification('n-voisin', AUTHOR_ID, OTHER_POST_ID)]);

    const count = await retractPostNotifications(prisma, [POST_ID], announcer);

    expect(count).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  /**
   * L'écriture durable ne dépend pas du câblage socket : le port est optionnel
   * exactement comme celui du rappel de message, parce qu'un processus sans
   * `io` (worker, test, script) doit tout de même retirer les lignes.
   */
  it('retire les lignes même sans annonceur branché', async () => {
    seed([notification('n1', AUTHOR_ID, POST_ID)]);

    const count = await retractPostNotifications(prisma, [POST_ID], undefined);

    expect(count).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it('laisse remonter un échec Mongo — c\'est la liste d\'effets qui décide de l\'absorber', async () => {
    runCommandRaw.mockRejectedValue(new Error('mongo down'));

    await expect(retractPostNotifications(prisma, [POST_ID], announcer)).rejects.toThrow('mongo down');
  });

  /**
   * Le balayage des stories expirées retire une FOURNÉE de posts d'un coup —
   * stories du jour ∪ leurs reposts. Un retrait post par post ferait autant de
   * lectures que de posts là où un seul `$in` les couvre ; surtout, il
   * n'énoncerait plus la règle au bon niveau : ce qui part ensemble se retire
   * ensemble.
   */
  it('couvre plusieurs posts en une seule lecture', async () => {
    seed([
      notification('n-story', AUTHOR_ID, POST_ID),
      notification('n-repost', FRIEND_ID, OTHER_POST_ID),
    ]);

    const count = await retractPostNotifications(prisma, [POST_ID, OTHER_POST_ID], announcer);

    expect(count).toBe(2);
    expect(runCommandRaw).toHaveBeenCalledTimes(1);
    expect(runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          $or: [
            { 'context.postId': { $in: [POST_ID, OTHER_POST_ID] } },
            { 'metadata.repostId': { $in: [POST_ID, OTHER_POST_ID] } },
          ],
        },
      })
    );
    expect(rows).toHaveLength(0);
  });

  /**
   * Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
   * question qui n'a pas lieu d'être posée. Le balayage horaire tombe sur ce
   * cas à chaque passe où rien n'a expiré, c'est-à-dire la plupart du temps.
   */
  it('ne pose aucune question quand la liste est vide', async () => {
    seed([notification('n1', AUTHOR_ID, POST_ID)]);

    const count = await retractPostNotifications(prisma, [], announcer);

    expect(count).toBe(0);
    expect(runCommandRaw).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  /**
   * Le plafond de drainage REJETTE, il n'avertit plus.
   *
   * Tant que l'entrée était UN post, le plafond ne bornait aucune audience
   * réaliste et un avertissement suffisait. L'entrée du balayage, elle, n'est
   * pas bornée : c'est une heure d'expirations de toute la plateforme. Un
   * plafond atteint en silence laisserait l'appelant supprimer les posts —
   * et les lignes restantes n'auraient alors plus AUCUN chemin de retrait,
   * puisque la passe suivante ne verra plus les posts.
   *
   * En rejetant, le retrait rend la reprise possible : l'appelant renonce à
   * supprimer cette heure-ci, et la passe suivante reprend un drainage qui a
   * déjà progressé (les lots lus ont bien été supprimés).
   */
  it('REJETTE quand le drainage n\'aboutit pas — l\'appelant doit pouvoir renoncer', async () => {
    runCommandRaw.mockImplementation(async () => ({
      cursor: {
        firstBatch: Array.from(
          { length: POST_NOTIFICATION_RETRACTION_BATCH_SIZE },
          (_, index) => ({ _id: { $oid: `n${index}` }, userId: { $oid: AUTHOR_ID }, delivery: { pushSent: true } })
        ),
      },
    }));
    deleteMany.mockResolvedValue({ count: POST_NOTIFICATION_RETRACTION_BATCH_SIZE });

    await expect(retractPostNotifications(prisma, [POST_ID], announcer)).rejects.toThrow(
      /drainage/i
    );
  });
});
