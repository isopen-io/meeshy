/**
 * MessageAttachmentCaptionTranslationService — unit tests
 *
 * Cœur du témoin (#6533) : un attachement PROTÉGÉ (vue unique, flou,
 * chiffrement — chacun séparément, et un signal absent) ne déclenche JAMAIS
 * de traduction — ni écriture Prisma, ni envoi ZMQ. Rouge sans la garde,
 * vert avec elle (voir la dernière description de chaque bloc « protégé »).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import {
  MessageAttachmentCaptionTranslationService,
  messageAttachmentCaptionMayTranslate,
} from '../MessageAttachmentCaptionTranslationService';

const makeMockZmqClient = () => ({
  translateToMultipleLanguages: jest.fn<any>(async () => {}),
});

const makeMockPrisma = (attachment: object | null) => ({
  messageAttachment: {
    findUnique: jest.fn<any>(async () => attachment),
    update: jest.fn<any>(async () => ({})),
  },
});

describe('messageAttachmentCaptionMayTranslate', () => {
  const unprotected = { isViewOnce: false, isBlurred: false, isEncrypted: false, encryptionMode: null };

  it('authorizes translation only when all three signals are explicitly disarmed', () => {
    expect(messageAttachmentCaptionMayTranslate(unprotected)).toBe(true);
  });

  it('refuses on isViewOnce', () => {
    expect(messageAttachmentCaptionMayTranslate({ ...unprotected, isViewOnce: true })).toBe(false);
  });

  it('refuses on isBlurred', () => {
    expect(messageAttachmentCaptionMayTranslate({ ...unprotected, isBlurred: true })).toBe(false);
  });

  it('refuses on isEncrypted', () => {
    expect(messageAttachmentCaptionMayTranslate({ ...unprotected, isEncrypted: true })).toBe(false);
  });

  it('refuses on a non-null encryptionMode even when isEncrypted reads false', () => {
    expect(messageAttachmentCaptionMayTranslate({ ...unprotected, encryptionMode: 'e2ee' })).toBe(false);
  });

  it('fails CLOSED when a signal is missing — an incomplete select must never authorize', () => {
    expect(messageAttachmentCaptionMayTranslate({ isViewOnce: false, isBlurred: false, isEncrypted: undefined })).toBe(false);
    expect(messageAttachmentCaptionMayTranslate({ isViewOnce: undefined, isBlurred: false, isEncrypted: false })).toBe(false);
    expect(messageAttachmentCaptionMayTranslate({} as any)).toBe(false);
  });
});

describe('MessageAttachmentCaptionTranslationService.triggerMessageAttachmentCaptionTranslation', () => {
  beforeEach(() => {
    (MessageAttachmentCaptionTranslationService as any)._shared = null;
  });

  it('does nothing when the attachment cannot be found', async () => {
    const prisma = makeMockPrisma(null);
    const zmq = makeMockZmqClient();
    const service = MessageAttachmentCaptionTranslationService.init(prisma as any, zmq as any);

    await service.triggerMessageAttachmentCaptionTranslation('missing-1', 'Bonjour');

    expect(prisma.messageAttachment.update).not.toHaveBeenCalled();
    expect(zmq.translateToMultipleLanguages).not.toHaveBeenCalled();
  });

  describe('a protected attachment never triggers a translation', () => {
    const cases: Array<[string, object]> = [
      ['isViewOnce', { isViewOnce: true, isBlurred: false, isEncrypted: false, encryptionMode: null }],
      ['isBlurred', { isViewOnce: false, isBlurred: true, isEncrypted: false, encryptionMode: null }],
      ['isEncrypted', { isViewOnce: false, isBlurred: false, isEncrypted: true, encryptionMode: null }],
      ['encryptionMode', { isViewOnce: false, isBlurred: false, isEncrypted: false, encryptionMode: 'e2ee' }],
    ];

    it.each(cases)('%s — no Prisma write, no ZMQ send', async (_label, signals) => {
      const prisma = makeMockPrisma(signals);
      const zmq = makeMockZmqClient();
      const service = MessageAttachmentCaptionTranslationService.init(prisma as any, zmq as any);

      await service.triggerMessageAttachmentCaptionTranslation('attachment-1', 'Bonjour le monde');

      expect(prisma.messageAttachment.update).not.toHaveBeenCalled();
      expect(zmq.translateToMultipleLanguages).not.toHaveBeenCalled();
    });
  });

  it('clears both columns without sending anything when the caption is emptied', async () => {
    const unprotected = { isViewOnce: false, isBlurred: false, isEncrypted: false, encryptionMode: null };
    const prisma = makeMockPrisma(unprotected);
    const zmq = makeMockZmqClient();
    const service = MessageAttachmentCaptionTranslationService.init(prisma as any, zmq as any);

    await service.triggerMessageAttachmentCaptionTranslation('attachment-1', '   ');

    expect(prisma.messageAttachment.update).toHaveBeenCalledWith({
      where: { id: 'attachment-1' },
      data: { captionLanguage: null, captionTranslations: null },
    });
    expect(zmq.translateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('detects the source language, invalidates before relaunching, and sends the namespaced ZMQ request for an unprotected attachment', async () => {
    const unprotected = { isViewOnce: false, isBlurred: false, isEncrypted: false, encryptionMode: null };
    const prisma = makeMockPrisma(unprotected);
    const zmq = makeMockZmqClient();
    const service = MessageAttachmentCaptionTranslationService.init(prisma as any, zmq as any);

    await service.triggerMessageAttachmentCaptionTranslation('attachment-1', 'Bonjour le monde');

    expect(prisma.messageAttachment.update).toHaveBeenCalledWith({
      where: { id: 'attachment-1' },
      data: { captionLanguage: 'fr', captionTranslations: null },
    });
    expect(zmq.translateToMultipleLanguages).toHaveBeenCalledWith(
      'Bonjour le monde',
      'fr',
      expect.arrayContaining(['en', 'es', 'ar', 'pt']),
      'message-attachment-caption:attachment-1',
      'message_attachment_caption_context:attachment-1',
    );
    // La langue source ne figure jamais parmi ses propres cibles.
    const targetLanguages = zmq.translateToMultipleLanguages.mock.calls[0][2] as string[];
    expect(targetLanguages).not.toContain('fr');
  });

  it('swallows a ZMQ send failure — the trigger is fire-and-forget', async () => {
    const unprotected = { isViewOnce: false, isBlurred: false, isEncrypted: false, encryptionMode: null };
    const prisma = makeMockPrisma(unprotected);
    const zmq = {
      translateToMultipleLanguages: jest.fn<any>(async () => {
        throw new Error('zmq down');
      }),
    };
    const service = MessageAttachmentCaptionTranslationService.init(prisma as any, zmq as any);

    await expect(
      service.triggerMessageAttachmentCaptionTranslation('attachment-1', 'Bonjour le monde'),
    ).resolves.toBeUndefined();
  });
});
