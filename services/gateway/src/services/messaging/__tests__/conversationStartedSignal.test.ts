/**
 * « DÉMARRER UNE CONVERSATION » (#9635) — le fait de jeu se pose au point unique où une conversation créée vide
 * reçoit son premier message : la bascule gardée de `firstMessageSentAt`. Une bascule gagnée ⇒ un fait pour
 * l'auteur ; une bascule perdue (conversation déjà démarrée, ou non concernée) ⇒ rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { runMessagePostSaveEffects } from '../messagePostSaveEffects';

const settle = () => new Promise((resolve) => setImmediate(resolve));

const run = (flippedCount: number) => {
  const recordGameSignal = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
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
    engagementService: {
      recordActivity: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      recordConversationActivity: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      recordGameSignal,
    },
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
  return recordGameSignal;
};

describe('le premier message d’une conversation créée vide la démarre (#9635)', () => {
  it('la bascule gagnée pose le fait « conversation démarrée » pour l’auteur, clé = la conversation', async () => {
    const recordGameSignal = run(1);
    await settle();
    expect(recordGameSignal).toHaveBeenCalledWith('u1', 'conversation-started', { key: 'c1' });
  });

  it('une bascule perdue ne pose rien', async () => {
    const recordGameSignal = run(0);
    await settle();
    expect(recordGameSignal).not.toHaveBeenCalled();
  });
});
