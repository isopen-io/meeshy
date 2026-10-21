/**
 * **L'arrivée d'un membre NOMME la conversation où il arrive** (#10299,
 * directive porteur 2026-10-12 : « préciser dans quelle conversation
 * exactement, comme quand on réagit ou reçoit un message dans un groupe »).
 *
 * Avant ce lot, l'éventail posait `content: 'Nouveau membre'` — en français
 * pour tout le monde, sans le nom du groupe — et aucun titre : la bannière
 * disait « Newbie · Nouveau membre ». Le corps de push est le SEUL texte que
 * les trois plateformes rendent (FCM et WebPush n'ont pas de sous-titre) :
 * c'est donc lui qui doit nommer la conversation, dans la langue du LECTEUR.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s ?? ''),
    sanitizeUsername: jest.fn((s: string) => s ?? ''),
    sanitizeURL: jest.fn((s: string) => s ?? null),
    sanitizeJSON: jest.fn((x: unknown) => x),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    conversation: { findUnique: jest.fn() },
    participant: { count: jest.fn(), findMany: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../../services/notifications/NotificationService';

const CONV_ID = '507f1f77bcf86cd799439011';
const NEW_MEMBER_ID = '507f1f77bcf86cd799439022';
const MEMBER_FR = '507f1f77bcf86cd799439033';
const MEMBER_EN = '507f1f77bcf86cd799439044';

const COMMON = { newMemberUserId: NEW_MEMBER_ID, conversationId: CONV_ID, joinMethod: 'via_link' as const };

const LANGS: Record<string, string> = { [MEMBER_FR]: 'fr', [MEMBER_EN]: 'en' };

describe('member_joined nomme la conversation (#10299)', () => {
  let service: NotificationService;
  let prisma: any;
  let sendToUser: jest.Mock<(args: any) => Promise<unknown[]>>;

  const pushFor = (userId: string) =>
    sendToUser.mock.calls.map((call) => call[0]).find((args: any) => args.userId === userId)?.payload;
  const rowFor = (userId: string) =>
    prisma.notification.create.mock.calls.map((call: any[]) => call[0].data).find((data: any) => data.userId === userId);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();

    prisma.notification.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `n-${data.userId}`, ...data, delivery: { emailSent: false, pushSent: false } })
    );
    prisma.notification.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue({ username: 'newbie', displayName: 'Newbie', avatar: null });
    prisma.user.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((where.id.in as string[]).map((id) => ({ id, systemLanguage: LANGS[id] ?? 'fr' })))
    );
    prisma.conversation.findUnique.mockResolvedValue({ title: 'Les Amis', type: 'group' });
    prisma.participant.count.mockResolvedValue(12);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    service = new NotificationService(prisma);
    sendToUser = jest.fn<(args: any) => Promise<unknown[]>>().mockResolvedValue([]);
    service.setPushNotificationService({ sendToUser } as any);
  });

  it('le corps de push nomme la conversation, dans la langue de CHAQUE lecteur', async () => {
    await service.createMemberJoinedNotificationsBatch([MEMBER_FR, MEMBER_EN], COMMON);

    expect(pushFor(MEMBER_FR)).toEqual(expect.objectContaining({ title: 'Newbie', body: 'a rejoint Les Amis' }));
    expect(pushFor(MEMBER_EN)).toEqual(expect.objectContaining({ title: 'Newbie', body: 'joined Les Amis' }));
  });

  it('la ligne persistée (cloche) dit qui ET où', async () => {
    await service.createMemberJoinedNotificationsBatch([MEMBER_FR, MEMBER_EN], COMMON);

    expect(rowFor(MEMBER_FR)).toEqual(expect.objectContaining({ title: 'Newbie a rejoint Les Amis', content: 'a rejoint Les Amis' }));
    expect(rowFor(MEMBER_EN)).toEqual(expect.objectContaining({ title: 'Newbie joined Les Amis', content: 'joined Les Amis' }));
  });

  it('se regroupe sous la conversation et y mène au toucher', async () => {
    await service.createMemberJoinedNotificationsBatch([MEMBER_FR], COMMON);

    const payload = pushFor(MEMBER_FR);
    expect(payload.threadId).toBe(CONV_ID);
    expect(payload.link).toBe(`/conversations/${CONV_ID}`);
    expect(payload.data).toEqual(expect.objectContaining({ conversationId: CONV_ID, conversationTitle: 'Les Amis', type: 'member_joined' }));
  });

  it('une conversation sans titre se dit « la conversation », jamais un nom vide', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ title: null, type: 'group' });

    await service.createMemberJoinedNotificationsBatch([MEMBER_FR], COMMON);

    expect(pushFor(MEMBER_FR).body).toBe('a rejoint la conversation');
  });

  it('le chemin unitaire compose la même phrase que le lot', async () => {
    await service.createMemberJoinedNotification({ recipientUserId: MEMBER_EN, ...COMMON });

    expect(pushFor(MEMBER_EN).body).toBe('joined Les Amis');
    expect(rowFor(MEMBER_EN).title).toBe('Newbie joined Les Amis');
  });
});
