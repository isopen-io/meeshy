/**
 * ZmqTranslationClient — le canal retour se VIDE, il ne s'échantillonne pas (#16599)
 *
 * Le tick de 100 ms lançait UN `receive()` et attendait le tick suivant pour
 * relancer : la passerelle entière ne lisait qu'environ dix résultats du
 * traducteur par seconde, et le dixième résultat d'une rafale attendait près
 * d'une seconde derrière les neuf autres — sous-titres d'appel compris.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockPushSocket = {
  connect: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
};

const mockSubSocket = {
  connect: jest.fn(),
  subscribe: jest.fn(),
  receive: jest.fn(),
  close: jest.fn(),
};

jest.mock('zeromq', () => ({
  Push: jest.fn().mockImplementation(() => mockPushSocket),
  Subscriber: jest.fn().mockImplementation(() => mockSubSocket),
  Context: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';

const POLL_TICK_MS = 100;

function completedFrame(taskId: string): Buffer[] {
  return [
    Buffer.from(
      JSON.stringify({
        type: 'translation_completed',
        taskId,
        result: {
          messageId: `call-c1-${taskId}`,
          translatedText: `texte ${taskId}`,
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          confidenceScore: 0.9,
          processingTime: 40,
          modelType: 'basic',
        },
        targetLanguage: 'fr',
        timestamp: Date.now(),
      })
    ),
  ];
}

const neverSettles = () => new Promise<Buffer[]>(() => {});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    await Promise.resolve();
  }
}

function queueOnSocket(frames: readonly Buffer[][]): void {
  const receive = mockSubSocket.receive as jest.Mock<() => Promise<Buffer[]>>;
  frames.forEach((frame) => receive.mockResolvedValueOnce(frame));
  receive.mockImplementation(neverSettles);
}

describe('ZmqTranslationClient — lecture du canal retour', () => {
  const clients: ZmqTranslationClient[] = [];

  async function startedClient(): Promise<{ client: ZmqTranslationClient; completed: string[] }> {
    const client = new ZmqTranslationClient();
    clients.push(client);
    const completed: string[] = [];
    client.on('translationCompleted', (event: { taskId: string }) => completed.push(event.taskId));
    await client.initialize();
    return { client, completed };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (mockPushSocket.connect as jest.Mock<() => Promise<void>>).mockResolvedValue(undefined);
    (mockPushSocket.send as jest.Mock<() => Promise<void>>).mockResolvedValue(undefined);
    (mockPushSocket.close as jest.Mock<() => Promise<void>>).mockResolvedValue(undefined);
    (mockSubSocket.connect as jest.Mock<() => Promise<void>>).mockResolvedValue(undefined);
    (mockSubSocket.subscribe as jest.Mock<() => Promise<void>>).mockResolvedValue(undefined);
    (mockSubSocket.close as jest.Mock<() => Promise<void>>).mockResolvedValue(undefined);
    (mockSubSocket.receive as jest.Mock<() => Promise<Buffer[]>>).mockReset();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it('émet en un seul tick tous les résultats déjà prêts sur le socket', async () => {
    queueOnSocket([completedFrame('t1'), completedFrame('t2'), completedFrame('t3')]);
    const { completed } = await startedClient();

    jest.advanceTimersByTime(POLL_TICK_MS);
    await flushMicrotasks();

    expect(completed).toEqual(['t1', 't2', 't3']);
  });

  it('garde un seul receive() en vol pendant la vidange', async () => {
    queueOnSocket([completedFrame('t1'), completedFrame('t2')]);
    await startedClient();

    jest.advanceTimersByTime(POLL_TICK_MS);
    await flushMicrotasks();
    jest.advanceTimersByTime(10 * POLL_TICK_MS);
    await flushMicrotasks();

    expect(mockSubSocket.receive).toHaveBeenCalledTimes(3);
  });

  it("ne relance pas la lecture aussitôt après une erreur : il attend le tick suivant", async () => {
    (mockSubSocket.receive as jest.Mock<() => Promise<Buffer[]>>).mockRejectedValue(new Error('socket en défaut'));
    await startedClient();

    jest.advanceTimersByTime(POLL_TICK_MS);
    await flushMicrotasks();

    expect(mockSubSocket.receive).toHaveBeenCalledTimes(1);
  });

  it("cesse de lire dès que le client est fermé, même au milieu d'une vidange", async () => {
    const receive = mockSubSocket.receive as jest.Mock<() => Promise<Buffer[]>>;
    const { client } = await startedClient();
    receive.mockImplementation(async () => {
      await client.close();
      return completedFrame('pendant-la-fermeture');
    });

    jest.advanceTimersByTime(POLL_TICK_MS);
    await flushMicrotasks();

    expect(receive).toHaveBeenCalledTimes(1);
  });
});
