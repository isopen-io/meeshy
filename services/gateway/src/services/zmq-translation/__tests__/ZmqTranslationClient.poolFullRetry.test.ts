/**
 * « translation pool full » est un REFUS TRANSITOIRE, pas un échec.
 *
 * Le translator le dit quand son pool de workers est saturé
 * (`zmq_pool/connection_manager.py` → `zmq_translation_handler.py`) : la même
 * requête, renvoyée quelques secondes plus tard, passe.
 *
 * Le client le reconnaissait pourtant par son nom — assez pour tenir un
 * compteur `pool_full_rejections` — puis effaçait le budget de retry ET annulait
 * le deadman, soldant la requête comme un échec définitif. Le message n'était
 * jamais traduit, et personne ne le réessayait : ce lecteur restait sur
 * l'original, définitivement. Même dommage que le cas jumeau déjà corrigé dans
 * `ZmqTranslationClient.multiLanguageSettle.test.ts`.
 *
 * La machine de renvoi EXISTE (`_registerRequestTimeout`) — elle ne servait
 * qu'au translator SILENCIEUX. Un refus « pool full » laisse donc la requête en
 * cours : le deadman la renvoie, avec son `taskId` et ses seules langues
 * manquantes, dans la limite de `ZMQ_MAX_RETRIES`. Aucune file nouvelle, rien de
 * retenu de plus que ce que le deadman retenait déjà.
 *
 * Les refus qui ne sont PAS « pool full », et ceux qui arrivent pour un taskId
 * qui n'est plus en cours, gardent exactement le comportement d'avant.
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

const MSG_ID = 'msg-pool-1';
const POOL_FULL = 'translation pool full';

type SentMessage = Record<string, any>;

/** Le client, câblé sur un transport qui enregistre au lieu d'envoyer. */
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

const pendingCount = (client: ZmqTranslationClient): number =>
  (client as any).requestSender.getPendingRequestsCount();

const sendTwoLanguages = async (client: ZmqTranslationClient) =>
  client.sendTranslationRequest({
    messageId: MSG_ID,
    text: 'le texte',
    sourceLanguage: 'fr',
    targetLanguages: ['en', 'es'],
    conversationId: 'conv-1',
    modelType: 'basic',
  } as any);

const rejection = (taskId: string, error: string) => ({
  taskId,
  messageId: MSG_ID,
  conversationId: 'conv-1',
  error,
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Un refus « pool full » ne solde pas la requête', () => {
  it('la laisse en cours au lieu de la solder', async () => {
    const { client } = buildClient();
    const taskId = await sendTwoLanguages(client);

    handlerOf(client).emit('translationError', rejection(taskId, POOL_FULL));

    expect(pendingCount(client)).toBe(1);
  });

  it("n'annonce pas l'échec au moment du refus — le renvoi n'a pas encore eu lieu", async () => {
    const { client } = buildClient();
    const failures: any[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await sendTwoLanguages(client);
    handlerOf(client).emit('translationError', rejection(taskId, POOL_FULL));

    expect(failures).toHaveLength(0);
  });

  it('renvoie la requête, avec son taskId et ses langues encore manquantes', async () => {
    const { client, sent } = buildClient();
    const taskId = await sendTwoLanguages(client);
    const envoisAvant = sent.length;

    handlerOf(client).emit('translationError', rejection(taskId, POOL_FULL));
    await jest.advanceTimersByTimeAsync(60_000);

    expect(sent.length).toBeGreaterThan(envoisAvant);
    const renvoi = sent[sent.length - 1];
    expect(renvoi.taskId).toBe(taskId);
    expect([...renvoi.targetLanguages].sort()).toEqual(['en', 'es']);
  });

  it('compte le rejet, comme avant', async () => {
    const { client } = buildClient();
    const taskId = await sendTwoLanguages(client);

    handlerOf(client).emit('translationError', rejection(taskId, POOL_FULL));

    expect(client.getStats().pool_full_rejections).toBe(1);
  });

  it("finit par annoncer l'échec, une seule fois, quand le pool reste saturé", async () => {
    const { client } = buildClient();
    const failures: any[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await sendTwoLanguages(client);
    handlerOf(client).emit('translationError', rejection(taskId, POOL_FULL));

    // Deadman + budget de retry épuisés.
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(failures).toHaveLength(1);
    expect(failures[0].messageId).toBe(MSG_ID);
    expect(pendingCount(client)).toBe(0);
  });
});

describe('Ce qui ne change pas', () => {
  it("solde et annonce immédiatement un refus qui n'est pas « pool full »", async () => {
    const { client } = buildClient();
    const failures: any[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await sendTwoLanguages(client);
    handlerOf(client).emit('translationError', rejection(taskId, 'model unavailable'));

    expect(pendingCount(client)).toBe(0);
    expect(failures).toHaveLength(1);
  });

  it("annonce immédiatement un « pool full » dont le taskId n'est plus en cours", async () => {
    const { client } = buildClient();
    const failures: any[] = [];
    client.on('translationError', (e) => failures.push(e));

    await sendTwoLanguages(client);
    handlerOf(client).emit('translationError', rejection('task-inconnu', POOL_FULL));

    expect(failures).toHaveLength(1);
    expect(failures[0].taskId).toBe('task-inconnu');
  });
});
