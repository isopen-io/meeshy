/**
 * À l'arrêt, la passerelle ferme ses sockets (#8297).
 *
 * Recette du 2026-09-27 : sur SIGTERM, `MeeshyServer.stop()` n'appelait jamais
 * `MeeshySocketIOManager.close()`. L'ancien processus servait encore ses
 * sockets ~96 s pendant que la nouvelle instance écoutait déjà : un appel en
 * cours restait accroché à une passerelle mourante. Ce témoin branche un VRAI
 * client Socket.IO sur un VRAI serveur et regarde ce que l'arrêt lui fait :
 * la socket tombe tout de suite, par une coupure de TRANSPORT — la seule
 * raison qui laisse le client se reconnecter seul (une déconnexion « io server
 * disconnect » le laisserait à terre).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { MeeshySocketIOManager } from '../../../socketio/MeeshySocketIOManager';
import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';

type Live = { http: HTTPServer; io: SocketIOServer; client: ClientSocket };

const opened: Live[] = [];

afterEach(() => {
  opened.splice(0).forEach(({ http, io, client }) => {
    client.close();
    void io.close();
    http.close();
  });
});

const liveServerWithClient = async (): Promise<Live> => {
  const http = createServer();
  const io = new SocketIOServer(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  const client = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  const live = { http, io, client };
  opened.push(live);
  return live;
};

const managerOver = (io: SocketIOServer, overrides: Record<string, unknown> = {}): MeeshySocketIOManager =>
  Object.assign(Object.create(MeeshySocketIOManager.prototype) as MeeshySocketIOManager, {
    io,
    translationService: { close: jest.fn(async () => undefined) },
    locationHandler: { dispose: jest.fn() },
    agentAdminRelay: { stop: jest.fn(async () => undefined) },
    redisAdapterHandle: null,
    ...overrides,
  });

const handlerOver = (manager: MeeshySocketIOManager): MeeshySocketIOHandler =>
  Object.assign(new MeeshySocketIOHandler({} as never, {} as never), { socketIOManager: manager });

const disconnectReason = (client: ClientSocket, withinMs: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`socket encore ouverte après ${withinMs} ms`)), withinMs);
    client.on('disconnect', (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });

describe('l’arrêt de la passerelle ferme ses sockets (#8297)', () => {
  it('coupe la socket d’un client tout de suite, par le transport, pour qu’il se reconnecte ailleurs', async () => {
    const { io, client } = await liveServerWithClient();
    const handler = handlerOver(managerOver(io));

    const reason = disconnectReason(client, 1000);
    await handler.close();

    expect(await reason).toBe('transport close');
  });

  it('ferme les sockets même quand une étape voisine de la fermeture échoue', async () => {
    const { io, client } = await liveServerWithClient();
    const handler = handlerOver(
      managerOver(io, { agentAdminRelay: { stop: jest.fn(async () => { throw new Error('relais tombé'); }) } })
    );

    const reason = disconnectReason(client, 1000);
    await expect(handler.close()).resolves.toBeUndefined();

    expect(await reason).toBe('transport close');
  });

  it('met les appels en mode arrêt AVANT de couper les sockets, pour que la rafale de déconnexions ne raccroche personne', async () => {
    const { io } = await liveServerWithClient();
    const order: string[] = [];
    const calls = {
      prepareForShutdown: jest.fn(() => order.push(`appels en arrêt (${io.engine.clientsCount} socket)`)),
      destroy: jest.fn(),
    };
    const handler = handlerOver(
      managerOver(io, {
        getCallEventsHandler: () => calls,
        getCallService: () => ({ destroy: jest.fn() }),
      })
    );

    await handler.close();

    expect(order).toEqual(['appels en arrêt (1 socket)']);
    expect(calls.destroy).toHaveBeenCalled();
  });

  it('un gestionnaire jamais monté se ferme sans rien faire', async () => {
    await expect(new MeeshySocketIOHandler({} as never, {} as never).close()).resolves.toBeUndefined();
  });

  it('MeeshyServer.stop() ferme le temps réel avant le serveur HTTP', () => {
    const source = readFileSync(join(__dirname, '../../../server.ts'), 'utf8');
    const stop = source.slice(source.indexOf('public async stop()'), source.indexOf('// APPLICATION BOOTSTRAP'));
    const realtime = stop.indexOf('this.socketIOHandler.close()');
    expect(realtime).toBeGreaterThan(-1);
    expect(realtime).toBeLessThan(stop.indexOf('this.server.close()'));
  });
});
