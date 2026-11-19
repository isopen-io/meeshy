import { createServer } from 'node:http';

import { describe, expect, test } from 'bun:test';

import { readClientSessionAuth } from '@meeshy/shared/utils/client-session';

import { createSocketIOClient, handshakeAuth } from './socket-io-factory';

describe('la poignée de main déclare le client (#9611)', () => {
  test('`auth.client` porte la déclaration courante, que la passerelle relit sous les mêmes noms', () => {
    const declared = { appVersion: '2.13.0', platform: 'pwa', timezone: 'Europe/Paris', deviceLocale: 'fr-FR' };
    const auth = handshakeAuth({ token: 'jwt', sessionToken: 'st' }, declared);
    expect(auth.token).toBe('jwt');
    expect(auth.sessionToken).toBe('st');
    expect(readClientSessionAuth(auth)).toMatchObject(declared);
  });

  test('une déclaration encore vide n’ajoute pas de clé', () => {
    expect(handshakeAuth({ token: 'jwt', sessionToken: '' }, {})).toEqual({ token: 'jwt', sessionToken: '' });
  });
});

/**
 * `connect()` PENDANT LE BACKOFF TENTE TOUT DE SUITE (#8839) — le vrai
 * `socket.io-client` ignore `connect()` tant qu'il attend sa prochaine
 * tentative (`Socket.connect` : `if (!this.io._reconnecting) this.io.open()`),
 * donc le retour au premier plan ou au réseau attendait jusqu'à 16 s. Le
 * témoin vise un port fermé : chaque tentative échoue aussitôt, et seule la
 * relance MANUELLE peut produire une erreur avant la fin du premier backoff
 * (≥ 800 ms).
 */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('la fabrique socket.io', () => {
  test('connect() pendant l’attente du backoff tente sans attendre', async () => {
    const client = createSocketIOClient({ base: 'http://127.0.0.1:1', auth: { token: 't', sessionToken: '' } });
    const failures: number[] = [];
    client.on('connect_error', () => failures.push(Date.now()));
    try {
      client.connect();
      await wait(150);
      expect(failures).toHaveLength(1);
      client.connect();
      await wait(250);
      expect(failures).toHaveLength(2);
    } finally {
      client.disconnect();
    }
  });
});

/**
 * UNE SOCKET « CONNECTÉE » PEUT ÊTRE MORTE (#19776) — passée du Wi-Fi à la
 * 4G, sa connexion TCP pointe une adresse qui n'existe plus, et
 * `socket.io-client` ne le découvre qu'au battement manqué (~45 s).
 * `recycle()` abandonne le transport et rouvre AUSSITÔT, sans backoff. Le
 * témoin parle le protocole engine.io (long-polling) depuis un serveur Bun :
 * deux poignées de main, la seconde avant la fin du premier backoff (≥ 800 ms).
 */
type FakeSession = { readonly queue: string[]; waiter: ((body: string) => void) | null };

async function fakeEngineServer() {
  const sessions = new Map<string, FakeSession>();
  const counter = { handshakes: 0 };
  const push = (session: FakeSession, packet: string): void => {
    const waiter = session.waiter;
    session.waiter = null;
    if (waiter === null) session.queue.push(packet);
    else waiter(packet);
  };
  const server = createServer((request, response) => {
    const reply = (body: string, status = 200): void => void response.writeHead(status, { 'content-type': 'text/plain' }).end(body);
    const sid = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('sid');
    if (sid === null) {
      counter.handshakes += 1;
      const id = `s${counter.handshakes}`;
      sessions.set(id, { queue: [], waiter: null });
      reply(`0${JSON.stringify({ sid: id, upgrades: [], pingInterval: 25_000, pingTimeout: 20_000, maxPayload: 1_000_000 })}`);
      return;
    }
    const session = sessions.get(sid);
    if (session === undefined) {
      reply('', 400);
      return;
    }
    if (request.method === 'POST') {
      const chunks: string[] = [];
      request.on('data', (chunk: Buffer) => void chunks.push(chunk.toString()));
      request.on('end', () => {
        if (chunks.join('').split('\x1e').some((packet) => packet.startsWith('40'))) push(session, `40{"sid":"n-${sid}"}`);
        reply('ok');
      });
      return;
    }
    if (session.queue.length > 0) {
      reply(session.queue.splice(0).join('\x1e'));
      return;
    }
    session.waiter = reply;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    counter,
    stop: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

describe('recycler une socket connectée (#19776)', () => {
  test('recycle() rouvre une NOUVELLE session tout de suite, sans attendre le backoff', async () => {
    const server = await fakeEngineServer();
    const client = createSocketIOClient({ base: server.base, auth: { token: 't', sessionToken: '' } });
    const connects: number[] = [];
    client.on('connect', () => connects.push(Date.now()));
    try {
      client.connect();
      await wait(300);
      expect(connects).toHaveLength(1);
      expect(client.connected).toBe(true);
      client.recycle?.();
      await wait(400);
      expect(server.counter.handshakes).toBe(2);
      expect(connects).toHaveLength(2);
      expect(client.connected).toBe(true);
    } finally {
      client.disconnect();
      server.stop();
    }
  });

  test('recycle() sur une socket déconnectée tente aussitôt, comme connect()', async () => {
    const client = createSocketIOClient({ base: 'http://127.0.0.1:1', auth: { token: 't', sessionToken: '' } });
    const failures: number[] = [];
    client.on('connect_error', () => failures.push(Date.now()));
    try {
      client.connect();
      await wait(150);
      client.recycle?.();
      await wait(250);
      expect(failures).toHaveLength(2);
    } finally {
      client.disconnect();
    }
  });
});
