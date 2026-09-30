/**
 * #8857 — l'éventail remet le DÉTAIL de chaque contenu : position, contact,
 * invitation, lien, sticker, vignette vidéo, réponse à une story.
 *
 * Avant ce lot, une position partait avec un corps VIDE (`messageType: text`,
 * contenu vide, `metadata.location` ignoré), une invitation ou un lien en URL
 * brute, une réponse à une story sans rien qui le dise. Les témoins portent sur
 * ce que l'éventail REMET au créateur (les trois lots), et sur ce qu'il RETIENT
 * dès que le média n'a pas le droit de voyager.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const REPLIED_ID = '507f1f77bcf86cd799439052';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const STORY_AUTHOR_ID = '507f1f77bcf86cd799439043';
const STORY_ID = '507f1f77bcf86cd799439061';

const PLACE = { latitude: 48.8566, longitude: 2.3522, name: 'Café de Flore', address: '172 bd Saint-Germain, Paris', category: null };

type ShareLinkRow = {
  isActive: boolean;
  expiresAt: Date | null;
  name: string | null;
  conversation: { title: string | null; memberCount: number } | null;
} | null;

function makePrisma(opts: { attachments?: unknown[]; shareLink?: ShareLinkRow; repliedAuthor?: string | null }) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockImplementation((args: any) =>
        Promise.resolve(args.where.id === SENDER_PART_ID
          ? { userId: SENDER_USER_ID, displayName: 'Alice', avatar: null }
          : { userId: opts.repliedAuthor ?? null })),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        participants: [{ userId: SENDER_USER_ID }, { userId: PEER_USER_ID }, { userId: STORY_AUTHOR_ID }],
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockImplementation((args: any) =>
        Promise.resolve(args.where.id === REPLIED_ID ? { senderId: 'part-of-replied' } : { deletedAt: null })),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue(opts.attachments ?? []) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findFirst: jest.fn<any>().mockResolvedValue(opts.shareLink ?? null) },
    messageStatusEntry: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    messageType: 'text',
    replyToId: null,
    isEncrypted: false,
    encryptionMode: null,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-09-30T10:00:00Z'),
    encryptedContent: null,
    metadata: null,
    storyReplyToId: null,
    ...overrides,
  };
}

const attachment = (overrides: Record<string, unknown>) => ({
  mimeType: 'image/jpeg',
  fileName: 'x.jpg',
  originalName: 'x.jpg',
  fileSize: 1000,
  duration: null,
  width: null,
  height: null,
  fileUrl: 'attachments/x.jpg',
  thumbnailUrl: null,
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

async function fanOut(opts: {
  message?: Record<string, unknown>;
  text?: string;
  attachments?: unknown[];
  shareLink?: ShareLinkRow;
  mentions?: string[];
  repliedAuthor?: string | null;
}) {
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'n' });
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'r' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);
  const prisma = makePrisma(opts);
  await notifyMessageRecipients({
    prisma: prisma as any,
    notificationService: { createMessageNotification, createReplyNotification, createMentionNotificationsBatch },
    message: makeMessage(opts.message) as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: opts.text ?? '',
    validatedMentionUserIds: opts.mentions ?? [],
  });
  const regular = createMessageNotification.mock.calls[0]?.[0] as Record<string, any> | undefined;
  const reply = createReplyNotification.mock.calls[0]?.[0] as Record<string, any> | undefined;
  const mention = createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, any> | undefined;
  return { regular, reply, mention, prisma };
}

describe('éventail — ce que chaque contenu remet', () => {
  it('une POSITION écrite en `text` au contenu vide remet ses coordonnées, son nom et son adresse', async () => {
    const { regular } = await fanOut({ message: { metadata: { location: PLACE } } });

    expect(regular?.contentDetail?.location).toEqual({
      latitude: 48.8566, longitude: 2.3522, name: 'Café de Flore', address: '172 bd Saint-Germain, Paris',
    });
  });

  it('une CARTE DE VISITE remet le nom du contact, lu dans son nom d’origine', async () => {
    const { regular } = await fanOut({
      attachments: [attachment({ mimeType: 'text/vcard', fileName: 'contact_x.vcf', originalName: 'Awa Diallo.vcf' })],
    });

    expect(regular?.contentDetail?.contact).toEqual({ name: 'Awa Diallo' });
  });

  it('un lien d’INVITATION remet son adresse, le titre et l’effectif de la conversation invitée', async () => {
    const { regular, prisma } = await fanOut({
      text: 'Rejoins-nous https://meeshy.me/chat/mshy_Ab12Cd34.',
      shareLink: { isActive: true, expiresAt: null, name: 'Lien public', conversation: { title: 'Club lecture', memberCount: 12 } },
    });

    expect(regular?.contentDetail?.invite).toEqual({
      url: 'https://meeshy.me/chat/mshy_Ab12Cd34', conversationTitle: 'Club lecture', memberCount: 12,
    });
    expect(regular?.contentDetail?.link).toBeUndefined();
    const where = (prisma.conversationShareLink.findFirst.mock.calls[0]?.[0] as any)?.where;
    expect(JSON.stringify(where)).toContain('mshy_Ab12Cd34');
  });

  it('un lien d’invitation EXPIRÉ ou désactivé reste une invitation, sans rien dire de la conversation', async () => {
    const { regular } = await fanOut({
      text: 'meeshy://join/mshy_Ab12Cd34',
      shareLink: { isActive: false, expiresAt: null, name: 'x', conversation: { title: 'Secret', memberCount: 3 } },
    });

    expect(regular?.contentDetail?.invite).toEqual({ url: 'meeshy://join/mshy_Ab12Cd34', conversationTitle: null, memberCount: null });
    expect(JSON.stringify(regular)).not.toContain('Secret');
  });

  it('un lien WEB remet son adresse et son domaine, sans requête sortante', async () => {
    const { regular, prisma } = await fanOut({ text: 'Regarde https://www.lemonde.fr/article/42?x=1 !' });

    expect(regular?.contentDetail?.link).toEqual({ url: 'https://www.lemonde.fr/article/42?x=1', domain: 'lemonde.fr' });
    expect(prisma.conversationShareLink.findFirst).not.toHaveBeenCalled();
  });

  it('un STICKER remet son emoji', async () => {
    const { regular } = await fanOut({
      message: { metadata: { sticker: { emoji: '🥳', templateId: 'party' } } },
      attachments: [attachment({ mimeType: 'image/png', fileName: 'sticker.png' })],
    });

    expect(regular?.contentDetail?.sticker).toEqual({ emoji: '🥳' });
  });

  it('une VIDÉO remet sa vignette existante', async () => {
    const { regular } = await fanOut({
      message: { messageType: 'video' },
      attachments: [attachment({ mimeType: 'video/mp4', fileName: 'v.mp4', thumbnailUrl: 'attachments/v_thumb.jpg' })],
    });

    expect(regular?.contentDetail?.videoThumbnailUrl).toBe('attachments/v_thumb.jpg');
  });

  it('une RÉPONSE À UNE STORY le dit, avec l’auteur de la story', async () => {
    const { regular } = await fanOut({
      text: 'Trop beau !',
      message: { storyReplyToId: STORY_ID, metadata: { postReplyTo: { id: STORY_ID, type: 'STORY', authorId: STORY_AUTHOR_ID } } },
    });

    expect(regular?.contentDetail?.storyReply).toEqual({ authorId: STORY_AUTHOR_ID });
  });

  it('une réponse à un STATUT n’est pas une réponse à une story', async () => {
    const { regular } = await fanOut({
      text: 'Courage',
      message: { storyReplyToId: STORY_ID, metadata: { postReplyTo: { id: STORY_ID, type: 'STATUS', authorId: STORY_AUTHOR_ID } } },
    });

    expect(regular?.contentDetail?.storyReply).toBeUndefined();
  });

  it('un texte ordinaire ne remet aucun détail', async () => {
    const { regular } = await fanOut({ text: 'Salut !' });

    expect(regular?.contentDetail).toBeUndefined();
  });

  it('la RÉPONSE et la MENTION reçoivent le même détail que le message simple', async () => {
    const { reply, mention } = await fanOut({
      message: { replyToId: REPLIED_ID, metadata: { location: PLACE } },
      repliedAuthor: PEER_USER_ID,
      mentions: [STORY_AUTHOR_ID],
    });

    expect(reply?.contentDetail?.location?.name).toBe('Café de Flore');
    expect(mention?.contentDetail?.location?.name).toBe('Café de Flore');
  });
});

describe('éventail — AUCUN détail ne franchit une protection', () => {
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-09-30T11:00:00Z'), ephemeralDuration: 3600 }],
    ['chiffré', { isEncrypted: true }],
  ];

  const everyKind = {
    storyReplyToId: STORY_ID,
    metadata: { location: PLACE, sticker: { emoji: '🥳' }, postReplyTo: { type: 'STORY', authorId: STORY_AUTHOR_ID } },
  };

  it.each(protections)('un message %s ne remet ni position, ni invitation, ni lien, ni réponse à une story', async (_l, flags) => {
    const { regular, prisma } = await fanOut({
      message: { ...everyKind, ...flags },
      text: 'https://meeshy.me/chat/mshy_Ab12Cd34 https://example.com',
      shareLink: { isActive: true, expiresAt: null, name: 'x', conversation: { title: 'Club', memberCount: 4 } },
    });

    expect(regular?.contentDetail).toBeUndefined();
    expect(regular?.notificationLocKey).toBeTruthy();
    expect(JSON.stringify(regular)).not.toMatch(/Café de Flore|48\.8566|Club|example\.com/);
    expect(prisma.conversationShareLink.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['vue unique', { isViewOnce: true }],
    ['floutée', { isBlurred: true }],
  ])('une pièce jointe %s retient la vCard et la vignette', async (_l, flags) => {
    const vcard = await fanOut({
      attachments: [attachment({ mimeType: 'text/vcard', originalName: 'Awa Diallo.vcf', ...flags })],
    });
    const video = await fanOut({
      attachments: [attachment({ mimeType: 'video/mp4', thumbnailUrl: 'attachments/t.jpg', ...flags })],
    });

    expect(vcard.regular?.contentDetail).toBeUndefined();
    expect(video.regular?.contentDetail).toBeUndefined();
  });
});
