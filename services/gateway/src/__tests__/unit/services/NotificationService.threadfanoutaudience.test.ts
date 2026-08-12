/**
 * Le fan-out de commentaire ne pousse d'extrait qu'à l'audience ACTUELLE du post.
 *
 * `createStoryCommentNotificationsBatch` sert trois seaux. Deux sont des sorties
 * d'ÉNUMÉRATEUR — l'auteur, et les amis de l'auteur dépliés depuis son graphe :
 * leur appartenance à l'audience est vraie par construction. Le troisième ne
 * l'est pas. `previousCommenterIds` réunit les commentateurs antérieurs ET les
 * réacteurs du post : un ensemble ARBITRAIRE au regard de l'audience du moment.
 *
 * Ils ont engagé le post, donc ils y étaient admis À CE MOMENT-LÀ. Rien ne
 * garantit qu'ils le soient encore : une dés-amitié, ou une édition de
 * visibilité via `PUT /posts/:postId`, sort quelqu'un de l'audience sans toucher
 * à son commentaire — et un post PUBLIC passé en FRIENDS emporte d'un coup tous
 * ceux qui n'ont jamais été amis.
 *
 * Le `canSeePost` local ne consultait AUCUN graphe : sur `FRIENDS` comme sur
 * `EXCEPT` (hors liste noire) il rendait `true`. C'est exactement le trou que le
 * cycle 30 a fermé pour la notification UNITAIRE de la même population
 * (`comment_reply` → `canNotifyAboutPost`) ; le seau de fan-out l'avait gardé.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn(() => null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    postComment: { findMany: jest.fn() },
    postReaction: { findMany: jest.fn() },
    friendRequest: { findMany: jest.fn() },
    communityMember: { findMany: jest.fn() },
    participant: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() }));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const AUTHOR_ID = '507f1f77bcf86cd799439001';
const COMMENTER_ID = '507f1f77bcf86cd799439002';
const FRIEND_ID = '507f1f77bcf86cd799439003';
/** A commenté quand le post était ouvert ; n'est ami de personne aujourd'hui. */
const EX_ENGAGED_ID = '507f1f77bcf86cd799439004';
const DM_CONTACT_ID = '507f1f77bcf86cd799439005';
const DM_CONVERSATION_ID = '507f1f77bcf86cd7994390d1';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('NotificationService — le fan-out du fil suit l’audience ACTUELLE du post', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());

    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      username: 'actor',
      displayName: 'Actor',
      avatar: null,
    });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      type: 'story_thread_reply',
      isRead: false,
      createdAt: new Date(),
    });
    prisma.postReaction.findMany.mockResolvedValue([]);
    prisma.communityMember.findMany.mockResolvedValue([]);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: AUTHOR_ID, receiverId: FRIEND_ID },
    ]);
    // Un seul engagé antérieur, qui n'apparaît dans AUCUN lien d'amitié.
    prisma.postComment.findMany.mockResolvedValue([{ authorId: EX_ENGAGED_ID }]);
  });

  const notifiedUserIds = (): string[] =>
    (prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>).map(
      (call) => call[0].data.userId
    );

  const fanOut = (visibility: string, visibilityUserIds: string[] = []) =>
    service.createStoryCommentNotificationsBatch({
      postId: POST_ID,
      commentId: COMMENT_ID,
      storyAuthorId: AUTHOR_ID,
      commenterId: COMMENTER_ID,
      commentExcerpt: 'un extrait du fil',
      visibility,
      visibilityUserIds,
    });

  it('n’envoie PAS d’extrait à un engagé antérieur sorti de l’audience FRIENDS', async () => {
    await fanOut('FRIENDS');

    expect(notifiedUserIds()).not.toContain(EX_ENGAGED_ID);
  });

  it('n’envoie PAS d’extrait à un engagé antérieur non-ami sur un post EXCEPT', async () => {
    await fanOut('EXCEPT', ['someone-else']);

    expect(notifiedUserIds()).not.toContain(EX_ENGAGED_ID);
  });

  it('notifie toujours l’auteur et ses amis — les seaux d’énumérateur sont intacts', async () => {
    await fanOut('FRIENDS');

    expect(notifiedUserIds()).toEqual(expect.arrayContaining([AUTHOR_ID, FRIEND_ID]));
  });

  it('garde l’engagé antérieur qui est resté ami', async () => {
    prisma.postComment.findMany.mockResolvedValue([{ authorId: FRIEND_ID }]);

    await fanOut('FRIENDS');

    expect(notifiedUserIds()).toContain(FRIEND_ID);
  });

  it('garde l’engagé antérieur qui est un contact DM — l’audience de consommation', async () => {
    prisma.postComment.findMany.mockResolvedValue([{ authorId: DM_CONTACT_ID }]);
    prisma.participant.findMany.mockImplementation(async ({ where }: any) =>
      where?.userId === AUTHOR_ID
        ? [{ conversationId: DM_CONVERSATION_ID }]
        : ((where?.userId?.in as string[]) ?? [])
            .filter((id) => id === DM_CONTACT_ID)
            .map((id) => ({ userId: id }))
    );

    await fanOut('FRIENDS');

    expect(notifiedUserIds()).toContain(DM_CONTACT_ID);
  });

  it('n’envoie rien aux engagés antérieurs sur un post PUBLIC passé en PRIVATE', async () => {
    await fanOut('PRIVATE');

    expect(notifiedUserIds()).not.toContain(EX_ENGAGED_ID);
    expect(notifiedUserIds()).not.toContain(FRIEND_ID);
  });

  it('laisse passer un engagé antérieur quelconque sur un post PUBLIC', async () => {
    await fanOut('PUBLIC');

    expect(notifiedUserIds()).toContain(EX_ENGAGED_ID);
  });

  it('refuse l’engagé antérieur quand le graphe d’audience est illisible', async () => {
    prisma.friendRequest.findMany.mockImplementation(async ({ where }: any) => {
      // L'énumérateur d'amis de l'auteur répond ; l'intersection bornée du test
      // d'admission échoue. Seul le seau arbitraire doit en pâtir.
      if (where?.OR?.[0]?.receiverId?.in) throw new Error('mongo down');
      return [{ senderId: AUTHOR_ID, receiverId: FRIEND_ID }];
    });

    await fanOut('FRIENDS');

    expect(notifiedUserIds()).not.toContain(EX_ENGAGED_ID);
    expect(notifiedUserIds()).toContain(FRIEND_ID);
  });
});
