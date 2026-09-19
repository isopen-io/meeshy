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
 * ## Aucun double de MODULE ici, et c'est délibéré
 *
 * `filterPostConsumers` (`services/posts/postAudience.ts`) et
 * `filterMutedRecipients` (`./mutedRecipients`) sont pilotés par le DOUBLE
 * PRISMA, jamais par `jest.mock`. Deux raisons, la seconde mesurée :
 *
 *  1. un double de module remplacerait justement les collaborateurs dont on
 *     veut prouver qu'ils sont traversés — le témoin instruirait sa propre
 *     mise en scène ;
 *  2. sous le lanceur NATIF de bun (`bun test`, `bunfig.toml` du gateway),
 *     `jest.mock` devient `mock.module`, qui est GLOBAL AU PROCESSUS et ne se
 *     défait pas entre deux fichiers. Ce fichier était, mesuré le 2026-09-19,
 *     le SEUL du gateway à doubler ces deux modules : ses doubles fuyaient sur
 *     tous les fichiers joués après lui (76 échecs, `filterMutedRecipients`
 *     rendant `undefined` au fond de `fanout/member-joined.ts`).
 *
 * `filterPostConsumers` sur un post `PUBLIC` rend ses candidats sans toucher
 * Prisma ; `filterMutedRecipients` ne lit que
 * `prisma.userConversationPreferences.findMany` — les deux se pilotent donc
 * entièrement depuis le double d'instance, qui ne fuit nulle part.
 *
 * @jest-environment node
 */

import { NotificationService } from '../NotificationService';

const AUTHOR_ID = 'author-1';
const FRIEND_1 = 'friend-1';
const FRIEND_2 = 'friend-2';
const POST_ID = 'post-1';

type PrismaDouble = {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  friendRequest: { findMany: jest.Mock };
  notification: { create: jest.Mock };
  conversation: { findUnique: jest.Mock };
  participant: { count: jest.Mock };
  userConversationPreferences: { findMany: jest.Mock };
};

function makePrisma(): PrismaDouble {
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
    // Aucune ligne de sourdine par défaut : tout le monde écoute.
    userConversationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const asClient = (prisma: PrismaDouble): ConstructorParameters<typeof NotificationService>[0] =>
  prisma as unknown as ConstructorParameters<typeof NotificationService>[0];

describe("les éventails passent par les méthodes de l'instance, résolues à l'appel (#7093)", () => {
  it("createFriendContentNotificationsBatch appelle le createNotification de l'instance, même remplacé après construction", async () => {
    const prisma = makePrisma();
    const service = new NotificationService(asClient(prisma));
    const spy = jest.spyOn(service, 'createNotification').mockResolvedValue(null);

    await service.createFriendContentNotificationsBatch({
      postId: POST_ID,
      authorId: AUTHOR_ID,
      contentType: 'POST',
      visibility: 'PUBLIC',
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("createCommentMentionNotificationsBatch honore l'anti-spam de l'instance", async () => {
    const prisma = makePrisma();
    const service = new NotificationService(asClient(prisma));
    const spy = jest.spyOn(service, 'createNotification').mockResolvedValue(null);

    (service as unknown as { recentMentions: Map<string, number[]> }).recentMentions.set(
      'commenter:u1',
      Array(5).fill(Date.now())
    );

    // `PUBLIC` ⇒ `filterPostConsumers` rend ses candidats tels quels, sans
    // requête : l'audience est donc ['u1', 'u2'], et seul l'anti-spam trie.
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
    const service = new NotificationService(asClient(prisma));
    const spy = jest.spyOn(service, 'createNotification').mockResolvedValue(null);

    // Une ligne de sourdine pour ce destinataire ⇒ `filterMutedRecipients` le
    // retire ⇒ `isConversationMutedFor` rend `true`.
    prisma.userConversationPreferences.findMany.mockResolvedValueOnce([{ userId: 'recipient-1' }]);
    const mutedResult = await service.createMemberJoinedNotification({
      recipientUserId: 'recipient-1',
      newMemberUserId: 'new-member-1',
      conversationId: 'conv-1',
    });
    expect(mutedResult).toBeNull();
    expect(spy).not.toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValueOnce({
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
