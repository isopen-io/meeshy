/**
 * Régression #5611 — dans son propre fichier plutôt que dans
 * ZmqTranslationClient.test.ts (dette héritée du cliquet de taille,
 * gateway-test-file-size-budget.test.ts, qui interdit tout ajout sans
 * extraction préalable).
 *
 * `sendPing()` partageait la socket PUSH des traductions : un envoi de
 * traduction en vol faisait échouer la sonde sur sa PROPRE concurrence
 * ("Socket is busy writing"), jamais sur l'état réel du translator. Ce
 * témoin prouve que `healthCheck()` reste vert pendant qu'une traduction
 * est en vol — la socket dédiée de ZmqConnectionManager (#5611) empêche la
 * collision de se reproduire.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockPushSocket = {
  connect: jest.fn(),
  send: jest.fn(),
  close: jest.fn()
};

const mockSubSocket = {
  connect: jest.fn(),
  subscribe: jest.fn(),
  receive: jest.fn(),
  close: jest.fn()
};

jest.mock('zeromq', () => ({
  Push: jest.fn().mockImplementation(() => mockPushSocket),
  Subscriber: jest.fn().mockImplementation(() => mockSubSocket),
  Context: jest.fn().mockImplementation(() => ({}))
}));

import { ZmqTranslationClient } from '../../../services/zmq-translation/ZmqTranslationClient';

describe('ZmqTranslationClient — healthCheck() vs. traduction en vol (#5611)', () => {
  let client: ZmqTranslationClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (mockPushSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.send as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.subscribe as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.receive as jest.Mock).mockRejectedValue(new Error('No message'));

    client = new ZmqTranslationClient('0.0.0.0', 5555, 5558);
    await client.initialize();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await client.close();
  });

  it('stays healthy while a translation send is still in flight on the other PUSH socket', async () => {
    // Simule une traduction dont le send() n'a pas encore résolu — le défaut
    // historique (une seule socket PUSH pour tout) faisait échouer toute
    // sonde tirée dans cette fenêtre sur "Socket is busy writing".
    let resolveTranslationSend!: () => void;
    (mockPushSocket.send as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveTranslationSend = resolve; })
    );

    const translationSend = client.sendTranslationRequest({
      messageId: 'msg-1',
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['fr'],
      conversationId: 'conv-1'
    });

    const isHealthy = await client.healthCheck();
    expect(isHealthy).toBe(true);

    resolveTranslationSend();
    await translationSend;
  });
});
