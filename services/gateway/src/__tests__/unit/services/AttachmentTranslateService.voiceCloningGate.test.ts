/**
 * `POST /attachments/:id/translate` clonait par défaut, et ne regardait que le
 * DEMANDEUR quand la voix clonée est celle de l'ÉMETTEUR ORIGINAL (#17309).
 * Le clone n'est désormais transmis au translator que si la voix en jeu
 * appartient à un adulte consentant — `Message.senderId` désignant un
 * `Participant`, la loi se pose au compte derrière lui.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('fs', () => ({
  ...(jest.requireActual('fs') as object),
  promises: { readFile: jest.fn(async () => Buffer.from('audio')) },
}));

jest.mock('../../../services/attachments/atRest/atRestFiles', () => ({
  ...(jest.requireActual('../../../services/attachments/atRest/atRestFiles') as object),
  readStoredFileBytes: jest.fn(async () => Buffer.from('audio')),
}));

const translateSync = jest.fn(async (..._args: unknown[]) => ({
  translationId: 't', translations: [], processingTimeMs: 1,
}));
const translateAsync = jest.fn(async (..._args: unknown[]) => ({ jobId: 'j', status: 'queued' }));

jest.mock('../../../services/AudioTranslateService', () => ({
  ...(jest.requireActual('../../../services/AudioTranslateService') as object),
  AudioTranslateService: jest.fn().mockImplementation(() => ({ translateSync, translateAsync })),
}));

import { AttachmentTranslateService } from '../../../services/AttachmentTranslateService';

const CONSENTED = new Date('2026-01-01T00:00:00.000Z');
const ADULT = new Date('1990-06-15T00:00:00.000Z');
const MINOR = new Date(Date.UTC(new Date().getUTCFullYear() - 12, 0, 1));

const REQUESTER = 'u-requester';
const SENDER_USER = 'u-sender';
const SENDER_PARTICIPANT = 'p-sender';

function setup(births: { requester: Date | null; sender: Date | null }, senderUserId: string | null = SENDER_USER) {
  const users: Record<string, Date | null> = { [REQUESTER]: births.requester, [SENDER_USER]: births.sender };
  const attachment = {
    id: 'att-1',
    messageId: 'msg-1',
    mimeType: 'audio/webm',
    filePath: 'audio/a.webm',
    uploadedBy: REQUESTER,
    duration: 3000,
    transcription: null,
    translations: null,
    forwardedFromAttachmentId: null,
    message: { id: 'msg-1', conversationId: 'conv-1', senderId: SENDER_PARTICIPANT },
  };
  const prisma = {
    messageAttachment: {
      findUnique: jest.fn(async ({ select }: { select?: Record<string, unknown> }) =>
        select && !('id' in select) && 'forwardedFromAttachmentId' in select
          ? { forwardedFromAttachmentId: null, message: { senderId: SENDER_PARTICIPANT } }
          : attachment),
      update: jest.fn(async () => ({})),
    },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-requester' })),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === SENDER_PARTICIPANT ? { userId: senderUserId } : null),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id in users
          ? {
              dataProcessingConsentAt: CONSENTED,
              analyticsConsentAt: null,
              voiceDataConsentAt: CONSENTED,
              voiceProfileConsentAt: CONSENTED,
              voiceCloningEnabledAt: CONSENTED,
              birthDate: users[where.id],
            }
          : null),
    },
    userPreferences: { findUnique: jest.fn(async () => null) },
    userVoiceModel: { findUnique: jest.fn(async () => null) },
  };
  translateSync.mockClear();
  translateAsync.mockClear();
  const service = new AttachmentTranslateService(prisma as never, {} as never);
  return { service };
}

const sentClone = (mock: jest.Mock) => (mock.mock.calls[0]?.[1] as { generateVoiceClone?: boolean } | undefined)?.generateVoiceClone;

describe('AttachmentTranslateService — clonage vocal gardé par la voix en jeu (#17309)', () => {
  it('clone la voix d’un émetteur adulte consentant, demande laissée au défaut', async () => {
    const { service } = setup({ requester: ADULT, sender: ADULT });
    const result = await service.translate(REQUESTER, 'att-1', { targetLanguages: ['fr'] });

    expect(result).toMatchObject({ success: true });
    expect(sentClone(translateSync)).toBe(true);
  });

  it('ne clone pas la voix d’un émetteur MINEUR, même demandée par un adulte', async () => {
    const { service } = setup({ requester: ADULT, sender: MINOR });
    await service.translate(REQUESTER, 'att-1', { targetLanguages: ['fr'], generateVoiceClone: true });

    expect(sentClone(translateSync)).toBe(false);
  });

  it('ne clone pas la voix d’un émetteur sans date de naissance (fail-closed)', async () => {
    const { service } = setup({ requester: ADULT, sender: null });
    await service.translate(REQUESTER, 'att-1', { targetLanguages: ['fr'], async: true });

    expect(sentClone(translateAsync)).toBe(false);
  });

  it('ne clone pas la voix d’un invité sans compte', async () => {
    const { service } = setup({ requester: ADULT, sender: ADULT }, null);
    await service.translate(REQUESTER, 'att-1', { targetLanguages: ['fr'] });

    expect(sentClone(translateSync)).toBe(false);
  });

  it('un clone refusé par l’appelant reste refusé', async () => {
    const { service } = setup({ requester: ADULT, sender: ADULT });
    await service.translate(REQUESTER, 'att-1', { targetLanguages: ['fr'], generateVoiceClone: false });

    expect(sentClone(translateSync)).toBe(false);
  });
});
