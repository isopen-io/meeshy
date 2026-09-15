/**
 * Redis adapter — real cross-instance broadcast (#3723)
 *
 * Proves the actual mechanism the issue asks for: two INDEPENDENT Socket.IO
 * server instances (two HTTP servers, two `io` objects, no shared in-process
 * state) both attached to the SAME Redis via `attachSocketIORedisAdapter`.
 * A client connected to instance A joins a room; instance B broadcasts to
 * that room; the client — which never talked to B — receives the event.
 * That is exactly what lets several gateway processes behind a load balancer
 * (e.g. Traefik) share Socket.IO broadcasts instead of only reaching sockets
 * on the same process.
 *
 * Requires a real, reachable Redis (REDIS_URL, default redis://127.0.0.1:6379).
 * Like the DB-backed suites in this directory, this is NOT part of the
 * default `test`/`test:coverage` gate (see jest.config.json
 * testPathIgnorePatterns) — CI has no Redis service. Run manually:
 *   REDIS_URL=redis://127.0.0.1:6379 npx jest --config=jest.config.temp.json \
 *     --testPathPatterns='redis-adapter-cross-instance'
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Server as HTTPServer, createServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { attachSocketIORedisAdapter, type SocketIORedisAdapterHandle } from '../../socketio/redis-adapter';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Instance = {
  httpServer: HTTPServer;
  io: SocketIOServer;
  port: number;
  adapterHandle: SocketIORedisAdapterHandle;
};

async function startInstance(): Promise<Instance> {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, { path: '/socket.io/' });
  const adapterHandle = attachSocketIORedisAdapter(io, REDIS_URL);
  if (!adapterHandle) {
    throw new Error('attachSocketIORedisAdapter returned null — REDIS_URL was not honored');
  }

  const port: number = await new Promise((resolve) => {
    httpServer.listen(0, () => resolve((httpServer.address() as AddressInfo).port));
  });

  return { httpServer, io, port, adapterHandle };
}

async function stopInstance(instance: Instance): Promise<void> {
  // `io.close()` FIRST: it disconnects every socket, and the adapter reacts
  // to each disconnect by writing room-membership cleanup to Redis. Closing
  // the Redis clients before that cleanup runs turns it into a rejected
  // command against a dead connection (uncaught — the adapter doesn't await
  // it). Redis goes down only once Socket.IO has nothing left to clean up.
  await new Promise<void>((resolve) => instance.httpServer.close(() => resolve()));
  instance.io.close();
  await instance.adapterHandle.close();
}

describe('Socket.IO Redis adapter — cross-instance broadcast (real Redis)', () => {
  let instanceA: Instance;
  let instanceB: Instance;

  beforeAll(async () => {
    [instanceA, instanceB] = await Promise.all([startInstance(), startInstance()]);

    const deadline = Date.now() + 5000;
    while (!instanceA.adapterHandle.isConnected() || !instanceB.adapterHandle.isConnected()) {
      if (Date.now() > deadline) {
        throw new Error(`Redis adapter clients never became ready — is Redis reachable at ${REDIS_URL}?`);
      }
      await sleep(50);
    }
  }, 15000);

  afterAll(async () => {
    await Promise.all([stopInstance(instanceA), stopInstance(instanceB)]);
  });

  it('delivers an event emitted on instance B to a client connected only to instance A, via the shared room', async () => {
    const room = `cross-instance-room-${Date.now()}`;

    instanceA.io.on('connection', (socket) => {
      socket.join(room);
    });

    const client: ClientSocket = ioClient(`http://localhost:${instanceA.port}`, {
      path: '/socket.io/',
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });

    // Give the adapter a beat to propagate the room membership through Redis
    // before B tries to reach it.
    await sleep(200);

    const received = new Promise<unknown>((resolve) => {
      client.on('cross-instance-event', resolve);
    });

    // Instance B has NEVER seen this socket — it only knows the room exists
    // because Redis told it so.
    instanceB.io.to(room).emit('cross-instance-event', { from: 'instance-B' });

    const payload = await received;
    expect(payload).toEqual({ from: 'instance-B' });

    client.disconnect();
  }, 10000);

  it('does NOT deliver the event when the two instances have no shared adapter (control — proves the test above is not vacuous)', async () => {
    // Two bare Socket.IO servers, deliberately WITHOUT attachSocketIORedisAdapter —
    // each keeps its own default in-memory adapter, exactly like the gateway
    // does today without REDIS_URL.
    const bareA = createServer();
    const ioBareA = new SocketIOServer(bareA, { path: '/socket.io/' });
    const bareB = createServer();
    const ioBareB = new SocketIOServer(bareB, { path: '/socket.io/' });

    const [portA] = await Promise.all([
      new Promise<number>((resolve) => bareA.listen(0, () => resolve((bareA.address() as AddressInfo).port))),
      new Promise<number>((resolve) => bareB.listen(0, () => resolve((bareB.address() as AddressInfo).port))),
    ]);

    const room = `no-adapter-control-room-${Date.now()}`;
    ioBareA.on('connection', (socket) => socket.join(room));

    const client: ClientSocket = ioClient(`http://localhost:${portA}`, {
      path: '/socket.io/',
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });
    await sleep(200);

    let received: unknown = 'not-received';
    client.on('cross-instance-event', (payload) => {
      received = payload;
    });

    ioBareB.to(room).emit('cross-instance-event', { from: 'instance-B' });
    await sleep(500);

    expect(received).toBe('not-received');

    client.disconnect();
    ioBareA.close();
    ioBareB.close();
    await Promise.all([
      new Promise<void>((resolve) => bareA.close(() => resolve())),
      new Promise<void>((resolve) => bareB.close(() => resolve())),
    ]);
  }, 10000);
});
