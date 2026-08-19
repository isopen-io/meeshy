/**
 * Retirer les notifications qu'une référence retirée avait produites.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { retractMentionNotifications } from '../../../../services/posts/retractMentionNotifications';

function makePrisma(deleted = 1) {
  return {
    notification: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: deleted }),
    },
  } as any;
}

describe('retractMentionNotifications', () => {
  it('ne touche à rien quand personne n\'est parti', async () => {
    const prisma = makePrisma();
    await retractMentionNotifications({ prisma, postId: 'post-1', departedUserIds: [] });
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  it('retire les user_mentioned des seuls partants, sur les DEUX chemins JSON', async () => {
    const prisma = makePrisma();
    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob', 'u-carol'],
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['u-bob', 'u-carol'] },
        type: { in: ['user_mentioned', 'mention'] },
        OR: [
          { context: { path: ['postId'], equals: 'post-1' } },
          { metadata: { path: ['postId'], equals: 'post-1' } },
        ],
      },
    });
  });

  it('ne lève jamais — une notification survivante ne doit pas défaire une édition', async () => {
    const prisma = {
      notification: {
        deleteMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      },
    } as any;
    const onError = jest.fn();

    await expect(
      retractMentionNotifications({ prisma, postId: 'post-1', departedUserIds: ['u-bob'], onError })
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });
});
