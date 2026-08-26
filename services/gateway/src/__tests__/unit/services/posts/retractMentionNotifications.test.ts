/**
 * Retirer les notifications qu'une référence retirée avait produites.
 *
 * L'invariant de la famille (retractPostNotifications, retractCommentNotifications) :
 * la suppression porte sur les ids RELUS, et aucune ligne ne disparaît sans son
 * `notification:deleted`. Sans l'annonce, l'appareil du référencé garde la ligne
 * et son badge non-lu, et le tap mène à un contenu qu'il n'a plus le droit
 * d'ouvrir.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { retractMentionNotifications } from '../../../../services/posts/retractMentionNotifications';

/**
 * `delivery` fait partie de la relecture : la révocation push ne réveille un
 * appareil que là où un push nominal est parti (`retractedNotificationOf`).
 */
const ROWS = [
  { id: 'n-1', userId: 'u-bob', delivery: { pushSent: true } },
  { id: 'n-2', userId: 'u-carol', delivery: { pushSent: false } },
];

const ANNOUNCED = [
  { id: 'n-1', userId: 'u-bob', pushSent: true },
  { id: 'n-2', userId: 'u-carol', pushSent: false },
];

function makePrisma(rows: ReadonlyArray<{ id: string; userId: string; delivery?: unknown }> = ROWS) {
  return {
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([...rows]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: rows.length }),
    },
  } as any;
}

function makeAnnouncer() {
  return { announceNotificationsRetracted: jest.fn<any>().mockResolvedValue(undefined) };
}

describe('retractMentionNotifications', () => {
  it('ne touche à rien quand personne n\'est parti', async () => {
    const prisma = makePrisma();
    const announcer = makeAnnouncer();

    await retractMentionNotifications({ prisma, postId: 'post-1', departedUserIds: [], announcer });

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
    expect(announcer.announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  it('relit les user_mentioned des seuls partants, sur les DEUX chemins JSON', async () => {
    const prisma = makePrisma();

    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob', 'u-carol'], announcer: makeAnnouncer(),
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['u-bob', 'u-carol'] },
        type: { in: ['user_mentioned', 'mention'] },
        OR: [
          { context: { path: ['postId'], equals: 'post-1' } },
          { metadata: { path: ['postId'], equals: 'post-1' } },
        ],
      },
      select: { id: true, userId: true, delivery: true },
    });
  });

  it('supprime les ids RELUS, jamais le prédicat — l\'annoncé et le supprimé sont le même ensemble', async () => {
    const prisma = makePrisma();

    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob', 'u-carol'], announcer: makeAnnouncer(),
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-1', 'n-2'] } },
    });
  });

  it('annonce chaque ligne retirée, APRÈS l\'écriture durable', async () => {
    const prisma = makePrisma();
    const announcer = makeAnnouncer();

    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob', 'u-carol'], announcer,
    });

    expect(announcer.announceNotificationsRetracted).toHaveBeenCalledWith(ANNOUNCED);
    // Les compteurs que l'annonce recalcule doivent voir la base d'APRÈS le retrait.
    const deleted = prisma.notification.deleteMany.mock.invocationCallOrder[0];
    const announced = announcer.announceNotificationsRetracted.mock.invocationCallOrder[0];
    expect(announced).toBeGreaterThan(deleted);
  });

  it('ne supprime ni n\'annonce quand la relecture ne rend rien', async () => {
    const prisma = makePrisma([]);
    const announcer = makeAnnouncer();

    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob'], announcer,
    });

    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
    expect(announcer.announceNotificationsRetracted).not.toHaveBeenCalled();
  });

  it('retire les lignes même sans annonceur câblé — un worker hors serveur n\'émet rien', async () => {
    const prisma = makePrisma();

    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob'], announcer: undefined,
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-1', 'n-2'] } },
    });
  });

  it('ne lève jamais — une notification survivante ne doit pas défaire une édition', async () => {
    const prisma = {
      notification: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    } as any;
    const onError = jest.fn();

    await expect(
      retractMentionNotifications({
        prisma, postId: 'post-1', departedUserIds: ['u-bob'], announcer: makeAnnouncer(), onError,
      })
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });
});
