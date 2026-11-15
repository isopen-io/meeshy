/**
 * L'arrêt de la passerelle ne lève plus de rejet non géré ioredis (#11468, D4).
 *
 * Staging 2026-10-21, 18:25:04 : cinq « UNHANDLED REJECTION — Connection is
 * closed. » à l'arrêt. `io.close()` déconnecte les sockets, leurs départs
 * diffusent la présence (`_broadcastUserStatus`), et l'adaptateur Redis publie
 * sur une connexion que la fermeture vient de couper. `@socket.io/redis-adapter`
 * appelle `publish` / `punsubscribe` sans jamais attendre ni attraper leur
 * promesse : le rejet n'a aucun écouteur.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const closed = () => Promise.reject(new Error('Connection is closed.'));

function fakeClient() {
  return {
    on: jest.fn<any>().mockReturnThis(),
    off: jest.fn<any>().mockReturnThis(),
    disconnect: jest.fn<any>(),
    publish: jest.fn<any>(closed),
    psubscribe: jest.fn<any>(closed),
    subscribe: jest.fn<any>(closed),
    punsubscribe: jest.fn<any>(closed),
    unsubscribe: jest.fn<any>(closed),
    duplicate: jest.fn<any>(),
  };
}

const pub = fakeClient();
const sub = fakeClient();
pub.duplicate.mockReturnValue(sub);
jest.mock('ioredis', () => jest.fn<any>().mockImplementation(() => pub));

const adapterClients: { pub?: ReturnType<typeof fakeClient>; sub?: ReturnType<typeof fakeClient> } = {};
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn((p: ReturnType<typeof fakeClient>, s: ReturnType<typeof fakeClient>) => {
    adapterClients.pub = p;
    adapterClients.sub = s;
    return {};
  }),
}));

import { attachSocketIORedisAdapter } from '../redis-adapter';

async function unhandledDuring(body: () => void): Promise<unknown[]> {
  const captured: unknown[] = [];
  const onUnhandled = (reason: unknown) => { captured.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    body();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return captured;
}

describe('attachSocketIORedisAdapter — arrêt de la passerelle (#11468 D4)', () => {
  it('une diffusion publiée sur une connexion fermée ne laisse aucun rejet non géré', async () => {
    const handle = attachSocketIORedisAdapter({ adapter: jest.fn() } as never, 'redis://shutdown:6379');
    await handle!.close();

    const unhandled = await unhandledDuring(() => {
      void adapterClients.pub!.publish('socket.io#/#', 'payload');
      void adapterClients.sub!.punsubscribe('socket.io#/#*');
      void adapterClients.sub!.unsubscribe('socket.io-request#/#');
    });

    expect(unhandled).toEqual([]);
  });

  it('l’adaptateur reçoit toujours le rejet quand il attend la commande', async () => {
    attachSocketIORedisAdapter({ adapter: jest.fn() } as never, 'redis://shutdown:6379');

    await expect(adapterClients.pub!.publish('socket.io#/#', 'payload')).rejects.toThrow('Connection is closed.');
  });
});
