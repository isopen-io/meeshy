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
  it('roule Ko → Mo au bord du mébioctet (jamais "1024 Ko")', () => {
    // 1_048_500 o < 1 Mio mais /1024 = 1023.93 → .toFixed(0) rendait "1024 Ko".
    // Le tier doit basculer sur la valeur ARRONDIE, comme formatCallDataSize.
    const label = formatSingleAttachmentLabelI18n('fr', { type: 'audio', fileSize: 1_048_500 });
    expect(label).not.toContain('1024 Ko');
    expect(label).toContain('1.0 Mo');
  });
  it('garde les Ko sous le bord de rollover', () => {
    // 500_000 / 1024 = 488.28 → "488 Ko" (aucune régression du tier Ko).
    expect(formatSingleAttachmentLabelI18n('fr', { type: 'audio', fileSize: 500_000 }))
      .toContain('488 Ko');
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
    userConversationPreferences: { findMany: async () => [] },
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
  it('comment_reaction REEL, destinataire en → corps et metadata.postType conscients du réel (F58)', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'en' } });
    await svc.createCommentReactionNotification({
      commentAuthorId: 'r', reactorUserId: 'a', commentId: 'c', postId: 'p',
      reactionEmoji: '❤️', postAuthorName: 'Bob', postType: 'REEL',
    });
    expect(created[0].content).toBe('User a reacted ❤️ to your comment on Bob’s reel');
    expect(created[0].metadata.postType).toBe('REEL');
  });
  it('comment_reaction STATUS ne s’effondre pas vers POST dans metadata.postType (F58)', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'fr' } });
    await svc.createCommentReactionNotification({
      commentAuthorId: 'r', reactorUserId: 'a', commentId: 'c', postId: 'p',
      reactionEmoji: '🔥', postAuthorName: 'Bob', postType: 'STATUS',
    });
    expect(created[0].content).toBe('User a a réagi 🔥 à votre commentaire sur le statut de Bob');
    expect(created[0].metadata.postType).toBe('STATUS');
  });
  it('comment_reaction sans postType retombe sur POST (rétro-compat)', async () => {
    const { svc, created } = makeContentHarness({ r: { systemLanguage: 'en' } });
    await svc.createCommentReactionNotification({
      commentAuthorId: 'r', reactorUserId: 'a', commentId: 'c', postId: 'p',
      reactionEmoji: '❤️', postAuthorName: 'Bob',
    });
    expect(created[0].content).toBe('User a reacted ❤️ to your comment on Bob’s post');
    expect(created[0].metadata.postType).toBe('POST');
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
