/**
 * #8857 — ce que la bannière d'un message DIT et TRANSPORTE pour chaque
 * contenu : le corps servi (les trois plateformes le rendent), les clés `data`
 * (NSE iOS, FCM, web) et la catégorie iOS qui choisit les actions.
 *
 * Et ce qu'elle RETIENT : `showPreview: false` et un `notificationLocKey`
 * (message protégé) ne laissent partir aucune des nouvelles clés, et la
 * catégorie retombe sur celle du type — une action « Ouvrir dans Plans » dirait
 * à elle seule qu'il s'agit d'une position.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { NOTIFICATION_LANGUAGES } from '@meeshy/shared/utils/notification-strings';
import type { NotificationContentDetail } from '@meeshy/shared/types/notification-content-detail';

import { NotificationService } from '../../../../services/notifications/NotificationService';
import { pushCategoryForNotificationType } from '../../../../services/notifications/push-header';
import { detailedBannerBody } from '../../../../services/notifications/content-detail';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';
const OTHER_ID = '507f1f77bcf86cd799439044';

const DETAIL_KEYS = [
  'locationLat', 'locationLon', 'locationName', 'locationAddress',
  'contactName', 'contactPhone', 'contactEmail',
  'inviteUrl', 'inviteConversationTitle', 'inviteMemberCount',
  'linkUrl', 'linkDomain', 'linkTitle', 'linkImageUrl',
  'thumbnailUrl', 'storyReply',
] as const;

const LOCATION: NotificationContentDetail = {
  location: { latitude: 48.8566, longitude: 2.3522, name: 'Café de Flore', address: '172 bd Saint-Germain' },
};
const CONTACT: NotificationContentDetail = { contact: { name: 'Awa Diallo' } };
const INVITE: NotificationContentDetail = {
  invite: { url: 'https://meeshy.me/chat/mshy_Ab12Cd34', conversationTitle: 'Club lecture', memberCount: 12 },
};
const LINK: NotificationContentDetail = { link: { url: 'https://www.lemonde.fr/a/42', domain: 'lemonde.fr' } };
const VIDEO: NotificationContentDetail = { videoThumbnailUrl: 'https://cdn.example/v_thumb.jpg' };
const STORY_REPLY: NotificationContentDetail = { storyReply: { authorId: RECIPIENT_ID } };

function makePrisma(prefs: Record<string, unknown> | null) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null, expiresAt: null, createdAt: new Date('2026-09-30T10:00:00Z'),
        messageType: 'text', translations: null, originalLanguage: 'fr', ephemeralDuration: null, effectFlags: 0,
      }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: RECIPIENT_ID, username: 'bob', displayName: 'Bob', avatar: null,
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }) },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_x', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    userConversationPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(prefs ? { notification: prefs } : null) },
  } as any;
}

type Pushed = { body: string; category?: string; data: Record<string, unknown>; persistedContext: Record<string, any> };

async function pushed(extra: Record<string, unknown>, prefs: Record<string, unknown> | null = null): Promise<Pushed> {
  const prisma = makePrisma(prefs);
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);

  await service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: '',
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
    ...extra,
  } as any);

  const payload = (sendToUser.mock.calls[0]?.[0] as any)?.payload ?? {};
  const created = (prisma.notification.create.mock.calls[0]?.[0] as any)?.data ?? {};
  return { body: payload.body, category: payload.category, data: payload.data ?? {}, persistedContext: created.context ?? {} };
}

describe('push — les clés `data` et la catégorie de chaque contenu', () => {
  it('une POSITION : coordonnées, nom, adresse, catégorie MEESHY_LOCATION, corps « 📍 Nom · adresse »', async () => {
    const p = await pushed({ contentDetail: LOCATION });

    expect(p.data).toMatchObject({
      locationLat: '48.8566', locationLon: '2.3522', locationName: 'Café de Flore', locationAddress: '172 bd Saint-Germain',
    });
    expect(p.category).toBe('MEESHY_LOCATION');
    expect(p.body).toBe('📍 Café de Flore · 172 bd Saint-Germain');
    expect(p.persistedContext.contentDetail).toEqual(LOCATION);
  });

  it('une position SANS nom ni adresse se dit « Position partagée »', async () => {
    const p = await pushed({ contentDetail: { location: { latitude: 1, longitude: 2, name: null, address: null } } });

    expect(p.body).toBe('📍 Position partagée');
    expect(p.data.locationName).toBeUndefined();
  });

  it('un CONTACT : son nom, catégorie MEESHY_CONTACT', async () => {
    const p = await pushed({
      contentDetail: CONTACT,
      attachments: [{ type: 'contact', filename: 'Awa Diallo.vcf', contactName: 'Awa Diallo' }],
    });

    expect(p.data.contactName).toBe('Awa Diallo');
    expect(p.category).toBe('MEESHY_CONTACT');
    expect(p.body).toBe('👤 Awa Diallo');
  });

  it('une INVITATION : adresse, titre, effectif, catégorie MEESHY_INVITE — le corps remplace l’URL brute', async () => {
    const p = await pushed({ contentDetail: INVITE, messagePreview: 'Rejoins-nous https://meeshy.me/chat/mshy_Ab12Cd34' });

    expect(p.data).toMatchObject({
      inviteUrl: 'https://meeshy.me/chat/mshy_Ab12Cd34', inviteConversationTitle: 'Club lecture', inviteMemberCount: '12',
    });
    expect(p.category).toBe('MEESHY_INVITE');
    expect(p.body).toBe('Rejoins-nous\n✉️ Invitation · Club lecture');
  });

  it('un LIEN web : adresse et domaine, corps « 🔗 domaine », catégorie de message', async () => {
    const p = await pushed({ contentDetail: LINK, messagePreview: 'https://www.lemonde.fr/a/42' });

    expect(p.data).toMatchObject({ linkUrl: 'https://www.lemonde.fr/a/42', linkDomain: 'lemonde.fr' });
    expect(p.data.linkTitle).toBeUndefined();
    expect(p.category).toBe('MEESHY_MESSAGE');
    expect(p.body).toBe('🔗 lemonde.fr');
  });

  it('une VIDÉO : sa vignette', async () => {
    const p = await pushed({ contentDetail: VIDEO });

    expect(p.data.thumbnailUrl).toBe('https://cdn.example/v_thumb.jpg');
  });

  it('un STICKER : « emoji Sticker », jamais « Photo »', async () => {
    const p = await pushed({
      contentDetail: { sticker: { emoji: '🥳' } },
      attachments: [{ type: 'image', filename: 'sticker.png' }],
      firstAttachmentWidth: 512,
      firstAttachmentHeight: 512,
    });

    expect(p.body).toBe('🥳 Sticker');
  });

  it('une RÉPONSE À UNE STORY : `storyReply = "1"` et le corps le dit, à l’auteur comme aux autres', async () => {
    const mine = await pushed({ contentDetail: STORY_REPLY, messagePreview: 'Trop beau !' });
    const theirs = await pushed({ contentDetail: { storyReply: { authorId: OTHER_ID } }, messagePreview: 'Trop beau !' });

    expect(mine.data.storyReply).toBe('1');
    expect(mine.body).toBe('Réponse à votre story · Trop beau !');
    expect(theirs.body).toBe('Réponse à une story · Trop beau !');
  });
});

describe('push — AUCUNE nouvelle clé sous une retenue', () => {
  const everything: NotificationContentDetail = { ...LOCATION, ...CONTACT, ...INVITE, ...LINK, ...VIDEO, ...STORY_REPLY };

  it('`showPreview: false` ne laisse partir aucune clé de détail, et la catégorie retombe sur celle du type', async () => {
    const p = await pushed({ contentDetail: everything }, { showPreview: false });

    for (const key of DETAIL_KEYS) expect(p.data[key]).toBeUndefined();
    expect(p.category).toBe('MEESHY_MESSAGE');
    expect(JSON.stringify(p.data)).not.toMatch(/Café de Flore|48\.8566|Club lecture|lemonde|v_thumb|Awa/);
  });

  it('un `notificationLocKey` (message protégé) ne laisse partir aucune clé de détail', async () => {
    const p = await pushed({ contentDetail: everything, notificationLocKey: 'notification.view_once_message', messagePreview: '👁️ 📍' });

    for (const key of DETAIL_KEYS) expect(p.data[key]).toBeUndefined();
    expect(p.category).toBe('MEESHY_MESSAGE');
    expect(JSON.stringify(p.data)).not.toMatch(/Café de Flore|48\.8566|Club lecture|lemonde|v_thumb|Awa/);
  });
});

describe('corps détaillé — les sept langues du catalogue', () => {
  it.each([...NOTIFICATION_LANGUAGES])('%s : position, sticker, invitation et réponse à une story ont un libellé', (lang) => {
    const compose = (text: string) => text;
    const location = detailedBannerBody(lang, { text: '', detail: { location: { latitude: 0, longitude: 0, name: null, address: null } }, readerId: RECIPIENT_ID, compose });
    const sticker = detailedBannerBody(lang, { text: '', detail: { sticker: { emoji: null } }, readerId: RECIPIENT_ID, compose });
    const invite = detailedBannerBody(lang, { text: '', detail: { invite: { url: 'meeshy://chat/x', conversationTitle: null, memberCount: null } }, readerId: RECIPIENT_ID, compose });
    const reply = detailedBannerBody(lang, { text: 'ok', detail: STORY_REPLY, readerId: RECIPIENT_ID, compose });

    expect(location.startsWith('📍 ')).toBe(true);
    expect(sticker.startsWith('🏷 ')).toBe(true);
    expect(invite.startsWith('✉️ ')).toBe(true);
    expect(reply.endsWith(' · ok')).toBe(true);
    for (const body of [location, sticker, invite, reply]) expect(body).not.toMatch(/content\.|undefined|null/);
  });
});

describe('catégorie — le détail choisit les actions des bannières de message', () => {
  it.each(['new_message', 'message_reply', 'user_mentioned'] as const)('%s', (type) => {
    expect(pushCategoryForNotificationType(type, 'MEESHY_LOCATION')).toBe('MEESHY_LOCATION');
    expect(pushCategoryForNotificationType(type, 'MEESHY_CONTACT')).toBe('MEESHY_CONTACT');
    expect(pushCategoryForNotificationType(type, 'MEESHY_INVITE')).toBe('MEESHY_INVITE');
  });

  it('jamais celles d’une notification qui n’est pas un message', () => {
    expect(pushCategoryForNotificationType('friend_request', 'MEESHY_LOCATION')).toBe('MEESHY_FRIEND_REQUEST');
    expect(pushCategoryForNotificationType('new_message')).toBe('MEESHY_MESSAGE');
  });
});
