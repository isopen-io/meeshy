/**
 * #14644 (B) — la bascule GAGNÉE de `firstMessageSentAt` est le point où un
 * groupe créé silencieux s'annonce à ses invités ; une bascule perdue (déjà
 * démarré, ou groupe d'avant le lot, sans le champ) n'annonce rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { runMessagePostSaveEffects } from '../messagePostSaveEffects';

const settle = () => new Promise((resolve) => setImmediate(resolve));

const run = (flippedCount: number) => {
  const announceStartedGroup = jest.fn<(conversationId: string) => Promise<void>>().mockResolvedValue(undefined);
  const prisma = {
    conversation: {
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: flippedCount }),
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
    },
    message: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
  };
  runMessagePostSaveEffects({
    prisma: prisma as never,
    translationService: null,
    startedGroupAnnouncer: { announceStartedGroup },
    message: {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'p1',
      senderUserId: 'u1',
      content: 'Salut',
      messageType: 'text',
      attachmentMimeTypes: [],
      hasSticker: false,
    },
    originalLanguage: 'fr',
  });
  return announceStartedGroup;
};

describe('#14644 — le premier message annonce le groupe', () => {
  it('une bascule gagnée annonce la conversation démarrée', async () => {
    const announce = run(1);
    await settle();
    expect(announce).toHaveBeenCalledWith('c1');
  });

  it('une bascule perdue n’annonce rien', async () => {
    const announce = run(0);
    await settle();
    expect(announce).not.toHaveBeenCalled();
  });
});
