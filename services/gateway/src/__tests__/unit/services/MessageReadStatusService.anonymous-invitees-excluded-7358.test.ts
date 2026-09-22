/**
 * Issue #7358 — G9 — Dettes des accusés gateway
 *
 * Invités anonymes doivent être exclus des détails de statut de pièces jointes.
 * Les participants avec userId: null ne devraient jamais figurer dans la réponse.
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

describe('MessageReadStatusService.getAttachmentStatusDetails — anonymous invitees excluded', () => {
  let service: MessageReadStatusService;
  let mockPrisma: any;

  const testAttachmentId = 'attach-123';

  beforeEach(() => {
    mockPrisma = {
      messageAttachment: {
        findUnique: jest.fn(),
      },
      attachmentStatusEntry: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      participant: {
        findMany: jest.fn(),
      },
    };

    service = new MessageReadStatusService(mockPrisma);
  });

  it('excludes anonymous participants (userId: null) from attachment status details', async () => {
    // Setup: attachment exists with valid message
    mockPrisma.messageAttachment.findUnique.mockResolvedValue({
      message: { createdAt: new Date('2025-01-01T10:00:00Z') },
    });

    const viewedAt = new Date('2025-01-02T11:00:00Z');

    // Setup: two status entries — one for a real user, one for an anonymous invitee
    mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
      {
        participantId: 'p-real-user',
        viewedAt,
        downloadedAt: null,
        listenedAt: null,
        watchedAt: null,
        listenCount: 0,
        watchCount: 0,
        listenedComplete: false,
        watchedComplete: false,
        lastPlayPositionMs: null,
        lastWatchPositionMs: null,
        listenSegments: null,
        watchSegments: null,
        viewCount: 1,
        viewedLanguages: ['fr'],
      },
      {
        participantId: 'p-anonymous',
        viewedAt,
        downloadedAt: null,
        listenedAt: null,
        watchedAt: null,
        listenCount: 0,
        watchCount: 0,
        listenedComplete: false,
        watchedComplete: false,
        lastPlayPositionMs: null,
        lastWatchPositionMs: null,
        listenSegments: null,
        watchSegments: null,
        viewCount: 1,
        viewedLanguages: null,
      },
    ]);

    // Setup: participant.findMany returns ONLY real users (with userId)
    // The database filter { userId: { not: null } } in the code excludes anonymous participants
    mockPrisma.participant.findMany.mockResolvedValue([
      {
        id: 'p-real-user',
        displayName: 'Alice',
        avatar: 'alice.png',
        userId: 'user-alice',
        user: { avatar: null },
      },
      // Anonymous participant NOT returned because it's filtered by { userId: { not: null } }
    ]);

    const result = await service.getAttachmentStatusDetails(testAttachmentId);

    // Assert: only the real user appears in the result
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0].participantId).toBe('p-real-user');
    expect(result.statuses[0].username).toBe('Alice');

    // Assert: anonymous participant is filtered out (it's an orphan row without a loaded participant)
    const anonStatus = result.statuses.find(s => s.participantId === 'p-anonymous');
    expect(anonStatus).toBeUndefined();
  });

  it('calls participant.findMany with userId filter to exclude anonymous invitees', async () => {
    mockPrisma.messageAttachment.findUnique.mockResolvedValue({
      message: { createdAt: new Date('2025-01-01T10:00:00Z') },
    });

    mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
      {
        participantId: 'p1',
        viewedAt: null,
        downloadedAt: null,
        listenedAt: null,
        watchedAt: null,
        listenCount: 0,
        watchCount: 0,
        listenedComplete: false,
        watchedComplete: false,
        lastPlayPositionMs: null,
        lastWatchPositionMs: null,
        listenSegments: null,
        watchSegments: null,
        viewCount: 0,
        viewedLanguages: null,
      },
    ]);

    mockPrisma.participant.findMany.mockResolvedValue([]);

    await service.getAttachmentStatusDetails(testAttachmentId);

    // Assert: participant.findMany is called with { userId: { not: null } }
    expect(mockPrisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['p1'] },
          userId: { not: null }, // Exclude anonymous invitees (#7358)
        }),
      })
    );
  });
});
