/**
 * #9629, #9630 — l'avis de capture ne se sert qu'à ceux qui lisent ce qu'il
 * nomme, ne compte qu'à l'auteur de ce qu'il nomme, et meurt 24 h après lui.
 *
 * Le double Prisma répond depuis des tables en mémoire et HONORE les filtres
 * qu'il reçoit (conversation, identifiants, marque d'avis vivant) : un témoin
 * qui passerait au vert sur un `where` ignoré n'attesterait rien.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { matchesMongoWhere } from '../../../__tests__/helpers/mongo-where';
import { NO_PERSONAL_HIDING } from '../../personalHistoryFilter';
import {
  CAPTURE_NOTICE_RETENTION_MS,
  captureNoticeAudience,
  captureNoticeCountsFor,
  captureNoticeExpiresAt,
  captureNoticeOf,
  captureNoticeServedTo,
  hidingWithCaptureNotices,
  isCaptureNoticeCandidate,
  uncountedCaptureNotices,
  unservedCaptureNoticeIds,
  withoutCaptureNotices,
  type CaptureNotice,
  type CapturedMessage,
  type CaptureNoticeViewer,
} from '../captureNoticeVisibility';

const CONV = '507f1f77bcf86cd799439011';
const CAPTURER = '507f1f77bcf86cd7994390a1';
const AUTHOR = '507f1f77bcf86cd7994390a2';
const READER = '507f1f77bcf86cd7994390a3';
const LATE = '507f1f77bcf86cd7994390a4';
const MOD = '507f1f77bcf86cd7994390a5';
const GUEST = '507f1f77bcf86cd7994390a6';
const CAPTURED = '507f1f77bcf86cd799439031';
const NOTICE = '507f1f77bcf86cd799439041';
const JOIN = '507f1f77bcf86cd799439042';

const SENT_AT = new Date('2026-10-08T10:00:00.000Z');
const NOTICE_AT = new Date('2026-10-08T10:05:00.000Z');
const NOW = new Date('2026-10-08T10:06:00.000Z');

const captured = (overrides: Partial<CapturedMessage> = {}): CapturedMessage => ({
  id: CAPTURED,
  createdAt: SENT_AT,
  deletedAt: null,
  senderId: AUTHOR,
  ...overrides,
});

const notice: CaptureNotice = { id: NOTICE, conversationId: CONV, senderId: CAPTURER, capturedMessageId: CAPTURED };

const viewer = (overrides: Partial<CaptureNoticeViewer> = {}): CaptureNoticeViewer => ({
  participantId: READER,
  conversationRole: 'member',
  floor: null,
  hiding: NO_PERSONAL_HIDING,
  ...overrides,
});

const captureMetadata = { kind: 'content-capture', capturedMessageId: CAPTURED };

describe('captureNoticeExpiresAt — l’avis meurt 24 h après ce qu’il nomme (#9629 a)', () => {
  it('prend l’échéance globale du message capturé quand elle est plus tardive que l’avis', () => {
    const capturedExpiresAt = new Date('2026-10-15T10:00:00.000Z');
    expect(captureNoticeExpiresAt({ capturedExpiresAt, noticeAt: NOTICE_AT })).toEqual(
      new Date(capturedExpiresAt.getTime() + CAPTURE_NOTICE_RETENTION_MS),
    );
  });

  it('prend la date de l’avis quand le message capturé n’a pas d’échéance, ou une échéance passée', () => {
    const expected = new Date(NOTICE_AT.getTime() + CAPTURE_NOTICE_RETENTION_MS);
    expect(captureNoticeExpiresAt({ capturedExpiresAt: null, noticeAt: NOTICE_AT })).toEqual(expected);
    expect(captureNoticeExpiresAt({ capturedExpiresAt: SENT_AT, noticeAt: NOTICE_AT })).toEqual(expected);
  });

  it('vaut vingt-quatre heures', () => {
    expect(CAPTURE_NOTICE_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('ce qu’est un avis de capture', () => {
  it('un message système à échéance est un CANDIDAT ; un système sans échéance ou un message ordinaire, non', () => {
    expect(isCaptureNoticeCandidate({ messageSource: 'system', messageType: 'system', expiresAt: NOTICE_AT })).toBe(true);
    expect(isCaptureNoticeCandidate({ messageSource: 'system', messageType: 'system', expiresAt: null })).toBe(false);
    expect(isCaptureNoticeCandidate({ messageSource: 'user', messageType: 'text', expiresAt: NOTICE_AT })).toBe(false);
  });

  it('se reconnaît à sa métadonnée, et un avis à la métadonnée abîmée reste un avis SANS message nommé', () => {
    const row = { id: NOTICE, conversationId: CONV, senderId: CAPTURER, messageType: 'system' };
    expect(captureNoticeOf({ ...row, metadata: captureMetadata })).toEqual(notice);
    expect(captureNoticeOf({ ...row, metadata: { kind: 'content-capture' } })).toEqual({ ...notice, capturedMessageId: null });
    expect(captureNoticeOf({ ...row, metadata: { kind: 'member-left' } })).toBeNull();
    expect(captureNoticeOf({ ...row, messageType: 'text', metadata: captureMetadata })).toBeNull();
  });

  it('withoutCaptureNotices écarte les avis — et GARDE le message sans échéance, clé absente comprise (#8309)', () => {
    const where = withoutCaptureNotices({ conversationId: CONV, AND: [{ createdAt: { gt: SENT_AT } }] });
    expect(where.conversationId).toBe(CONV);
    expect(where.AND[0]).toEqual({ createdAt: { gt: SENT_AT } });

    const after = new Date(SENT_AT.getTime() + 1);
    const plain = { conversationId: CONV, createdAt: after, messageSource: 'user', messageType: 'text' };
    const legacy = { conversationId: CONV, createdAt: after };
    const flame = { ...plain, expiresAt: NOW };
    const join = { ...plain, messageSource: 'system', messageType: 'system', expiresAt: null };
    const captureNotice = { ...plain, messageSource: 'system', messageType: 'system', expiresAt: NOW };
    expect([plain, legacy, flame, join, captureNotice].map((row) => matchesMongoWhere(row, where))).toEqual([true, true, true, true, false]);
  });
});

describe('captureNoticeServedTo — l’audience d’un avis (#9629 b)', () => {
  it('sert celui qui capture et l’auteur du message capturé, TOUJOURS', () => {
    const blind = { floor: new Date(NOTICE_AT.getTime()), hiding: { clearHistoryBefore: NOW, hiddenMessageIds: [CAPTURED] } };
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: viewer({ participantId: CAPTURER, ...blind }), isAnnouncementChannel: true })).toBe(true);
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: viewer({ participantId: AUTHOR, ...blind }), isAnnouncementChannel: true })).toBe(true);
  });

  it('sert un membre qui lit le message capturé', () => {
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: viewer(), isAnnouncementChannel: false })).toBe(true);
  });

  it('ne sert pas un membre dont le plancher d’historique cache le message capturé', () => {
    const late = viewer({ participantId: LATE, floor: new Date(SENT_AT.getTime() + 1) });
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: late, isAnnouncementChannel: false })).toBe(false);
  });

  it('ne sert pas un membre qui a vidé son historique après le message capturé, ni celui qui l’a retiré de sa vue', () => {
    const cleared = viewer({ hiding: { clearHistoryBefore: new Date(SENT_AT.getTime() + 1), hiddenMessageIds: [] } });
    const hidden = viewer({ hiding: { clearHistoryBefore: null, hiddenMessageIds: [CAPTURED] } });
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: cleared, isAnnouncementChannel: false })).toBe(false);
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: hidden, isAnnouncementChannel: false })).toBe(false);
  });

  it('ne sert personne d’autre quand le message capturé est supprimé, introuvable, ou que l’avis ne le nomme pas', () => {
    expect(captureNoticeServedTo({ notice, captured: captured({ deletedAt: NOW }), viewer: viewer(), isAnnouncementChannel: false })).toBe(false);
    expect(captureNoticeServedTo({ notice, captured: null, viewer: viewer(), isAnnouncementChannel: false })).toBe(false);
    const orphan = { ...notice, capturedMessageId: null };
    expect(captureNoticeServedTo({ notice: orphan, captured: null, viewer: viewer({ participantId: CAPTURER }), isAnnouncementChannel: false })).toBe(true);
  });

  it('dans un canal d’annonces, ne sert que les modérateurs et administrateurs, en plus des deux intéressés', () => {
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: viewer(), isAnnouncementChannel: true })).toBe(false);
    for (const conversationRole of ['moderator', 'admin', 'creator']) {
      expect(
        captureNoticeServedTo({ notice, captured: captured(), viewer: viewer({ participantId: MOD, conversationRole }), isAnnouncementChannel: true }),
      ).toBe(true);
    }
  });

  it('un modérateur d’un canal d’annonces reste soumis à sa propre lecture du message capturé', () => {
    const lateMod = viewer({ participantId: MOD, conversationRole: 'moderator', floor: new Date(SENT_AT.getTime() + 1) });
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: lateMod, isAnnouncementChannel: true })).toBe(false);
  });

  it('un lecteur sans participation ne passe que par la lecture du message capturé', () => {
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: viewer({ participantId: null }), isAnnouncementChannel: false })).toBe(true);
    expect(captureNoticeServedTo({ notice, captured: captured(), viewer: viewer({ participantId: null, conversationRole: null }), isAnnouncementChannel: true })).toBe(false);
  });
});

describe('captureNoticeCountsFor — le non-lu (#9630)', () => {
  it('compte pour l’auteur du message capturé, et pour lui seul', () => {
    expect(captureNoticeCountsFor({ notice, captured: captured(), participantId: AUTHOR })).toBe(true);
    expect(captureNoticeCountsFor({ notice, captured: captured(), participantId: READER })).toBe(false);
    expect(captureNoticeCountsFor({ notice, captured: captured(), participantId: CAPTURER })).toBe(false);
    expect(captureNoticeCountsFor({ notice, captured: null, participantId: AUTHOR })).toBe(false);
  });
});

describe('hidingWithCaptureNotices — l’avis rejoint ce que le lecteur ne voit pas', () => {
  it('rend le même objet quand il n’y a rien à cacher, et ajoute sans dupliquer sinon', () => {
    expect(hidingWithCaptureNotices(NO_PERSONAL_HIDING, [])).toBe(NO_PERSONAL_HIDING);
    const hiding = { clearHistoryBefore: SENT_AT, hiddenMessageIds: [JOIN] };
    expect(hidingWithCaptureNotices(hiding, [NOTICE, JOIN])).toEqual({ clearHistoryBefore: SENT_AT, hiddenMessageIds: [JOIN, NOTICE] });
  });
});

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  createdAt: Date;
  deletedAt: Date | null;
  messageSource: string;
  messageType: string;
  expiresAt: Date | null;
  metadata: unknown;
};

type ParticipantRow = {
  id: string;
  userId: string | null;
  role: string;
  joinedAt: Date;
  shareLinkId: string | null;
  historyVisibleFrom: Date | null;
  permissions: null;
  anonymousSession: null;
  user: { role: string } | null;
};

const msg = (overrides: Partial<MessageRow> & { id: string }): MessageRow => ({
  conversationId: CONV,
  senderId: AUTHOR,
  createdAt: SENT_AT,
  deletedAt: null,
  messageSource: 'user',
  messageType: 'text',
  expiresAt: null,
  metadata: null,
  ...overrides,
});

const NOTICE_ROW = msg({
  id: NOTICE,
  senderId: CAPTURER,
  createdAt: NOTICE_AT,
  messageSource: 'system',
  messageType: 'system',
  expiresAt: new Date(NOTICE_AT.getTime() + CAPTURE_NOTICE_RETENTION_MS),
  metadata: captureMetadata,
});

const JOIN_ROW = msg({ id: JOIN, senderId: READER, createdAt: NOTICE_AT, messageSource: 'system', messageType: 'system', metadata: { kind: 'member-joined' } });

const participant = (id: string, overrides: Partial<ParticipantRow> = {}): ParticipantRow => ({
  id,
  userId: `u-${id}`,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
  ...overrides,
});

type World = {
  messages?: MessageRow[];
  participants?: ParticipantRow[];
  announcement?: boolean;
  clearedBefore?: Record<string, Date>;
  hidden?: Record<string, string[]>;
  links?: { id: string; allowViewHistory: boolean; expiresAt: Date | null }[];
  failMessages?: boolean;
  failHiding?: boolean;
};

const isLiveNoticeWhere = (where: Record<string, unknown>): boolean => JSON.stringify(where).includes('"messageSource":"system"');

function fakePrisma(world: World = {}) {
  const messages = world.messages ?? [msg({ id: CAPTURED }), NOTICE_ROW, JOIN_ROW];
  const participants = world.participants ?? [participant(CAPTURER), participant(AUTHOR), participant(READER)];
  return {
    message: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (world.failMessages) throw new Error('mongo down');
        const ids = (where.id as { in?: string[] } | undefined)?.in;
        const conversations = (where.conversationId as { in?: string[] } | undefined)?.in;
        return messages.filter(
          (m) =>
            (!ids || ids.includes(m.id)) &&
            (!conversations || conversations.includes(m.conversationId)) &&
            (!isLiveNoticeWhere(where) || (m.messageSource === 'system' && m.expiresAt !== null && m.deletedAt === null)),
        );
      },
    },
    participant: {
      findMany: async () => participants,
    },
    conversation: {
      findUnique: async () => ({ isAnnouncementChannel: world.announcement ?? false }),
    },
    conversationShareLink: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => (world.links ?? []).filter((l) => where.id.in.includes(l.id)),
    },
    userConversationPreferences: {
      findMany: async () => {
        if (world.failHiding) throw new Error('mongo down');
        return Object.entries(world.clearedBefore ?? {}).map(([userId, clearHistoryBefore]) => ({ userId, clearHistoryBefore }));
      },
    },
    userMessageDeletion: {
      findMany: async () =>
        Object.entries(world.hidden ?? {}).flatMap(([userId, ids]) => ids.map((messageId) => ({ userId, messageId }))),
    },
  } as unknown as PrismaClient;
}

describe('unservedCaptureNoticeIds — ce qu’une page ne sert pas à un lecteur', () => {
  it('rend l’avis à cacher pour un lecteur arrivé après le message capturé, rien pour celui qui le lit', async () => {
    const prisma = fakePrisma();
    const late = viewer({ participantId: LATE, floor: new Date(SENT_AT.getTime() + 1) });
    expect(await unservedCaptureNoticeIds(prisma, { conversationId: CONV, viewer: late })).toEqual([NOTICE]);
    expect(await unservedCaptureNoticeIds(prisma, { conversationId: CONV, viewer: viewer() })).toEqual([]);
  });

  it('lit le drapeau du canal d’annonces', async () => {
    const prisma = fakePrisma({ announcement: true });
    expect(await unservedCaptureNoticeIds(prisma, { conversationId: CONV, viewer: viewer() })).toEqual([NOTICE]);
    expect(await unservedCaptureNoticeIds(prisma, { conversationId: CONV, viewer: viewer({ participantId: AUTHOR }) })).toEqual([]);
  });

  it('ne touche jamais un message système qui n’est pas un avis de capture', async () => {
    const prisma = fakePrisma({ messages: [msg({ id: CAPTURED }), JOIN_ROW] });
    const late = viewer({ participantId: LATE, floor: new Date(SENT_AT.getTime() + 1) });
    expect(await unservedCaptureNoticeIds(prisma, { conversationId: CONV, viewer: late })).toEqual([]);
  });

  it('propage une lecture qui ne conclut pas — l’appelant ne sert rien', async () => {
    await expect(unservedCaptureNoticeIds(fakePrisma({ failMessages: true }), { conversationId: CONV, viewer: viewer() })).rejects.toThrow('mongo down');
  });
});

describe('uncountedCaptureNotices — ce que le compteur écarte, par participant (#9630)', () => {
  it('écarte l’avis pour tout participant sauf l’auteur du message capturé ; un autre message système reste compté', async () => {
    const uncounted = await uncountedCaptureNotices(fakePrisma(), [NOTICE, JOIN]);
    expect([...uncounted(READER)]).toEqual([NOTICE]);
    expect([...uncounted(CAPTURER)]).toEqual([NOTICE]);
    expect([...uncounted(AUTHOR)]).toEqual([]);
  });

  it('écarte TOUS les candidats pour tout le monde quand la lecture échoue', async () => {
    const uncounted = await uncountedCaptureNotices(fakePrisma({ failMessages: true }), [NOTICE, JOIN]);
    expect([...uncounted(AUTHOR)]).toEqual([NOTICE, JOIN]);
  });

  it('ne lit rien quand il n’y a aucun candidat', async () => {
    const uncounted = await uncountedCaptureNotices(fakePrisma({ failMessages: true }), []);
    expect([...uncounted(READER)]).toEqual([]);
  });
});

describe('captureNoticeAudience — à qui la diffusion porte l’avis (#9629 b)', () => {
  const capturedRow = captured();
  const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id).sort();

  it('porte l’avis aux lecteurs du message capturé, à celui qui capture et à l’auteur', async () => {
    const prisma = fakePrisma({
      participants: [
        participant(CAPTURER),
        participant(AUTHOR),
        participant(READER),
        participant(LATE, { historyVisibleFrom: new Date(SENT_AT.getTime() + 1) }),
      ],
    });
    const audience = await captureNoticeAudience(prisma, { conversationId: CONV, noticeSenderId: CAPTURER, captured: capturedRow, now: NOW });
    expect(ids(audience)).toEqual([CAPTURER, AUTHOR, READER].sort());
    expect(audience.find((r) => r.id === READER)).toEqual({ id: READER, userId: `u-${READER}`, joinedAt: new Date('2026-01-01T00:00:00.000Z') });
  });

  it('exclut qui a vidé son historique ou retiré le message de sa vue', async () => {
    const prisma = fakePrisma({
      participants: [participant(CAPTURER), participant(AUTHOR), participant(READER), participant(LATE)],
      clearedBefore: { [`u-${READER}`]: new Date(SENT_AT.getTime() + 1) },
      hidden: { [`u-${LATE}`]: [CAPTURED] },
    });
    const audience = await captureNoticeAudience(prisma, { conversationId: CONV, noticeSenderId: CAPTURER, captured: capturedRow, now: NOW });
    expect(ids(audience)).toEqual([CAPTURER, AUTHOR].sort());
  });

  it('exclut un invité dont le lien refuse l’historique ou a échu', async () => {
    const prisma = fakePrisma({
      participants: [
        participant(CAPTURER),
        participant(AUTHOR),
        participant(GUEST, { userId: null, user: null, shareLinkId: 'l-closed', joinedAt: new Date(SENT_AT.getTime() + 1) }),
        participant(LATE, { userId: null, user: null, shareLinkId: 'l-expired', joinedAt: new Date('2026-01-01T00:00:00Z') }),
      ],
      links: [
        { id: 'l-closed', allowViewHistory: false, expiresAt: null },
        { id: 'l-expired', allowViewHistory: true, expiresAt: new Date(NOW.getTime() - 1) },
      ],
    });
    const audience = await captureNoticeAudience(prisma, { conversationId: CONV, noticeSenderId: CAPTURER, captured: capturedRow, now: NOW });
    expect(ids(audience)).toEqual([CAPTURER, AUTHOR].sort());
  });

  it('dans un canal d’annonces, ne garde que les modérateurs et les deux intéressés', async () => {
    const prisma = fakePrisma({
      announcement: true,
      participants: [participant(CAPTURER), participant(AUTHOR), participant(READER), participant(MOD, { role: 'moderator' })],
    });
    const audience = await captureNoticeAudience(prisma, { conversationId: CONV, noticeSenderId: CAPTURER, captured: capturedRow, now: NOW });
    expect(ids(audience)).toEqual([CAPTURER, AUTHOR, MOD].sort());
  });

  it('échoue FERMÉ : un masquage illisible ne garde que les deux intéressés', async () => {
    const prisma = fakePrisma({ failHiding: true });
    const audience = await captureNoticeAudience(prisma, { conversationId: CONV, noticeSenderId: CAPTURER, captured: capturedRow, now: NOW });
    expect(ids(audience)).toEqual([CAPTURER, AUTHOR].sort());
  });
});
