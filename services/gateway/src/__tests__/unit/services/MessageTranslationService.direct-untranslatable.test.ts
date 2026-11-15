/**
 * `translateTextDirectly` (chemin REST de `POST /translate-blocking`) vers une
 * langue sans code NLLB-200 (`byv`… #3659) servait `"[BYV] <texte>"` avec
 * `modelType: 'fallback'` : un texte FABRIQUÉ, présenté comme une traduction
 * Medumba (règle 1 du Prisme : sans traduction, l'ORIGINAL). Et le refus
 * terminal du translator (`translationUnsupported`) n'était pas écouté : la
 * requête attendait ses dix secondes.
 *
 * Désormais : l'original, dans sa langue source, `modelType: 'none'` — la
 * forme du « rien à traduire » que la route sert déjà pour `source = cible`.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

class FakeZmqClient extends EventEmitter {
  sendTranslationRequest = jest.fn<(request: unknown) => Promise<string>>(async () => 'task-direct');
  healthCheck = jest.fn(async () => true);
  close = jest.fn(async () => undefined);
}
const zmq = new FakeZmqClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn(async () => zmq) },
}));

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import { UntranslatableRequestError } from '../../../services/zmq-translation/ZmqRequestSender';

async function service() {
  const instance = new MessageTranslationService({} as unknown as PrismaClient);
  await instance.initialize();
  return instance;
}

const withinOneSecond = <T>(pending: Promise<T>): Promise<T> =>
  Promise.race([
    pending,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('still waiting after 1s')), 1_000)),
  ]);

describe('translateTextDirectly vers une langue que NLLB-200 ne sert pas', () => {
  it("sert l'original dans sa langue, jamais un texte fabriqué « [BYV] … »", async () => {
    zmq.sendTranslationRequest.mockRejectedValueOnce(new UntranslatableRequestError('fr', ['byv']));
    const translator = await service();

    const result = await translator.translateTextDirectly('Bonjour à tous', 'fr', 'byv');

    expect(result.translatedText).toBe('Bonjour à tous');
    expect(result.sourceLanguage).toBe('fr');
    expect(result.targetLanguage).toBe('fr');
    expect(result.modelType).toBe('none');
  });

  it('se solde dès le refus terminal du translator, sans attendre dix secondes', async () => {
    zmq.sendTranslationRequest.mockResolvedValueOnce('task-unsupported');
    const translator = await service();

    const pending = translator.translateTextDirectly('Bonjour à tous', 'fr', 'byv');
    await new Promise((resolve) => setImmediate(resolve));
    zmq.emit('translationUnsupported', {
      type: 'translation_error', taskId: 'task-unsupported', messageId: 'm', error: 'x',
      conversationId: 'rest-request', errorCode: 'UNSUPPORTED_LANGUAGE', targetLanguage: 'byv',
    });

    const result = await withinOneSecond(pending);
    expect(result.translatedText).toBe('Bonjour à tous');
    expect(result.modelType).toBe('none');
    expect(zmq.listenerCount('translationUnsupported')).toBe(0);
  });

  it("ignore le refus d'une AUTRE tâche", async () => {
    jest.useFakeTimers();
    try {
      zmq.sendTranslationRequest.mockResolvedValueOnce('task-mine');
      const translator = await service();

      const pending = translator.translateTextDirectly('Bonjour', 'fr', 'en');
      await jest.advanceTimersByTimeAsync(0);
      zmq.emit('translationUnsupported', { taskId: 'task-other', targetLanguage: 'byv' });
      zmq.emit('translationCompleted', {
        taskId: 'task-mine',
        result: { messageId: 'm', translatedText: 'Hello', sourceLanguage: 'fr', targetLanguage: 'en',
          confidenceScore: 0.9, processingTime: 1, modelType: 'basic' },
      });

      await expect(pending).resolves.toMatchObject({ translatedText: 'Hello', modelType: 'basic' });
    } finally {
      jest.useRealTimers();
    }
  });
});
