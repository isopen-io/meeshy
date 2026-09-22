/**
 * Service tests — #7357: plancher d'historique sur attachments
 *
 * `MessageReadStatusService.getAttachmentStatusDetails()` devrait appliquer
 * le même plancher d'historique que `getMessageStatusDetails()` — un accusé
 * d'écoute est nominatif et fait partie de l'historique de la conversation.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

const ATTACHMENT_ID = '507f1f77bcf86cd799439014';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';

const HISTORY_FLOOR = new Date('2024-06-01T00:00:00Z');
const BEFORE_FLOOR = new Date('2024-01-01T00:00:00Z');
const AFTER_FLOOR = new Date('2024-09-01T00:00:00Z');

// --- Mocks ---

const mockPrisma: any = {
  messageAttachment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  attachmentStatusEntry: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  participant: {
    findMany: jest.fn(),
  },
};

describe('#7357 — MessageReadStatusService.getAttachmentStatusDetails respecte le plancher d\'historique', () => {
  let service: MessageReadStatusService;

  beforeEach(() => {
    service = new MessageReadStatusService(mockPrisma);
    jest.clearAllMocks();
  });

  it('rejette un attachment antérieur au plancher avec "Attachment not found"', async () => {
    mockPrisma.messageAttachment.findUnique.mockResolvedValue({
      id: ATTACHMENT_ID,
      message: {
        id: MESSAGE_ID,
        createdAt: BEFORE_FLOOR,
      },
    });

    await expect(
      service.getAttachmentStatusDetails(ATTACHMENT_ID, { historyFloor: HISTORY_FLOOR })
    ).rejects.toThrow('Attachment not found');
  });

  it('accepte un attachment postérieur au plancher', async () => {
    mockPrisma.messageAttachment.findUnique.mockResolvedValue({
      id: ATTACHMENT_ID,
      message: {
        id: MESSAGE_ID,
        createdAt: AFTER_FLOOR,
      },
    });

    mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
      {
        participantId: PARTICIPANT_ID,
        viewedAt: new Date(),
        downloadedAt: null,
        listenedAt: null,
        watchedAt: null,
        listenCount: 0,
        watchCount: 0,
        listenedComplete: false,
        watchedComplete: false,
        lastPlayPositionMs: null,
        lastWatchPositionMs: null,
        listenSegments: '[]',
        watchSegments: '[]',
        viewCount: 1,
        viewedLanguages: ['fr'],
      },
    ]);

    mockPrisma.participant.findMany.mockResolvedValue([
      {
        id: PARTICIPANT_ID,
        displayName: 'Test User',
        avatar: null,
        user: { avatar: null },
      },
    ]);

    const result = await service.getAttachmentStatusDetails(ATTACHMENT_ID, {
      historyFloor: HISTORY_FLOOR
    });

    expect(result.statuses).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  it('accepte un attachment sans plancher (plancher null)', async () => {
    mockPrisma.messageAttachment.findUnique.mockResolvedValue({
      id: ATTACHMENT_ID,
      message: {
        id: MESSAGE_ID,
        createdAt: BEFORE_FLOOR,
      },
    });

    mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.participant.findMany.mockResolvedValue([]);

    const result = await service.getAttachmentStatusDetails(ATTACHMENT_ID, {
      historyFloor: null
    });

    expect(result.statuses).toHaveLength(0);
  });

  it('rejette un attachment inexistant avec "Attachment not found"', async () => {
    mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

    await expect(
      service.getAttachmentStatusDetails(ATTACHMENT_ID, { historyFloor: HISTORY_FLOOR })
    ).rejects.toThrow('Attachment not found');
  });
});
