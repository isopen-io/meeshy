/**
 * Unit tests for socket-event-schemas.ts
 * Verifies that Zod schemas enforce size limits before business logic runs,
 * preventing DoS and oversized payload attacks at the boundary.
 */

import {
  SocketMessageSendSchema,
  SocketMessageSendWithAttachmentsSchema,
  SocketMessageEditSchema,
  SocketConversationJoinSchema,
  SocketConversationLeaveSchema,
  SocketReactionAddSchema,
  SocketTranslationRequestSchema,
} from '../../../validation/socket-event-schemas.js';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';

const VALID_MONGO_ID = '507f1f77bcf86cd799439011';
const VALID_CLIENT_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';

describe('SocketMessageSendSchema', () => {
  const base = {
    conversationId: VALID_MONGO_ID,
    content: 'Hello',
    clientMessageId: VALID_CLIENT_ID,
  };

  it('accepts a valid minimal message', () => {
    expect(SocketMessageSendSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty conversationId', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, conversationId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a conversationId exceeding 255 chars', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, conversationId: 'a'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 100 000 chars', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, content: 'x'.repeat(100_001) });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 100 000 chars', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, content: 'x'.repeat(100_000) });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid clientMessageId', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, clientMessageId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid replyToId', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, replyToId: 'not-an-objectid' });
    expect(result.success).toBe(false);
  });

  // TROISIÈME PORTE de l'exemption de contenu vide (`MessageValidator`
  // :55-69) : le refine Zod de la route REST et le validateur la portent déjà,
  // le transport socket — chemin de repli documenté quand REST échoue — la
  // strippait en silence (`z.object` supprime tout champ non déclaré), donc
  // une diffusion de média sans texte arrivait au validateur SANS son motif
  // d'exemption et mourait en CONTENT_EMPTY.
  it('preserves copyAttachmentsFromMessageId (third door of the empty-content exemption)', () => {
    const result = SocketMessageSendSchema.safeParse({
      ...base,
      content: '',
      copyAttachmentsFromMessageId: VALID_MONGO_ID,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.copyAttachmentsFromMessageId).toBe(VALID_MONGO_ID);
  });

  it('rejects a copyAttachmentsFromMessageId that is not a MongoDB ObjectId', () => {
    const result = SocketMessageSendSchema.safeParse({
      ...base,
      copyAttachmentsFromMessageId: 'not-an-objectid',
    });
    expect(result.success).toBe(false);
  });
});

describe('SocketMessageSendWithAttachmentsSchema', () => {
  const base = {
    conversationId: VALID_MONGO_ID,
    content: '',
    attachmentIds: [VALID_MONGO_ID],
    clientMessageId: VALID_CLIENT_ID,
  };

  it('accepts a valid payload', () => {
    expect(SocketMessageSendWithAttachmentsSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty attachmentIds array', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: [] });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_ATTACHMENTS_PER_MESSAGE} attachment IDs`, () => {
    const ids = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, () => VALID_MONGO_ID);
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: ids });
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${MAX_ATTACHMENTS_PER_MESSAGE} attachment IDs`, () => {
    const ids = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, () => VALID_MONGO_ID);
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: ids });
    expect(result.success).toBe(true);
  });

  // Le composer iOS plafonne à 199 depuis le 2026-08-14 : un envoi plein doit
  // franchir CE schéma, qui bornait à 100.
  it('accepts a full iOS composer selection (199 pieces)', () => {
    const ids = Array.from({ length: 199 }, () => VALID_MONGO_ID);
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: ids });
    expect(result.success).toBe(true);
  });

  it('rejects attachment IDs that are not valid MongoDB ObjectIds', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({
      ...base,
      attachmentIds: ['not-an-objectid'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 100 000 chars', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({
      ...base,
      content: 'x'.repeat(100_001),
    });
    expect(result.success).toBe(false);
  });

  // Effect-field parity with SocketMessageSendSchema (text path) and the REST
  // POST /messages route. Zod's z.object strips undeclared keys, so without
  // these fields a view-once / blurred / expiring photo sent over the PRIMARY
  // WebSocket attachment path is silently downgraded to a normal, non-ephemeral
  // attachment (the recipient can re-open a "view-once" photo forever, a
  // "blurred" spoiler renders unblurred, a disappearing message never expires).
  // They must survive validation here exactly as they do on the text path.
  it('preserves message-effect fields (isViewOnce / isBlurred / expiresAt / effectFlags / maxViewOnceCount)', () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({
      ...base,
      isViewOnce: true,
      isBlurred: true,
      expiresAt,
      effectFlags: 3,
      maxViewOnceCount: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isViewOnce).toBe(true);
    expect(result.data.isBlurred).toBe(true);
    expect(result.data.expiresAt).toBe(expiresAt);
    expect(result.data.effectFlags).toBe(3);
    expect(result.data.maxViewOnceCount).toBe(1);
  });
});

describe('SocketMessageEditSchema', () => {
  const base = {
    messageId: VALID_MONGO_ID,
    content: 'Edited content',
  };

  it('accepts a valid edit', () => {
    expect(SocketMessageEditSchema.safeParse(base).success).toBe(true);
  });

  // Regression: the handler allows clearing a caption on an attachment message
  // (MessageHandler.handleMessageEdit gates emptiness on hasAttachments). A
  // `.min(1)` here would reject the empty string at the boundary and make that
  // branch unreachable, silently killing caption removal over the socket path.
  it('accepts empty content (caption removal on attachment messages)', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, content: '' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid messageId', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, messageId: 'not-an-objectid' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 100 000 chars', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, content: 'x'.repeat(100_001) });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 100 000 chars', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, content: 'x'.repeat(100_000) });
    expect(result.success).toBe(true);
  });
});

describe('SocketConversationJoinSchema', () => {
  it('accepts a valid conversationId', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: VALID_MONGO_ID }).success).toBe(true);
  });

  it('accepts a short identifier like "meeshy"', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: 'meeshy' }).success).toBe(true);
  });

  it('rejects an empty conversationId', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: '' }).success).toBe(false);
  });

  it('rejects a conversationId exceeding 255 chars', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: 'a'.repeat(256) }).success).toBe(false);
  });
});

describe('SocketTranslationRequestSchema', () => {
  it('accepts a 2-letter target language', () => {
    expect(SocketTranslationRequestSchema.safeParse({ messageId: VALID_MONGO_ID, targetLanguage: 'fr' }).success).toBe(true);
  });

  // Parité SSOT `CommonSchemas.language` (`.max(6)`) : un code ISO 639-3
  // régionalisé (`bas-CM`) fait 6 caractères et doit passer.
  it('accepts a region-tagged 6-char target language (bas-CM)', () => {
    expect(SocketTranslationRequestSchema.safeParse({ messageId: VALID_MONGO_ID, targetLanguage: 'bas-CM' }).success).toBe(true);
  });

  it('rejects an over-long language code (7 chars)', () => {
    expect(SocketTranslationRequestSchema.safeParse({ messageId: VALID_MONGO_ID, targetLanguage: 'abcd-CM' }).success).toBe(false);
  });
});

describe('SocketConversationLeaveSchema', () => {
  it('accepts a valid conversationId', () => {
    expect(SocketConversationLeaveSchema.safeParse({ conversationId: VALID_MONGO_ID }).success).toBe(true);
  });

  it('rejects an empty conversationId', () => {
    expect(SocketConversationLeaveSchema.safeParse({ conversationId: '' }).success).toBe(false);
  });
});

describe('SocketReactionAddSchema', () => {
  it('accepts a simple single emoji', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '👍' });
    expect(result.success).toBe(true);
  });

  it('accepts a multi-person RGI family emoji (11 UTF-16 units)', () => {
    // 👨‍👩‍👧‍👦 is a single valid RGI grapheme (isValidEmoji accepts it) but is
    // 11 code units — the old max(10) length bound rejected it at the boundary
    // before the format check ran, blocking a nominal picker emoji.
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '👨‍👩‍👧‍👦' });
    expect(result.success).toBe(true);
  });

  it('accepts the longest common RGI grapheme (kiss with two skin tones, 15 units)', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '👩🏽‍❤️‍💋‍👨🏼' });
    expect(result.success).toBe(true);
  });

  it('rejects an oversized forged emoji payload', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '😀'.repeat(20) });
    expect(result.success).toBe(false);
  });

  it('rejects an empty emoji', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '' });
    expect(result.success).toBe(false);
  });
});

// Sticker (#4823) — les DEUX schémas d'envoi le conservent. Non déclaré,
// `z.object` le stripperait en silence et iOS ne verrait que le PNG de repli.
describe('sticker — les deux schémas d’envoi le conservent', () => {
  const sticker = { templateId: 'love.heart', slots: { caption: 'Toi' }, animation: 'heartbeat', emoji: '❤️' };

  it('SocketMessageSendSchema conserve `sticker`', () => {
    const result = SocketMessageSendSchema.safeParse({
      conversationId: VALID_MONGO_ID,
      content: '',
      clientMessageId: VALID_CLIENT_ID,
      sticker,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sticker).toEqual(sticker);
  });

  it('SocketMessageSendWithAttachmentsSchema conserve `sticker` — le chemin nominal (PNG + descripteur)', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({
      conversationId: VALID_MONGO_ID,
      content: '',
      attachmentIds: [VALID_MONGO_ID],
      clientMessageId: VALID_CLIENT_ID,
      sticker,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sticker).toEqual(sticker);
  });

  it('aucun des deux ne laisse passer un `metadata` brut', () => {
    const forged = { metadata: { sticker, postReplyTo: { id: 'volé' } } };
    const text = SocketMessageSendSchema.safeParse({
      conversationId: VALID_MONGO_ID, content: 'x', clientMessageId: VALID_CLIENT_ID, ...forged,
    });
    const media = SocketMessageSendWithAttachmentsSchema.safeParse({
      conversationId: VALID_MONGO_ID, content: '', attachmentIds: [VALID_MONGO_ID], clientMessageId: VALID_CLIENT_ID, ...forged,
    });
    expect(text.success && 'metadata' in text.data).toBe(false);
    expect(media.success && 'metadata' in media.data).toBe(false);
  });
});
