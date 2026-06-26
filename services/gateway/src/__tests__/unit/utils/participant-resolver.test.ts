/**
 * Unit tests for utils/participant-resolver.ts
 * Covers: resolveParticipantId, resolveSenderUserId
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  resolveParticipantId,
  resolveSenderUserId,
} from '../../../utils/participant-resolver';

function makePrisma(): any {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

describe('resolveParticipantId', () => {
  it('returns the participant id when found', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce({ id: 'part-abc' });

    const result = await resolveParticipantId(prisma, 'user-1', 'conv-1');

    expect(result).toBe('part-abc');
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', conversationId: 'conv-1', isActive: true },
      select: { id: true },
    });
  });

  it('returns null when no active participant is found', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce(null);

    const result = await resolveParticipantId(prisma, 'user-1', 'conv-1');

    expect(result).toBeNull();
  });
});

describe('resolveSenderUserId', () => {
  it('returns the userId when participant is found', async () => {
    const prisma = makePrisma();
    prisma.participant.findUnique.mockResolvedValueOnce({ userId: 'user-abc' });

    const result = await resolveSenderUserId(prisma, 'part-1');

    expect(result).toBe('user-abc');
    expect(prisma.participant.findUnique).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      select: { userId: true },
    });
  });

  it('returns null when participant is not found', async () => {
    const prisma = makePrisma();
    prisma.participant.findUnique.mockResolvedValueOnce(null);

    const result = await resolveSenderUserId(prisma, 'ghost-part');

    expect(result).toBeNull();
  });
});
