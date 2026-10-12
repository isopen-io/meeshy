/**
 * #10288 — le canal ZMQ de l'agent (PULL 5560) n'accepte que la passerelle.
 * Un conteneur voisin qui pousse un événement sans la trame signée par
 * `AGENT_INTERNAL_TOKEN` ne déclenche rien : ni fenêtre mise à jour, ni appel LLM.
 */
const frames: Buffer[][] = [];

jest.mock('zeromq', () => ({
  Pull: jest.fn().mockImplementation(() => ({
    bind: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => (i < frames.length ? { value: frames[i++], done: false } : { value: undefined, done: true }),
      };
    },
  })),
}));

import { signAgentZmqPayload } from '@meeshy/shared/utils/agent-zmq-auth';
import { ZmqAgentListener } from '../../zmq/zmq-listener';

const TOKEN = 'k'.repeat(64);

function event(content = 'bonjour') {
  return JSON.stringify({
    type: 'agent:new-message',
    conversationId: 'conv-1',
    messageId: `m-${content}`,
    senderId: 'u-1',
    content,
    originalLanguage: 'fr',
    mentionedUserIds: [],
    timestamp: Date.now(),
  });
}

async function run(token: string | undefined, batch: Buffer[][]) {
  frames.length = 0;
  frames.push(...batch);
  const listener = new ZmqAgentListener('127.0.0.1', 5560, token);
  const handler = jest.fn().mockResolvedValue(undefined);
  listener.onEvent(handler);
  await listener.initialize();
  // La boucle se reconnecte après 5 s quand l'itérateur se termine : on l'arrête dès qu'il est vidé.
  const loop = listener.startListening();
  await new Promise((r) => setImmediate(r));
  await listener.close();
  await loop;
  return handler;
}

describe('ZmqAgentListener — authentification du canal (#10288)', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('borne la taille des messages acceptés (1 Mo)', async () => {
    const zmq = jest.requireMock('zeromq') as { Pull: jest.Mock };
    await run(TOKEN, []);
    expect(zmq.Pull).toHaveBeenLastCalledWith({ maxMessageSize: 1_048_576 });
  });

  it('rejette un message ZMQ non authentifié (une seule trame, ancien format ou intrus)', async () => {
    const handler = await run(TOKEN, [[Buffer.from(event())]]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejette un message signé par un autre secret', async () => {
    const payload = event();
    const handler = await run(TOKEN, [[Buffer.from(payload), Buffer.from(signAgentZmqPayload(payload, 'z'.repeat(64)))]]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepte le message de la passerelle, signé par le secret partagé', async () => {
    const payload = event();
    const handler = await run(TOKEN, [[Buffer.from(payload), Buffer.from(signAgentZmqPayload(payload, TOKEN))]]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ type: 'agent:new-message', conversationId: 'conv-1' });
  });

  it('ne traite qu’une fois un message rejoué à l’identique', async () => {
    const payload = event();
    const signed = [Buffer.from(payload), Buffer.from(signAgentZmqPayload(payload, TOKEN))];
    const handler = await run(TOKEN, [signed, signed, signed]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ferme le canal quand l’agent n’a pas de secret : même un message signé est rejeté', async () => {
    const payload = event();
    const handler = await run(undefined, [[Buffer.from(payload), Buffer.from(signAgentZmqPayload(payload, TOKEN))]]);
    expect(handler).not.toHaveBeenCalled();
  });
});
