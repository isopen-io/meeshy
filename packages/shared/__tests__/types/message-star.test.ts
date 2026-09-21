/**
 * Le contrat du favori de message (#7377) — les frontières que le serveur et
 * les clients lisent avec le MÊME schéma.
 */
import { describe, it, expect } from 'vitest';

import {
  STARRED_MESSAGES_DEFAULT_LIMIT,
  STARRED_MESSAGES_MAX_LIMIT,
  starMessageParamsSchema,
  starredMessageItemSchema,
  starredMessagesQuerySchema,
} from '../../types/message-star';
import { SERVER_EVENTS } from '../../types/socketio-events';

const MESSAGE_ID = '507f1f77bcf86cd799439041';

function servedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439051',
    starredAt: '2026-09-21T10:00:00.000Z',
    message: {
      id: MESSAGE_ID,
      conversationId: '507f1f77bcf86cd799439021',
      messageType: 'text',
      createdAt: '2026-09-20T10:00:00.000Z',
      editedAt: null,
      isProtected: false,
      content: 'Hello',
      originalLanguage: 'en',
      translations: [
        { id: `${MESSAGE_ID}-fr`, messageId: MESSAGE_ID, targetLanguage: 'fr', translatedContent: 'Bonjour' },
      ],
      attachments: [],
    },
    sender: { id: 'p1', userId: 'u1', displayName: 'Ada', avatar: null, username: 'ada' },
    conversation: { id: '507f1f77bcf86cd799439021', identifier: 'mshy_x', type: 'group', name: 'Équipe', avatar: null },
    ...overrides,
  };
}

describe('starMessageParamsSchema', () => {
  it('accepte un ObjectId', () => {
    expect(starMessageParamsSchema.safeParse({ messageId: MESSAGE_ID }).success).toBe(true);
  });

  it("refuse ce qui n'est pas un ObjectId — Prisma lèverait sur une colonne @db.ObjectId", () => {
    expect(starMessageParamsSchema.safeParse({ messageId: 'starred' }).success).toBe(false);
    expect(starMessageParamsSchema.safeParse({ messageId: `${MESSAGE_ID}0` }).success).toBe(false);
  });
});

describe('starredMessagesQuerySchema', () => {
  it('pose la limite par défaut quand elle est absente', () => {
    const parsed = starredMessagesQuerySchema.parse({});
    expect(parsed.limit).toBe(STARRED_MESSAGES_DEFAULT_LIMIT);
    expect(parsed.cursor).toBeUndefined();
  });

  it('coerce la limite reçue en chaîne de requête', () => {
    expect(starredMessagesQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('borne la limite au plafond', () => {
    expect(starredMessagesQuerySchema.safeParse({ limit: String(STARRED_MESSAGES_MAX_LIMIT + 1) }).success).toBe(false);
    expect(starredMessagesQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('refuse un curseur vide', () => {
    expect(starredMessagesQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('starredMessageItemSchema', () => {
  it('décode une ligne servie', () => {
    expect(starredMessageItemSchema.safeParse(servedItem()).success).toBe(true);
  });

  it('décode une ligne PLACEHOLDER : aucun texte, aucune traduction, aucune pièce jointe', () => {
    const placeholder = servedItem({
      message: {
        ...servedItem().message,
        isProtected: true,
        content: null,
        originalLanguage: null,
        translations: [],
        attachments: [],
      },
    });
    expect(starredMessageItemSchema.safeParse(placeholder).success).toBe(true);
  });

  it("décode une pièce jointe masquée, sans URL", () => {
    const item = servedItem({
      message: {
        ...servedItem().message,
        attachments: [{ id: 'a1', mimeType: 'image/jpeg', fileUrl: null, thumbnailUrl: null, isMasked: true }],
      },
    });
    expect(starredMessageItemSchema.safeParse(item).success).toBe(true);
  });
});

describe('SERVER_EVENTS.MESSAGE_STARRED', () => {
  it('suit la convention entity:action-word', () => {
    expect(SERVER_EVENTS.MESSAGE_STARRED).toBe('message:starred');
  });
});
