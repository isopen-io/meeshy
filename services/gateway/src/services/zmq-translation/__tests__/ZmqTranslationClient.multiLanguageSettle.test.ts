/**
 * Une requête de traduction porte N langues, et le translator les rend UNE PAR
 * UNE : `translationCompleted` arrive autant de fois qu'il y a de langues.
 *
 * Le client désarmait pourtant la requête entière — `removePendingRequest` —
 * dès le PREMIER résultat. Les langues 2..N perdaient alors d'un coup leur
 * deadman, leur retry et leur `translationError` : si le translator mourait
 * après avoir rendu l'anglais, l'espagnol et l'italien ne revenaient jamais,
 * personne ne l'apprenait, et rien ne les retentait. Ces lecteurs restaient sur
 * l'original définitivement.
 *
 * Une requête ne se solde donc que quand sa DERNIÈRE langue est rendue — et le
 * retry ne redemande que ce qui manque encore, jamais ce qui est déjà arrivé
 * (re-pousser une langue rendue duplique le travail du worker pool ML).
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';

const MSG_ID = 'msg-multi-1';

type SentMessage = Record<string, any>;

/**
 * Le client, câblé sur un transport ZMQ qui enregistre ce qui part au lieu de
 * l'envoyer. Le socket n'est jamais ouvert.
 */
function buildClient() {
  const sent: SentMessage[] = [];
  const client = new ZmqTranslationClient();

  (client as any).connectionManager = {
    send: jest.fn(async (message: SentMessage) => {
      sent.push(message);
    }),
  };
  (client as any).requestSender.connectionManager = (client as any).connectionManager;

  return { client, sent };
}

const handlerOf = (client: ZmqTranslationClient): EventEmitter =>
  (client as unknown as { messageHandler: EventEmitter }).messageHandler;

const completion = (taskId: string, targetLanguage: string) => ({
  taskId,
  targetLanguage,
  result: { messageId: MSG_ID, targetLanguage, translatedText: `texte (${targetLanguage})` },
  metadata: {},
});

const pendingCount = (client: ZmqTranslationClient): number =>
  (client as any).requestSender.getPendingRequestsCount();

const sendThreeLanguages = async (client: ZmqTranslationClient) =>
  client.sendTranslationRequest({
    messageId: MSG_ID,
    text: 'le texte',
    sourceLanguage: 'fr',
    targetLanguages: ['en', 'es', 'it'],
    conversationId: 'conv-1',
    modelType: 'basic',
  } as any);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Une requête multi-langues ne se solde pas sur son premier résultat', () => {
  it('reste en cours tant que toutes ses langues ne sont pas rendues', async () => {
    const { client } = buildClient();
    const taskId = await sendThreeLanguages(client);

    handlerOf(client).emit('translationCompleted', completion(taskId, 'en'));

    expect(pendingCount(client)).toBe(1);
  });

  it('se solde quand la DERNIÈRE langue est rendue', async () => {
    const { client } = buildClient();
    const taskId = await sendThreeLanguages(client);

    handlerOf(client).emit('translationCompleted', completion(taskId, 'en'));
    handlerOf(client).emit('translationCompleted', completion(taskId, 'es'));
    handlerOf(client).emit('translationCompleted', completion(taskId, 'it'));

    expect(pendingCount(client)).toBe(0);
  });

  it('ne redemande, au retry, que les langues encore manquantes', async () => {
    const { client, sent } = buildClient();
    const taskId = await sendThreeLanguages(client);

    handlerOf(client).emit('translationCompleted', completion(taskId, 'en'));

    await jest.advanceTimersByTimeAsync(60_000);

    expect(sent.length).toBeGreaterThan(1);
    const retry = sent[sent.length - 1];
    expect(retry.taskId).toBe(taskId);
    expect([...retry.targetLanguages].sort()).toEqual(['es', 'it']);
  });

  it('signale une erreur qui ne nomme que les langues jamais rendues', async () => {
    const { client } = buildClient();
    const failures: any[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await sendThreeLanguages(client);
    handlerOf(client).emit('translationCompleted', completion(taskId, 'en'));

    // Deadman + retries épuisés : le translator ne rendra plus rien.
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(failures.length).toBeGreaterThan(0);
    expect(failures[failures.length - 1].messageId).toBe(MSG_ID);
  });

  it('ne solde rien sur un résultat qui ne correspond à aucune requête en cours', async () => {
    const { client } = buildClient();
    const taskId = await sendThreeLanguages(client);

    handlerOf(client).emit('translationCompleted', completion('task-inconnu', 'en'));

    expect(pendingCount(client)).toBe(1);
    expect(taskId).not.toBe('task-inconnu');
  });

  it('solde une langue rendue deux fois sans solder les autres', async () => {
    const { client } = buildClient();
    const taskId = await sendThreeLanguages(client);

    handlerOf(client).emit('translationCompleted', completion(taskId, 'en'));
    handlerOf(client).emit('translationCompleted', completion(taskId, 'en'));

    expect(pendingCount(client)).toBe(1);
  });

  it('reconnaît la langue rendue sous une forme non canonique', async () => {
    const { client } = buildClient();
    const taskId = await sendThreeLanguages(client);

    handlerOf(client).emit('translationCompleted', completion(taskId, 'EN'));
    handlerOf(client).emit('translationCompleted', completion(taskId, 'es'));
    handlerOf(client).emit('translationCompleted', completion(taskId, 'it'));

    expect(pendingCount(client)).toBe(0);
  });
});
