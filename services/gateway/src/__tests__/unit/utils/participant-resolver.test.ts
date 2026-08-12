/**
 * Unit tests for participant-resolver utilities.
 * Covers: resolveParticipantId (found, not found, inactive),
 * resolveSenderUserId (found, not found).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveParticipantId,
  resolveSenderUserId,
} from '../../../utils/participant-resolver';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Factory ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Partial<{
  participantFindFirst: any;
  participantFindUnique: any;
}> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(overrides.participantFindFirst ?? null),
      findUnique: jest.fn<any>().mockResolvedValue(overrides.participantFindUnique ?? null),
    },
  } as unknown as PrismaClient;
}

// ─── resolveParticipantId ─────────────────────────────────────────────────────

describe('resolveParticipantId', () => {
  it('returns the participant id when found', async () => {
    const prisma = makePrisma({ participantFindFirst: { id: 'part-1' } });

    const result = await resolveParticipantId(prisma, 'user-1', 'conv-1');

    expect(result).toBe('part-1');
  });

  it('returns null when no active participant found', async () => {
    const prisma = makePrisma({ participantFindFirst: null });

    const result = await resolveParticipantId(prisma, 'user-2', 'conv-1');

    expect(result).toBeNull();
  });

  it('queries with isActive:true filter', async () => {
    const prisma = makePrisma({ participantFindFirst: null });

    await resolveParticipantId(prisma, 'user-3', 'conv-2');

    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      })
    );
  });

  it('queries with correct userId and conversationId', async () => {
    const prisma = makePrisma({ participantFindFirst: { id: 'part-2' } });

    await resolveParticipantId(prisma, 'user-5', 'conv-9');

    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-5', conversationId: 'conv-9' }),
      })
    );
  });
});

// ─── resolveSenderUserId ──────────────────────────────────────────────────────

describe('resolveSenderUserId', () => {
  it('returns userId when participant is found', async () => {
    const prisma = makePrisma({ participantFindUnique: { userId: 'user-99' } });

    const result = await resolveSenderUserId(prisma, 'part-abc');

    expect(result).toBe('user-99');
  });

  it('returns null when participant is not found', async () => {
    const prisma = makePrisma({ participantFindUnique: null });

    const result = await resolveSenderUserId(prisma, 'part-unknown');

    expect(result).toBeNull();
  });

  it('queries participant by the provided senderId', async () => {
    const prisma = makePrisma({ participantFindUnique: null });

    await resolveSenderUserId(prisma, 'part-xyz');

    expect(prisma.participant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'part-xyz' }),
      })
    );
  });
});
