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
 * on the same process. `redis-adapter.test.ts` next to this file proves the
 * WIRING with a mocked `ioredis`; this file proves the actual pub/sub fan-out
 * works, against a real Redis.
 *
 * This suite spawns its OWN throwaway `redis-server` (a random port, no
 * persistence) rather than depending on a Redis the CI environment may not
 * provide — the repo's `jest-ci-hidden-suites.test.ts` ratchet forbids
 * growing the pile of tests the CI gate never runs, so this can't live under
 * `src/__tests__/integration/`. When `redis-server` isn't on PATH the suite
 * skips itself with a clear reason instead of failing the gate.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import { Server as HTTPServer, createServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import Redis from 'ioredis';
import { attachSocketIORedisAdapter, type SocketIORedisAdapterHandle } from '../redis-adapter';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const redisServerAvailable = spawnSync('redis-server', ['--version']).status === 0;
const describeIfRedis = redisServerAvailable ? describe : describe.skip;

if (!redisServerAvailable) {
  // eslint-disable-next-line no-console
  console.warn('[redis-adapter-cross-instance] "redis-server" not found on PATH — skipping real-Redis cross-instance suite.');
}

type Instance = {
  httpServer: HTTPServer;
  io: SocketIOServer;
  port: number;
  adapterHandle: SocketIORedisAdapterHandle;
};

async function startInstance(redisUrl: string): Promise<Instance> {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, { path: '/socket.io/' });
  const adapterHandle = attachSocketIORedisAdapter(io, redisUrl);
  if (!adapterHandle) {
    throw new Error('attachSocketIORedisAdapter returned null — the URL was not honored');
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

describeIfRedis('Socket.IO Redis adapter — cross-instance broadcast (real Redis)', () => {
  let redisProcess: ChildProcessWithoutNullStreams;
  let redisPort: number;
  let redisUrl: string;
  let instanceA: Instance;
  let instanceB: Instance;

  beforeAll(async () => {
    redisPort = 20000 + Math.floor(Math.random() * 10000);
    redisUrl = `redis://127.0.0.1:${redisPort}`;

    redisProcess = spawn(
      'redis-server',
      ['--port', String(redisPort), '--save', '', '--appendonly', 'no', '--bind', '127.0.0.1'],
      { stdio: 'pipe' }
    );

    await new Promise<void>((resolve, reject) => {
      // Listen for `ready`, not the `.connect()` promise: with a retryStrategy,
      // ioredis keeps reconnecting in the background after the FIRST attempt's
      // promise has already settled (usually rejected, since redis-server has
      // barely started) — awaiting that promise misses every later retry that
      // actually succeeds, and the probe would time out against a Redis that
      // is by then up and accepting connections.
      const probe = new Redis(redisUrl, {
        retryStrategy: (times) => (times > 50 ? null : 100),
        lazyConnect: true,
      });
      const timeout = setTimeout(() => {
        probe.disconnect();
        reject(new Error(`Spawned redis-server on port ${redisPort} never became reachable`));
      }, 8000);
      probe.on('ready', () => {
        clearTimeout(timeout);
        probe.disconnect();
        resolve();
      });
      probe.on('error', () => {
        // Swallowed: retryStrategy keeps ioredis retrying in the background;
        // only the timeout above gives up.
      });
      probe.connect().catch(() => {
        // Swallowed for the same reason — the `ready` listener is the source
        // of truth, not this promise.
      });
    });

    [instanceA, instanceB] = await Promise.all([startInstance(redisUrl), startInstance(redisUrl)]);

    const deadline = Date.now() + 5000;
    while (!instanceA.adapterHandle.isConnected() || !instanceB.adapterHandle.isConnected()) {
      if (Date.now() > deadline) {
        throw new Error('Redis adapter clients never became ready');
      }
      await sleep(50);
    }
  }, 20000);

  afterAll(async () => {
    // beforeAll can throw partway through (e.g. the readiness probe timing
    // out) — tear down only what actually got created, so a setup failure
    // reports as itself instead of masked by a teardown TypeError on `undefined`.
    await Promise.all([instanceA, instanceB].filter(Boolean).map(stopInstance));
    if (redisProcess) {
      redisProcess.kill('SIGKILL');
      await new Promise<void>((resolve) => redisProcess.once('exit', () => resolve()));
    }
  }, 10000);

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
