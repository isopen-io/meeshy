/**
 * Les éventails passent par les méthodes de l'INSTANCE, résolues à l'appel —
 * jamais par une copie capturée dans le constructeur.
 *
 * Le risque propre au patron « fonctions qui reçoivent `{ prisma,
 * createNotification, … }` en options » (#7093) : construire l'objet de
 * dépendances UNE fois dans le constructeur capturerait la méthode D'ORIGINE,
 * et les 106 suites qui font `jest.spyOn(service, 'createNotification')` après
 * `new NotificationService(prisma)` cesseraient d'observer — en VERT, puisque
 * la vraie méthode tournerait quand même. `fanoutDependencies()` doit donc
 * fermer sur `this` à CHAQUE appel.
 *
 * Écrit AVANT le découpage : ROUGE tant que `fanoutDependencies()` n'existe pas
 * / que les éventails ne délèguent pas à l'instance à l'appel.
 *
 * @jest-environment node
 */

jest.mock('../../posts/postAudience', () => ({
  filterPostConsumers: jest.fn(),
}));

jest.mock('../mutedRecipients', () => ({
  filterMutedRecipients: jest.fn(),
}));

import { NotificationService } from '../NotificationService';
import { filterPostConsumers } from '../../posts/postAudience';
import { filterMutedRecipients } from '../mutedRecipients';

const AUTHOR_ID = 'author-1';
const FRIEND_1 = 'friend-1';
const FRIEND_2 = 'friend-2';
const POST_ID = 'post-1';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ username: 'author', displayName: 'Author', avatar: null }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    friendRequest: {
      findMany: jest.fn().mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
        { senderId: AUTHOR_ID, receiverId: FRIEND_2 },
      ]),
    },
    notification: {
      create: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn().mockResolvedValue({ title: 'Groupe', type: 'group' }),
    },
    participant: {
      count: jest.fn().mockResolvedValue(3),
    },
  } as unknown as ConstructorParameters<typeof NotificationService>[0];
}

describe("les éventails passent par les méthodes de l'instance, résolues à l'appel (#7093)", () => {
  it("createFriendContentNotificationsBatch appelle le createNotification de l'instance, même remplacé après construction", async () => {
    const prisma = makePrisma();
    const service = new NotificationService(prisma);
    const spy = jest.spyOn(service, 'createNotification').mockResolvedValue(null);

    await service.createFriendContentNotificationsBatch({
      postId: POST_ID,
      authorId: AUTHOR_ID,
      contentType: 'POST',
      visibility: 'PUBLIC',
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect((prisma as unknown as { notification: { create: jest.Mock } }).notification.create)
      .not.toHaveBeenCalled();
  });

  it("createCommentMentionNotificationsBatch honore l'anti-spam de l'instance", async () => {
    const prisma = makePrisma();
    const service = new NotificationService(prisma);
    const spy = jest.spyOn(service, 'createNotification').mockResolvedValue(null);

    (service as unknown as { recentMentions: Map<string, number[]> }).recentMentions.set(
      'commenter:u1',
      Array(5).fill(Date.now())
    );

    (filterPostConsumers as jest.Mock).mockResolvedValue(['u1', 'u2']);

    await service.createCommentMentionNotificationsBatch({
      commentId: 'comment-1',
      postId: POST_ID,
      commenterId: 'commenter',
      mentionedUserIds: ['u1', 'u2'],
      postAuthorId: AUTHOR_ID,
      visibility: 'PUBLIC',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ userId: 'u2' });
  });

  it("createMemberJoinedNotification honore isConversationMutedFor de l'instance", async () => {
    const prisma = makePrisma();
    const service = new NotificationService(prisma);
    const spy = jest.spyOn(service, 'createNotification').mockResolvedValue(null);

    (filterMutedRecipients as jest.Mock).mockResolvedValueOnce([]);
    const mutedResult = await service.createMemberJoinedNotification({
      recipientUserId: 'recipient-1',
      newMemberUserId: 'new-member-1',
      conversationId: 'conv-1',
    });
    expect(mutedResult).toBeNull();
    expect(spy).not.toHaveBeenCalled();

    (filterMutedRecipients as jest.Mock).mockResolvedValueOnce(['recipient-1']);
    (prisma as unknown as { user: { findUnique: jest.Mock } }).user.findUnique.mockResolvedValueOnce({
      username: 'new_member',
      displayName: 'New Member',
      avatar: null,
    });
    await service.createMemberJoinedNotification({
      recipientUserId: 'recipient-1',
      newMemberUserId: 'new-member-1',
      conversationId: 'conv-1',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
