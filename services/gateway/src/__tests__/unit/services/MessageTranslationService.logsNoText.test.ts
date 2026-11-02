/**
 * #12822 (M2) — les journaux de la traduction ne portent jamais le texte d'un
 * message. Les deux courts-circuits (message fait d'émojis, message fait d'un
 * lien) journalisaient `content.substring(…)` : le début d'un message
 * `server`/`hybrid`, chiffré au repos dans MongoDB, se posait en clair dans les
 * journaux de la passerelle. Ils n'en disent plus que la longueur.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const journal: unknown[][] = [];
const record = (...args: unknown[]) => { journal.push(args); };

jest.mock('../../../utils/logger-enhanced', () => {
  const sink = { debug: record, info: record, warn: record, error: record, trace: record };
  return { enhancedLogger: { ...sink, child: () => sink }, performanceLogger: { withTiming: (_n: unknown, fn: () => unknown) => fn() } };
});

class FakeZmqClient extends EventEmitter {
  sendTranslationRequest = jest.fn(async (_request: unknown) => 'task-1');
  healthCheck = jest.fn(async () => true);
  close = jest.fn(async () => undefined);
}

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn(async () => new FakeZmqClient()) },
}));

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const journaled = (): string => JSON.stringify(journal);

const handle = async (content: string) => {
  journal.splice(0, journal.length);
  const service = new MessageTranslationService({} as PrismaClient);
  return service.handleNewMessage({
    id: MSG_ID, conversationId: CONV_ID, senderId: 'sender-1', content, originalLanguage: 'fr', messageType: 'text',
  } as never);
};

describe('les courts-circuits de traduction ne journalisent pas le texte', () => {
  it('un message fait d’un lien : la longueur, jamais l’adresse', async () => {
    const result = await handle('https://coffre.example/porte-4471');
    expect(result.status).toBe('url_only_skipped');
    expect(journaled()).not.toContain('4471');
    expect(journaled()).not.toContain('coffre.example');
  });

  it('un message fait d’émojis : la longueur, jamais les émojis', async () => {
    const result = await handle('🔐🗝️');
    expect(result.status).toBe('emoji_only_skipped');
    expect(journaled()).not.toContain('🔐');
  });
});
