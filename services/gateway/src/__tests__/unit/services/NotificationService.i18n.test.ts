import {
  NotificationService,
  formatSingleAttachmentLabelI18n,
  buildMessageNotificationBodyI18n,
} from '../../../services/notifications/NotificationService';

function makeService(users: Record<string, any>) {
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        users[where.id] ? { ...users[where.id] } : null,
      findMany: async ({ where }: any) =>
        (where.id.in as string[])
          .map(id => (users[id] ? { id, ...users[id] } : null))
          .filter(Boolean),
    },
  };
  return new NotificationService(prisma as any);
}

describe('resolveRecipientLang', () => {
  it('retourne systemLanguage (priorité Prisme 1)', async () => {
    const svc = makeService({ u1: { systemLanguage: 'en', deviceLocale: 'fr' } });
    expect(await (svc as any).resolveRecipientLang('u1')).toBe('en');
  });
  it('ne laisse pas deviceLocale supplanter systemLanguage', async () => {
    const svc = makeService({ u1: { systemLanguage: 'fr', deviceLocale: 'en' } });
    expect(await (svc as any).resolveRecipientLang('u1')).toBe('fr');
  });
  it('retombe sur fr si destinataire introuvable', async () => {
    const svc = makeService({});
    expect(await (svc as any).resolveRecipientLang('ghost')).toBe('fr');
  });
});

describe('resolveRecipientLangs (batch)', () => {
  it('mappe chaque destinataire à sa langue', async () => {
    const svc = makeService({
      a: { systemLanguage: 'en' },
      b: { systemLanguage: 'de' },
    });
    const map = await (svc as any).resolveRecipientLangs(['a', 'b', 'missing']);
    expect(map.get('a')).toBe('en');
    expect(map.get('b')).toBe('de');
    expect(map.get('missing')).toBe('fr');
  });
});

describe('attachments i18n', () => {
  it('localise le label d’un attachment unique', () => {
    expect(formatSingleAttachmentLabelI18n('en', { type: 'video', duration: 135000, fileSize: 15_000_000 }))
      .toMatch(/^🎬 Video · /);
    expect(formatSingleAttachmentLabelI18n('de', { type: 'image', width: 1920, height: 1080 }))
      .toMatch(/^📷 Foto · 1920×1080/);
  });
  it('localise le corps message avec badges multi-fichiers', () => {
    const body = buildMessageNotificationBodyI18n('es', {
      attachments: [{ type: 'image' }, { type: 'audio' }, { type: 'video' }],
    });
    expect(body).toContain('+1🎵');
    expect(body).toContain('📷 Foto');
  });
});

function makeContentHarness(usersById: Record<string, any>) {
  const created: any[] = [];
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => ({
        id: where.id, username: 'u_' + where.id, displayName: 'User ' + where.id,
        avatar: null, ...(usersById[where.id] ?? {}),
      }),
      findMany: async ({ where }: any) =>
        (where.id.in as string[]).map(id => ({ id, ...(usersById[id] ?? {}) })),
    },
    conversation: { findUnique: async () => null },
    userPreferences: { findUnique: async () => null },
    notification: {
      create: async (args: any) => { created.push(args.data); return { id: 'n1', ...args.data, createdAt: new Date() }; },
      count: async () => 0,
    },
    message: { findUnique: async () => null },
  };
  return { svc: new NotificationService(prisma as any), created };
}

describe('contenu localisé par destinataire', () => {
  it('missed_call, destinataire en → "📞 Missed audio call"', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'en' } });
    await svc.createMissedCallNotification({ recipientUserId: 'r', callerId: 'c', conversationId: 'cv', callSessionId: 's', callType: 'audio' });
    expect(created[0].content).toBe('📞 Missed audio call');
  });
  it('friend_request, destinataire de → "Neue Kontaktanfrage"', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'de' } });
    await svc.createFriendRequestNotification({ recipientUserId: 'r', requesterId: 'q', friendRequestId: 'f' });
    expect(created[0].content).toBe('Neue Kontaktanfrage');
  });
  it('post_like STORY, destinataire en → "reacted ❤️ to your story"', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'en' } });
    await svc.createPostLikeNotification({ actorId: 'a', postId: 'p', postAuthorId: 'r', emoji: '❤️', postType: 'STORY' });
    expect(created[0].content).toBe('reacted ❤️ to your story');
  });
});

describe('batch — langue par destinataire', () => {
  it('mentions : chaque destinataire reçoit son contenu localisé', async () => {
    const { svc, created } = makeContentHarness({
      a: { systemLanguage: 'en' }, b: { systemLanguage: 'de' }, x: { displayName: 'X' },
    });
    await svc.createPostMentionNotificationsBatch({ postId: 'p', posterId: 'x', mentionedUserIds: ['a', 'b'] });
    const byUser = new Map(created.map((d: any) => [d.userId, d.content]));
    expect(byUser.get('a')).toBe('mentioned you');
    expect(byUser.get('b')).toBe('hat dich erwähnt');
  });
});

describe('login new device', () => {
  it('titre localisé selon systemLanguage (de)', async () => {
    const pushed: any[] = [];
    const prisma: any = {
      user: { findUnique: async () => ({ systemLanguage: 'de' }), findMany: async () => [] },
      userPreferences: { findUnique: async () => null },
      notification: { create: async (a: any) => ({ id: 'n', ...a.data, createdAt: new Date() }), count: async () => 0 },
      conversation: { findUnique: async () => null },
      message: { findUnique: async () => null },
    };
    const svc = new NotificationService(prisma as any);
    svc.setPushNotificationService({ sendToUser: async (a: any) => { pushed.push(a.payload); } } as any);
    await svc.createLoginNewDeviceNotification({ recipientUserId: 'r' });
    expect(pushed[0].title).toBe('Neue Anmeldung erkannt');
  });
});

describe('message reaction (site 17)', () => {
  it('message_reaction, destinataire en → "reacted ❤️ to your message"', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'en' } });
    await svc.createReactionNotification({ messageAuthorId: 'r', reactorUserId: 'c', messageId: 'm', conversationId: 'cv', reactionEmoji: '❤️' });
    expect(created[0].content).toBe('reacted ❤️ to your message');
  });
});
