/**
 * `markAudioAsListened` crédite `tool.voice_listened` (#8959) — une seule fois,
 * au PREMIER passage à « écouté en entier », à l'auditeur, en nommant l'auteur
 * du vocal (s'écouter soi-même ne rapporte rien : le moteur le refuse).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MessageMediaConsumptionService } from '../../../services/MessageMediaConsumptionService';

const ATTACHMENT_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const LISTENER_PARTICIPANT = '507f1f77bcf86cd799439014';
const LISTENER_USER = '507f1f77bcf86cd799439015';
const AUTHOR_USER = '507f1f77bcf86cd799439016';

function build(options: { previouslyComplete?: boolean; listenerUserId?: string | null } = {}) {
  const prisma: any = {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        message: { conversationId: CONV_ID, sender: { userId: AUTHOR_USER } },
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    attachmentStatusEntry: {
      findUnique: jest.fn<any>().mockResolvedValue(
        options.previouslyComplete === undefined
          ? null
          : { listenSegments: null, viewedLanguages: [], lastPlayPositionMs: 1000, listenedComplete: options.previouslyComplete },
      ),
      upsert: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue(
        options.listenerUserId === null ? { userId: null } : { userId: options.listenerUserId ?? LISTENER_USER },
      ),
      count: jest.fn<any>().mockResolvedValue(2),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));
  const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
  const service = new MessageMediaConsumptionService(prisma, engagement);
  return { service, engagement, prisma };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('tool.voice_listened', () => {
  it('crédite l\'auditeur au premier passage à « écouté en entier »', async () => {
    const { service, engagement } = build({ previouslyComplete: false });
    await service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { complete: true });
    await flush();

    expect(engagement.recordActivity).toHaveBeenCalledWith(LISTENER_USER, 'tool.voice_listened', {
      conversationId: CONV_ID,
      targetId: ATTACHMENT_ID,
      targetOwnerId: AUTHOR_USER,
    });
  });

  it('crédite aussi une première écoute complète sans état antérieur', async () => {
    const { service, engagement } = build();
    await service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { complete: true });
    await flush();

    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
  });

  it('ne crédite pas une réécoute d\'un vocal déjà écouté en entier', async () => {
    const { service, engagement } = build({ previouslyComplete: true });
    await service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { complete: true });
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite pas une écoute partielle', async () => {
    const { service, engagement } = build({ previouslyComplete: false });
    await service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { playPositionMs: 4000 });
    await service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { complete: false });
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien pour un auditeur anonyme', async () => {
    const { service, engagement } = build({ previouslyComplete: false, listenerUserId: null });
    await service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { complete: true });
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('une panne du crédit ne fait pas échouer le rapport d\'écoute', async () => {
    const { service, engagement } = build({ previouslyComplete: false });
    engagement.recordActivity.mockRejectedValue(new Error('down'));
    await expect(
      service.markAudioAsListened(LISTENER_PARTICIPANT, ATTACHMENT_ID, { complete: true }),
    ).resolves.toEqual({ position: 1000, complete: true });
    await flush();
  });
});
