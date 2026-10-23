/**
 * #12333 — la description d'une pièce de conversation est traduite dans les
 * langues du pipeline, jamais pour une pièce protégée, et chaque langue reçue
 * rejoint ses lecteurs.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MessageAttachmentAltTranslationService } from '../MessageAttachmentAltTranslationService';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const OPEN = { isViewOnce: false, isBlurred: false, isEncrypted: false, encryptionMode: null };

function harness(row: Record<string, unknown> | null) {
  const update = jest.fn(async () => ({}));
  const runCommandRaw = jest.fn(async () => ({ n: 1 }));
  const prisma = { messageAttachment: { findUnique: jest.fn(async () => row), update }, $runCommandRaw: runCommandRaw };
  const translate = jest.fn(async () => undefined);
  const zmq = { translateToMultipleLanguages: translate, on: jest.fn() };
  const onTranslated = jest.fn(async () => undefined);
  const service = new MessageAttachmentAltTranslationService(prisma as never, zmq as never, onTranslated);
  return { service, update, runCommandRaw, translate, onTranslated };
}

describe('MessageAttachmentAltTranslationService', () => {
  it('traduit la description d’une pièce ordinaire vers les autres langues, sous son propre namespace', async () => {
    const { service, translate, update } = harness({ alt: 'Un chat roux dort sur le canapé du salon', ...OPEN });

    await service.trigger(ID);

    expect(update).toHaveBeenCalledWith({ where: { id: ID }, data: { altLanguage: 'fr', altTranslations: null } });
    expect(translate).toHaveBeenCalledWith('Un chat roux dort sur le canapé du salon', 'fr', ['en', 'es', 'ar', 'pt'], `message-attachment-alt:${ID}`, expect.any(String));
  });

  it.each([
    ['à vue unique', { isViewOnce: true }],
    ['floutée', { isBlurred: true }],
    ['chiffrée', { isEncrypted: true }],
    ['en mode e2ee', { encryptionMode: 'e2ee' }],
    ['dont la garde n’a pas été chargée', { isViewOnce: undefined }],
  ])('une pièce %s n’est JAMAIS traduite', async (_label, over) => {
    const { service, translate, update } = harness({ alt: 'Un chat', ...OPEN, ...over });
    await service.trigger(ID);
    expect(translate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('une langue reçue est fusionnée (sans écraser les autres) puis annoncée', async () => {
    const { service, runCommandRaw, onTranslated } = harness({ ...OPEN });

    await service.persist(ID, { targetLanguage: 'en', result: { translatedText: 'A red cat', confidenceScore: 0.9, translatorModel: 'nllb' } as never });

    const command = (runCommandRaw.mock.calls[0] as unknown[])[0] as { updates: Array<{ u: Array<{ $set: { altTranslations: { $mergeObjects: unknown[] } } }> }> };
    expect(command.updates[0].u[0].$set.altTranslations.$mergeObjects[1]).toEqual({ en: { $literal: expect.objectContaining({ text: 'A red cat' }) } });
    expect(onTranslated).toHaveBeenCalledWith(ID);
  });

  it('une pièce devenue protégée entre la demande et la réponse : rien n’est écrit', async () => {
    const { service, runCommandRaw, onTranslated } = harness({ ...OPEN, isBlurred: true });
    await service.persist(ID, { targetLanguage: 'en', result: { translatedText: 'A red cat' } as never });
    expect(runCommandRaw).not.toHaveBeenCalled();
    expect(onTranslated).not.toHaveBeenCalled();
  });
});
