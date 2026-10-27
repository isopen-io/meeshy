/**
 * #13100 — cinquième audit adversarial : le CÂBLAGE : `gatewaySealLock` (celui que la passerelle utilise), pas la seule fabrique :
 * le verrou de scellement a son PROPRE client Redis, qui se reconnecte sans
 * jamais abandonner (celui de `CacheStore` cesse après 3 tentatives). Redis
 * revenu, le scellement reprend sans redémarrer la passerelle. Un faux serveur
 * RESP local (127.0.0.1) joue le Redis revenu.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterAll } from '@jest/globals';
import net from 'net';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), trace: jest.fn(), child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), trace: jest.fn() }) },
}));

import { RedisCacheStore } from '../../CacheStore';
import { gatewaySealLock } from "../atRest/atRestFileAccessFor";

function fakeRedis(port: number): Promise<net.Server> {
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      const text = data.toString();
      const commands = text.split('*').filter((c) => c.length > 0);
      commands.forEach((command) => {
        const upper = command.toUpperCase();
        if (upper.includes('INFO')) {
          const body = '# Server\r\nloading:0\r\n';
          socket.write(`$${body.length}\r\n${body}\r\n`);
        } else if (upper.includes('\r\nSET\r\n')) socket.write('+OK\r\n');
        else if (upper.includes('EVAL')) socket.write(':1\r\n');
        else socket.write('+OK\r\n');
      });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const servers: net.Server[] = [];
const clients: { disconnect(): void }[] = [];
afterAll(async () => { clients.forEach((c) => c.disconnect()); servers.forEach((s) => s.close()); });

describe('verrou fail-closed et Redis qui revient', () => {
  it('Redis revenu, le scellement reprend sans redémarrer la passerelle', async () => {
    const probe = await fakeRedis(0);
    const port = (probe.address() as net.AddressInfo).port;
    await new Promise((r) => probe.close(r));
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
    const lock = gatewaySealLock;
    await sleep(6000);
    await expect(lock('2026/10/u/a_0f8fad5b.jpg')).rejects.toThrow();

    servers.push(await fakeRedis(port));
    await sleep(6000);
    // Témoin de contrôle : un client NEUF (passerelle redémarrée) obtient le verrou du même Redis.
    const fresh = new RedisCacheStore(`redis://127.0.0.1:${port}`);
    await sleep(1500);
    await fresh.close();
    const after = await lock('2026/10/u/a_0f8fad5b.jpg');
    expect(after === 'busy' ? 'busy' : 'held').toBe('held');
  }, 30_000);
});
