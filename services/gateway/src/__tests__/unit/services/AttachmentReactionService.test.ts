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
import { CLOSED_CONVERSATION_REACTION_ERROR } from '../../../services/ReactionService';

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
      count: (jest.fn() as jest.Mock<any>).mockResolvedValue(0),
      deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
      upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
    },
    message: {
      // Défaut : un message VIVANT (non supprimé, non système) dans une
      // conversation OUVERTE — la garde d'admission d'écriture le laisse passer.
      // Les témoins de garde surchargent ce défaut avec la forme fautive.
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({
        deletedAt: null,
        messageType: 'text',
        conversation: { isActive: true, closedAt: null },
      }),
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

  it('upserts on the (attachmentId, participantId, emoji) TRIPLE key when user has no such reaction (multi-réactions)', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(prisma.attachmentReaction.findMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledWith({
      where: { attachment_participant_reaction: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji } },
      create: { attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji },
      update: {},
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

  it('reports changed=true when STACKING a second different emoji (multi-réactions, plus jamais de swap)', async () => {
    const emoji = makeEmoji('❤️');
    const prisma = makePrisma({
      attachmentReaction: {
        // la détection de no-op est sur la clé TRIPLE : le 👍 déjà posé ne
        // matche pas la recherche du ❤️
        findUnique: (jest.fn() as jest.Mock<any>).mockImplementation(({ where }: any) =>
          Promise.resolve(where.attachment_participant_reaction.emoji === '👍' ? { emoji: '👍' } : null)
        ),
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
        count: (jest.fn() as jest.Mock<any>).mockResolvedValue(1),
        deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
        upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(result).toEqual({ changed: true });
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  it('a first add goes through the atomic triple-key upsert (no delete, no rewrite)', async () => {
    const emoji = makeEmoji('👍');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji });

    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} })
    );
  });

  it('stacks a different emoji atomically via the triple-key upsert — no delete, the first emoji survives', async () => {
    // Multi-réactions (2026-08-18) : deux adds concurrents du MÊME emoji
    // convergent sur le même document (l'upsert triple sérialise) ; deux
    // emojis différents créent chacun le leur — c'est le modèle.
    const newEmoji = makeEmoji('❤️');
    const prisma = makePrisma();
    const svc = new AttachmentReactionService(prisma);

    await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: newEmoji });

    expect(prisma.attachmentReaction.findMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledWith({
      where: { attachment_participant_reaction: { attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji: newEmoji } },
      create: { attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: newEmoji },
      update: {},
    });
  });
});

// ─── addAttachmentReaction : garde d'admission d'écriture (parité ReactionService) ──
//
// 5e transport de réaction conversation-scoped du dépôt. Comme la jumelle
// `ReactionService.addReaction`, l'ajout est refusé quand le conteneur est
// TERMINAL (conversation close) ou le message n'est plus réagissable (supprimé,
// système). La garde se relit CHEZ ELLE : le service charge lui-même l'état du
// message, il ne le reçoit pas de l'appelant. `isConversationClosed` (la SSOT de
// la règle terminale) n'est PAS mocké ici — le vrai code tranche.
describe('addAttachmentReaction — garde d’admission d’écriture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function liveMessage(overrides: Record<string, any> = {}) {
    return { deletedAt: null, messageType: 'text', conversation: { isActive: true, closedAt: null }, ...overrides };
  }

  it('refuse l’ajout dans une conversation CLOSE (closedAt) et ne persiste rien', async () => {
    makeEmoji('👍');
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValue(liveMessage({ conversation: { isActive: true, closedAt: new Date() } }));
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow(CLOSED_CONVERSATION_REACTION_ERROR);

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.count).not.toHaveBeenCalled();
  });

  it('refuse l’ajout dans une conversation close HÉRITÉE (isActive:false sans closedAt)', async () => {
    makeEmoji('👍');
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValue(liveMessage({ conversation: { isActive: false, closedAt: null } }));
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow(CLOSED_CONVERSATION_REACTION_ERROR);

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('refuse l’ajout sur une pièce jointe d’un message SUPPRIMÉ', async () => {
    makeEmoji('👍');
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValue(liveMessage({ deletedAt: new Date() }));
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow('deleted message');

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('refuse l’ajout sur une pièce jointe d’un message SYSTÈME', async () => {
    makeEmoji('👍');
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValue(liveMessage({ messageType: 'system' }));
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow('system message');

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('refuse l’ajout quand le message est introuvable (défense en profondeur)', async () => {
    makeEmoji('👍');
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValue(null);
    const svc = new AttachmentReactionService(prisma);

    await expect(
      svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: '👍' })
    ).rejects.toThrow('Message not found');

    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('LAISSE PASSER l’ajout dans une conversation vivante (message texte, non supprimé)', async () => {
    makeEmoji('👍');
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValue(liveMessage());
    const svc = new AttachmentReactionService(prisma);

    const result = await svc.addAttachmentReaction({ attachmentId: ATTACH_ID, messageId: MSG_ID, participantId: PARTICIPANT_ID, emoji: '👍' });

    expect(result).toEqual({ changed: true });
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── removeAttachmentReaction ─────────────────────────────────────────────────

describe('removeAttachmentReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('N’EST PAS gardé par l’état terminal : un retrait réussit dans une conversation CLOSE (parité removeReaction)', async () => {
    makeEmoji('👍');
    const prisma = makePrisma({
      attachmentReaction: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
        findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
        deleteMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 }),
        upsert: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      },
      message: {
        findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ deletedAt: null, messageType: 'text', conversation: { isActive: false, closedAt: new Date() } }),
      },
    });
    const svc = new AttachmentReactionService(prisma);

    expect(await svc.removeAttachmentReaction({ attachmentId: ATTACH_ID, participantId: PARTICIPANT_ID, emoji: '👍' })).toBe(true);
    // Le retrait ne consulte même pas l'état du message.
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
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
