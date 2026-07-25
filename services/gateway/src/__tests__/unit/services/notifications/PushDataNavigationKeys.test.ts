/**
 * Clés de navigation dans le `data` des pushes sociaux (2026-07-21).
 *
 * Le handler iOS (lane N-iOS) lit défensivement :
 *  - `data.commentId`       → commentaire DÉCLENCHEUR (absent → commentaire racine)
 *  - `data.friendRequestId` → requête d'ami (absent → résolution via receivedRequests)
 *
 * Le gateway doit donc garantir que ces clés voyagent dans le `data` du push
 * pour les producteurs sociaux :
 *  - post_comment / comment_reply           → commentId du commentaire créé
 *  - story_new_comment / story_thread_reply
 *    / friend_story_comment (fan-out batch) → commentId du commentaire créé
 *  - friend_request                         → friendRequestId
 *
 * Le `data` est un Record<string,string> (contrainte APNs/FCM) : les clés sont
 * TOUJOURS présentes, chaîne vide quand non applicables.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const ACTOR_ID = '507f1f77bcf86cd799439011';
const RECIPIENT_ID = '507f1f77bcf86cd799439012';
const PREV_COMMENTER_ID = '507f1f77bcf86cd799439013';
const FRIEND_ID = '507f1f77bcf86cd799439014';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const FRIEND_REQUEST_ID = 'cccccccccccccccccccccccc';

const makePrismaMock = () => ({
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_emitted', ...args.data })),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  message: { findUnique: jest.fn() },
  postComment: { findMany: jest.fn().mockResolvedValue([]) },
  postReaction: { findMany: jest.fn().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
}) as any;

type PushCall = { userId: string; payload: { data: Record<string, string> } };

describe('Push data — clés de navigation commentId / friendRequestId', () => {
  let prisma: any;
  let sendToUser: jest.Mock;
  let service: NotificationService;

  const pushCalls = (): PushCall[] => sendToUser.mock.calls.map((c: any[]) => c[0]);
  const pushDataOfType = (type: string): Record<string, string> | undefined =>
    pushCalls().map((c) => c.payload.data).find((d) => d.type === type);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrismaMock();
    service = new NotificationService(prisma);
    sendToUser = jest.fn().mockResolvedValue(undefined);
    service.setPushNotificationService({ sendToUser } as any);

    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id === ACTOR_ID
          ? { username: 'bob', displayName: 'Bob Commentateur', avatar: null }
          : { username: 'alice', displayName: 'Alice Autrice', avatar: null }
      )
    );
  });

  it('test_createPostCommentNotification_push_dataCarriesTriggeringCommentId', async () => {
    await service.createPostCommentNotification({
      actorId: ACTOR_ID,
      postId: POST_ID,
      postAuthorId: RECIPIENT_ID,
      commentId: COMMENT_ID,
      commentPreview: 'Trop drôle !',
      postType: 'POST',
    });

    const data = pushDataOfType('post_comment');
    expect(data).toBeDefined();
    expect(data!.commentId).toBe(COMMENT_ID);
    expect(data!.postId).toBe(POST_ID);
  });

  it('test_createPostCommentNotification_push_friendRequestIdIsEmptyString', async () => {
    await service.createPostCommentNotification({
      actorId: ACTOR_ID,
      postId: POST_ID,
      postAuthorId: RECIPIENT_ID,
      commentId: COMMENT_ID,
      commentPreview: 'Trop drôle !',
    });

    expect(pushDataOfType('post_comment')!.friendRequestId).toBe('');
  });

  it('test_createCommentReplyNotification_push_dataCarriesTriggeringCommentId', async () => {
    await service.createCommentReplyNotification({
      actorId: ACTOR_ID,
      postId: POST_ID,
      commentAuthorId: RECIPIENT_ID,
      commentId: COMMENT_ID,
      replyPreview: 'Complètement d’accord',
      parentCommentPreview: 'Quel beau voyage',
    });

    const data = pushDataOfType('comment_reply');
    expect(data).toBeDefined();
    expect(data!.commentId).toBe(COMMENT_ID);
    expect(data!.postId).toBe(POST_ID);
  });

  it('test_createStoryCommentNotificationsBatch_allBuckets_dataCarriesTriggeringCommentId', async () => {
    prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_ID }]);
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: RECIPIENT_ID, receiverId: FRIEND_ID },
    ]);

    await service.createStoryCommentNotificationsBatch({
      postId: POST_ID,
      commentId: COMMENT_ID,
      storyAuthorId: RECIPIENT_ID,
      commenterId: ACTOR_ID,
      commentExcerpt: 'Magnifique coucher de soleil',
      postType: 'STORY',
    });

    const byType = {
      story_new_comment: pushDataOfType('story_new_comment'),
      story_thread_reply: pushDataOfType('story_thread_reply'),
      friend_story_comment: pushDataOfType('friend_story_comment'),
    };

    expect(byType.story_new_comment).toBeDefined();
    expect(byType.story_thread_reply).toBeDefined();
    expect(byType.friend_story_comment).toBeDefined();
    for (const data of Object.values(byType)) {
      expect(data!.commentId).toBe(COMMENT_ID);
      expect(data!.postId).toBe(POST_ID);
    }
  });

  it('test_createFriendRequestNotification_push_dataCarriesFriendRequestId', async () => {
    await service.createFriendRequestNotification({
      recipientUserId: RECIPIENT_ID,
      requesterId: ACTOR_ID,
      friendRequestId: FRIEND_REQUEST_ID,
    });

    const data = pushDataOfType('friend_request');
    expect(data).toBeDefined();
    expect(data!.friendRequestId).toBe(FRIEND_REQUEST_ID);
  });

  it('test_createFriendRequestNotification_push_commentIdIsEmptyString', async () => {
    await service.createFriendRequestNotification({
      recipientUserId: RECIPIENT_ID,
      requesterId: ACTOR_ID,
      friendRequestId: FRIEND_REQUEST_ID,
    });

    expect(pushDataOfType('friend_request')!.commentId).toBe('');
  });
});
