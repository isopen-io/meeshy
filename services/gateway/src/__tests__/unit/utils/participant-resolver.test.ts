import { resolveParticipantId, resolveSenderUserId } from '../../../utils/participant-resolver';

function makePrisma(participantOverride?: unknown) {
  return {
    participant: {
      findFirst: jest.fn().mockResolvedValue(participantOverride ?? null),
      findUnique: jest.fn().mockResolvedValue(participantOverride ?? null),
    },
  } as any;
}

describe('resolveParticipantId', () => {
  it('returns null when no matching participant', async () => {
    const prisma = makePrisma(null);
    const result = await resolveParticipantId(prisma, 'user-1', 'conv-1');
    expect(result).toBeNull();
  });

  it('returns participant id when found', async () => {
    const prisma = makePrisma({ id: 'participant-abc' });
    const result = await resolveParticipantId(prisma, 'user-1', 'conv-1');
    expect(result).toBe('participant-abc');
  });

  it('queries with isActive: true', async () => {
    const prisma = makePrisma(null);
    await resolveParticipantId(prisma, 'user-1', 'conv-1');
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', conversationId: 'conv-1', isActive: true },
      select: { id: true },
    });
  });
});

describe('resolveSenderUserId', () => {
  it('returns null when participant not found', async () => {
    const prisma = makePrisma(null);
    const result = await resolveSenderUserId(prisma, 'sender-id');
    expect(result).toBeNull();
  });

  it('returns userId when participant is found', async () => {
    const prisma = makePrisma({ userId: 'user-xyz' });
    const result = await resolveSenderUserId(prisma, 'sender-id');
    expect(result).toBe('user-xyz');
  });

  it('queries by participant id', async () => {
    const prisma = makePrisma(null);
    await resolveSenderUserId(prisma, 'sender-123');
    expect(prisma.participant.findUnique).toHaveBeenCalledWith({
      where: { id: 'sender-123' },
      select: { userId: true },
    });
  });
});
