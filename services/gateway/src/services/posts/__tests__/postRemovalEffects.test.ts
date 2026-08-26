/**
 * La liste des effets DURABLES d'un retrait de post — et le quatrième, qui y
 * manquait.
 *
 * `applyPostRemovalEffects` existe précisément parce que la console a rattrapé
 * un par un, à trois cycles d'intervalle, ce que le service faisait et qu'elle
 * ne faisait pas. La liste a nommé l'audit, les liens de partage et les usages
 * de sons. Elle n'a jamais nommé les NOTIFICATIONS, alors que le jumeau côté
 * message (`applyMessageRemovalEffects`) les retire depuis le cycle 47 : le
 * retrait d'un post est doux (`deletedAt`), donc aucune cascade ne se
 * déclenche, et chaque `post_comment` / `comment_reply` / `friend_new_story` /
 * `friend_new_post` survit avec sa copie dénormalisée du contenu retiré — une
 * ligne qui ne montre plus rien et dont le `action: view_post` n'ouvre qu'un
 * écran 404.
 *
 * Cette suite verrouille les deux moitiés : que le quatrième effet soit bien
 * dans la liste, et qu'il y soit sous le même régime BEST-EFFORT que les trois
 * autres — quand ceci s'exécute, `deletedAt` est déjà committé, et rien ne doit
 * transformer une suppression réussie en 500.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { applyPostRemovalEffects } from '../postRemovalEffects';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '64a000000000000000000001';
const MODERATOR_ID = '64a000000000000000000002';
const RECIPIENT_ID = '64a000000000000000000003';

const auditCreate = jest.fn<any>();
const trackingLinkUpdateMany = jest.fn<any>();
const notificationDeleteMany = jest.fn<any>();
const runCommandRaw = jest.fn<any>();
const releasePost = jest.fn<any>();
const announceNotificationsRetracted = jest.fn<any>();

const prisma = {
  adminAuditLog: { create: auditCreate },
  trackingLink: { updateMany: trackingLinkUpdateMany },
  notification: { deleteMany: notificationDeleteMany },
  $runCommandRaw: runCommandRaw,
} as any;

const soundCapture = { releasePost } as any;
const announcer = { announceNotificationsRetracted } as any;

const removedPost = { id: POST_ID, authorId: AUTHOR_ID, type: 'STORY' };

function rawFind(ids: readonly string[]) {
  return {
    cursor: {
      firstBatch: ids.map((id) => ({
        _id: { $oid: id },
        userId: { $oid: RECIPIENT_ID },
        delivery: { pushSent: true },
      })),
      id: 0,
      ns: 'meeshy.Notification',
    },
    ok: 1,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  auditCreate.mockResolvedValue({});
  trackingLinkUpdateMany.mockResolvedValue({ count: 0 });
  notificationDeleteMany.mockResolvedValue({ count: 0 });
  releasePost.mockResolvedValue(undefined);
  announceNotificationsRetracted.mockResolvedValue(undefined);
  runCommandRaw.mockResolvedValue(rawFind([]));
});

describe('applyPostRemovalEffects — retrait des notifications du post', () => {
  it('retire les notifications que le post a produites', async () => {
    runCommandRaw.mockResolvedValueOnce(rawFind(['n1', 'n2']));

    await applyPostRemovalEffects(prisma, removedPost, { id: AUTHOR_ID }, soundCapture, announcer);

    expect(runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          $or: [
            { 'context.postId': { $in: [POST_ID] } },
            { 'metadata.repostId': { $in: [POST_ID] } },
          ],
        },
      })
    );
    expect(notificationDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n2'] } } });
    expect(announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n1', userId: RECIPIENT_ID, pushSent: true },
      { id: 'n2', userId: RECIPIENT_ID, pushSent: true },
    ]);
  });

  /**
   * Le même régime que les trois effets déjà listés : `deletedAt` est committé
   * avant d'arriver ici. Un retrait de notifications qui échoue ne doit ni
   * rejeter, ni emporter les effets suivants.
   */
  it('n\'emporte ni la suppression ni les autres effets quand le retrait échoue', async () => {
    runCommandRaw.mockRejectedValue(new Error('mongo down'));

    await expect(
      applyPostRemovalEffects(prisma, removedPost, { id: MODERATOR_ID, reason: 'spam' }, soundCapture, announcer)
    ).resolves.toBeUndefined();

    expect(auditCreate).toHaveBeenCalled();
    expect(trackingLinkUpdateMany).toHaveBeenCalledWith({
      where: { targetId: { in: [POST_ID] } },
      data: { isActive: false },
    });
    expect(releasePost).toHaveBeenCalledWith(POST_ID);
  });

  it('applique les trois effets historiques inchangés', async () => {
    await applyPostRemovalEffects(prisma, removedPost, { id: MODERATOR_ID, reason: 'spam' }, soundCapture, announcer);

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: AUTHOR_ID,
        adminId: MODERATOR_ID,
        action: 'DELETE_POST',
        entity: 'Post',
        entityId: POST_ID,
      }),
    });
    expect(trackingLinkUpdateMany).toHaveBeenCalled();
    expect(releasePost).toHaveBeenCalledWith(POST_ID);
  });
});
