/**
 * Unit tests for the SOURCE language sent to the translator by
 * `MessageTranslationService`.
 *
 * Prisme Linguistique — parité source/cible. The service already canonicalises
 * every TARGET language via the SSOT `normalizeLanguageCode`
 * (`_resolveTargetLanguages`), but historically sent the SOURCE verbatim
 * (`sourceLanguage: message.originalLanguage`). Clients transmit
 * `originalLanguage` as `Locale.current` (`'pt-BR'`, `'FR'`, `'de-DE'`) and the
 * field is persisted without normalisation, so a region-tagged code reaches the
 * ZMQ request. The translator resolves the source through
 * `LANGUAGE_MAPPINGS.get(src, 'eng_Latn')`: a region-tagged code absent from the
 * table SILENTLY falls back to `'eng_Latn'`, so NLLB translates the text as if
 * it were English — degraded/wrong translations for every cross-language reader.
 *
 * These tests pin the contract: the `sourceLanguage` field of every
 * `TranslationRequest` handed to `zmqClient.sendTranslationRequest` MUST be the
 * canonical code, exactly like the targets.
 *
 * The request-building paths are private; we exercise them through the public /
 * private entry points and capture the request via a mocked `zmqClient`, the
 * same casting pattern used by `message-translation-destinations.test.ts`.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

type CapturedRequest = {
  messageId: string;
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
  conversationId: string;
  modelType?: string;
};

/**
 * A stand-in for `ZmqTranslationClient`: an EventEmitter (so the event-driven
 * `translateTextDirectly` can await a completion) that records every request
 * and immediately echoes a matching `translationCompleted` event.
 */
function makeZmqMock() {
  const emitter = new EventEmitter();
  const requests: CapturedRequest[] = [];

  const sendTranslationRequest = jest.fn(async (req: CapturedRequest) => {
    requests.push(req);
    const taskId = `task_${requests.length}`;
    setImmediate(() => {
      emitter.emit('translationCompleted', {
        taskId,
        result: {
          messageId: req.messageId,
          translatedText: 'x',
          sourceLanguage: req.sourceLanguage,
          targetLanguage: req.targetLanguages[0],
          confidenceScore: 0.9,
          processingTime: 0,
          modelType: req.modelType ?? 'basic',
        },
      });
    });
    return taskId;
  });

  (emitter as unknown as { sendTranslationRequest: typeof sendTranslationRequest }).sendTranslationRequest =
    sendTranslationRequest;

  return { zmq: emitter, requests, sendTranslationRequest };
}

function injectZmq(svc: MessageTranslationService, zmq: EventEmitter) {
  (svc as unknown as { zmqClient: unknown }).zmqClient = zmq;
}

describe('MessageTranslationService — source language sent to the translator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalises a region-tagged originalLanguage on the initial translation request (pt-BR → pt)', async () => {
    // A cache miss forces a real ZMQ request. `translations: {}` → getTranslation
    // returns null for the target, so 'en' is a genuine miss.
    const prisma = {
      message: {
        findUnique: jest.fn(async () => ({ originalLanguage: 'pt-BR', translations: {} })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await (svc as unknown as {
      _processTranslationsAsync(message: unknown, targetLanguage?: string): Promise<void>;
    })._processTranslationsAsync(
      { id: 'm1', content: 'Olá, tudo bem?', originalLanguage: 'pt-BR', conversationId: 'c1' },
      'en',
    );

    expect(requests).toHaveLength(1);
    // Would be 'pt-BR' before the fix → translator maps it to 'eng_Latn'.
    expect(requests[0].sourceLanguage).toBe('pt');
    expect(requests[0].targetLanguages).toEqual(['en']);
  });

  it('normalises a region-tagged originalLanguage on the retranslation request (de-DE → de)', async () => {
    const prisma = {
      message: {
        findFirst: jest.fn(async () => ({
          id: 'm2',
          content: 'Hallo, wie geht es dir?',
          originalLanguage: 'de-DE',
          conversationId: 'c2',
        })),
        findUnique: jest.fn(async () => ({ translations: {} })),
        update: jest.fn(async () => ({})),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await svc.retranslateMessageAsync('m2', {
      conversationId: 'c2',
      content: 'Hallo, wie geht es dir?',
      originalLanguage: 'de-DE',
      targetLanguage: 'fr',
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].sourceLanguage).toBe('de');
    expect(requests[0].targetLanguages).toEqual(['fr']);
  });

  it('normalises the source language of a direct REST translation request (pt-BR → pt)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService({} as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await svc.translateTextDirectly('Olá, tudo bem?', 'pt-BR', 'en', 'basic');

    expect(requests).toHaveLength(1);
    expect(requests[0].sourceLanguage).toBe('pt');
  });

  it('region-strips a NON-CATALOG source language via the dedup SSOT (fil-PH → fil)', async () => {
    // `normalizeLanguageCode('fil-PH')` is undefined (Filipino is not in the NLLB
    // catalog), so the old inline `?? x.toLowerCase()` fallback kept 'fil-ph' — a
    // code the translator maps to 'eng_Latn'. The dedup SSOT strips the region.
    const prisma = {
      message: {
        findUnique: jest.fn(async () => ({ originalLanguage: 'fil-PH', translations: {} })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await (svc as unknown as {
      _processTranslationsAsync(message: unknown, targetLanguage?: string): Promise<void>;
    })._processTranslationsAsync(
      { id: 'm-fil', content: 'Kumusta ka?', originalLanguage: 'fil-PH', conversationId: 'c-fil' },
      'en',
    );

    expect(requests).toHaveLength(1);
    // Would be 'fil-ph' before the fix.
    expect(requests[0].sourceLanguage).toBe('fil');
  });

  it('filters self-translation across a NON-CATALOG region tag (source fil-PH vs target fil)', async () => {
    // Source 'fil-PH' and target 'fil' are the SAME language. The inline fallback
    // left source as 'fil-ph', so 'fil' !== 'fil-ph' escaped the self-translation
    // filter and a wasted NLLB request went out. The dedup SSOT collapses both.
    const prisma = {
      message: {
        findUnique: jest.fn(async () => ({ originalLanguage: 'fil-PH', translations: {} })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await (svc as unknown as {
      _processTranslationsAsync(message: unknown, targetLanguage?: string): Promise<void>;
    })._processTranslationsAsync(
      { id: 'm-fil2', content: 'Kumusta ka?', originalLanguage: 'fil-PH', conversationId: 'c-fil2' },
      'fil',
    );

    // No request: the only target equals the source once both are region-stripped.
    expect(requests).toHaveLength(0);
  });

  it("preserves the 'auto' detection sentinel unchanged", async () => {
    const prisma = {
      message: {
        findUnique: jest.fn(async () => ({ originalLanguage: 'auto', translations: {} })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await (svc as unknown as {
      _processTranslationsAsync(message: unknown, targetLanguage?: string): Promise<void>;
    })._processTranslationsAsync(
      { id: 'm3', content: 'Bonjour', originalLanguage: 'auto', conversationId: 'c3' },
      'en',
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].sourceLanguage).toBe('auto');
  });

  it('leaves an already-canonical source language untouched (fr → fr)', async () => {
    const prisma = {
      message: {
        findUnique: jest.fn(async () => ({ originalLanguage: 'fr', translations: {} })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new MessageTranslationService(prisma as any);
    const { zmq, requests } = makeZmqMock();
    injectZmq(svc, zmq);

    await (svc as unknown as {
      _processTranslationsAsync(message: unknown, targetLanguage?: string): Promise<void>;
    })._processTranslationsAsync(
      { id: 'm4', content: 'Bonjour tout le monde', originalLanguage: 'fr', conversationId: 'c4' },
      'en',
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].sourceLanguage).toBe('fr');
  });
});
