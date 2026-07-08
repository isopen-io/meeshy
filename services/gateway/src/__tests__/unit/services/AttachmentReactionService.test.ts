/**
 * Unit tests for AttachmentReactionService
 *
 * Covers all 5 public methods:
 * - addAttachmentReaction (emoji validation, atomic single-row upsert)
 * - removeAttachmentReaction
 * - getReactionSummary
 * - getCurrentUserReactions
 * - resolveConversationId
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSanitizeEmoji = jest.fn() as jest.Mock<any>;
const mockIsValidEmoji = jest.fn() as jest.Mock<any>;

jest.mock('@meeshy/shared/types/reaction', () => ({
  sanitizeEmoji: (...args: unknown[]) => mockSanitizeEmoji(...args),
  isValidEmoji: (...args: unknown[]) => mockIsValidEmoji(...args),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { AttachmentReactionService } from '../../../services/AttachmentReactionService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEmoji(emoji = '👍') {
  mockSanitizeEmoji.mockReturnValue(emoji);
  mockIsValidEmoji.mockReturnValue(true);
  return emoji;
}

function invalidEmoji() {
  mockSanitizeEmoji.mockReturnValue(null);
  mockIsValidEmoji.mockReturnValue(false);
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    attachmentReaction: {
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
      findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
      deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
      upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
    },
    message: {
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

const ATTACH_ID = 'attach-001';
const MSG_ID = 'msg-001';
const PARTICIPANT_ID = 'user-001';

// ─── addAttachmentReaction ────────────────────────────────────────────────────

describe('addAttachmentReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when emoji is invalid', async () => {
    invalidEmoji();
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: 'bad' })
    ).rejects.toThrow('Invalid emoji');

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('upserts on the (attachmentId, participantId) compound key — no emoji — when user has no existing reaction', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(prisma.attachmentReaction.findMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledWith({
      where: { attachment_participant_reaction: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID } },
      create: { attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji },
      update: { emoji },
    });
  });

  it('reports changed=true and upserts when the user has no existing reaction', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(result).toEqual({ changed: true });
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  it('reports changed=false and skips the upsert when the user already has exactly this emoji (idempotent no-op)', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma({
      attachmentReaction: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ emoji: '👍' }),
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
        deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
        upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(result).toEqual({ changed: false });
    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('reports changed=true when swapping the user from one emoji to a different one', async () => {
    const emoji = makeEmoji('❤️');
    const prisma = makePrisma({
      attachmentReaction: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ emoji: '👍' }),
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
        deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
        upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(result).toEqual({ changed: true });
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  it('re-adding the same emoji the user already has still goes through the atomic upsert (no delete)', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { emoji } })
    );
  });

  it('swaps to a different emoji atomically via upsert update — no separate delete step', async () => {
    // Regression for the duplicate-reaction race (2026-07-04, mirrors
    // ReactionService): the old find/deleteMany/upsert sequence let two
    // concurrent addAttachmentReaction calls with different emojis both pass
    // the "no existing reaction" check before either committed, so each
    // inserted its own row. The DB unique key is now (attachmentId,
    // participantId) with no emoji, so this upsert always targets the same
    // document regardless of which emoji is sent — concurrent calls race on
    // the same document instead of each creating one.
    const newEmoji = makeEmoji('❤️');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: newEmoji });

    expect(prisma.attachmentReaction.findMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledWith({
      where: { attachment_participant_reaction: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID } },
      create: { attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: newEmoji },
      update: { emoji: newEmoji },
    });
  });
});

// ─── removeAttachmentReaction ─────────────────────────────────────────────────

describe('removeAttachmentReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls deleteMany with sanitized emoji', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.removeAttachmentReaction({ attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji });

    expect(prisma.attachmentReaction.deleteMany).toHaveBeenCalledWith({
      where: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji },
    });
  });

  it('passes sanitized emoji (not original) to deleteMany', async () => {
    mockSanitizeEmoji.mockReturnValue('👍');
    mockIsValidEmoji.mockReturnValue(true);
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.removeAttachmentReaction({ attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji: '  👍  ' });

    expect(prisma.attachmentReaction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ emoji: '👍' }) })
    );
  });

  it('returns true when deleteMany removed a row', async () => {
    makeEmoji('👍');
    const prisma = makePrisma({
      attachmentReaction: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
        deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 }),
        upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    expect(await svc.removeAttachmentReaction({ attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji: '👍' })).toBe(true);
  });

  it('returns false when nothing matched (reaction already absent — idempotent)', async () => {
    makeEmoji('👍');
    const prisma = makePrisma(); // deleteMany default count: 0
    const svc = new AttachmentReactionService(prisma);

    expect(await svc.removeAttachmentReaction({ attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji: '👍' })).toBe(false);
  });
});

// ─── getReactionSummary ───────────────────────────────────────────────────────

describe('getReactionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty object when no reactions', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.getReactionSummary(ATTACH_ID);

    expect(result).toEqual({});
  });

  it('aggregates counts by emoji', async () => {
    const prisma = makePrisma({
      attachmentReaction: {
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([
          { emoji: '👍' },
          { emoji: '👍' },
          { emoji: '❤️' },
        ]),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.getReactionSummary(ATTACH_ID);

    expect(result).toEqual({ '👍': 2, '❤️': 1 });
  });

  it('queries by attachmentId', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.getReactionSummary(ATTACH_ID);

    expect(prisma.attachmentReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { attachmentId: ATTACH_ID } })
    );
  });
});

// ─── getCurrentUserReactions ──────────────────────────────────────────────────

describe('getCurrentUserReactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when user has no reactions', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.getCurrentUserReactions(ATTACH_ID, PARTICIPANT_ID);

    expect(result).toEqual([]);
  });

  it('returns list of emoji strings', async () => {
    const prisma = makePrisma({
      attachmentReaction: {
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([{ emoji: '👍' }, { emoji: '🔥' }]),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.getCurrentUserReactions(ATTACH_ID, PARTICIPANT_ID);

    expect(result).toEqual(['👍', '🔥']);
  });

  it('queries by both attachmentId and participantId', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.getCurrentUserReactions(ATTACH_ID, PARTICIPANT_ID);

    expect(prisma.attachmentReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID } })
    );
  });
});

// ─── resolveConversationId ────────────────────────────────────────────────────

describe('resolveConversationId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when message not found', async () => {
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.resolveConversationId(MSG_ID);

    expect(result).toBeNull();
  });

  it('returns conversationId when message found', async () => {
    const prisma = makePrisma({
      message: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ conversationId: 'conv-001' }),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.resolveConversationId(MSG_ID);

    expect(result).toBe('conv-001');
  });

  it('queries message by id with conversationId select', async () => {
    const prisma = makePrisma({
      message: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ conversationId: 'conv-001' }),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    await svc.resolveConversationId(MSG_ID);

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: MSG_ID },
      select: { conversationId: true },
    });
  });
});
