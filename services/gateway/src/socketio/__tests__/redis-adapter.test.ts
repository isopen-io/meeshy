/**
 * attachSocketIORedisAdapter — wiring tests (#3723)
 *
 * Mocks ioredis and @socket.io/redis-adapter so the WIRING (which Redis
 * clients get built, whether io.adapter() is called, cleanup) is exercised
 * without a real Redis server. The actual cross-instance broadcast behavior
 * is proven separately by a real Redis integration test
 * (src/__tests__/integration/redis-adapter-cross-instance.integration.test.ts) —
 * this suite cannot prove that two instances actually fan out events to each
 * other, only that the adapter is correctly attached/detached.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const mockPubClient = {
  on: jest.fn<any>().mockReturnThis(),
  off: jest.fn<any>().mockReturnThis(),
  disconnect: jest.fn<any>(),
  duplicate: jest.fn<any>(),
};
const mockSubClient = {
  on: jest.fn<any>().mockReturnThis(),
  off: jest.fn<any>().mockReturnThis(),
  disconnect: jest.fn<any>(),
};
mockPubClient.duplicate.mockReturnValue(mockSubClient);

const RedisCtor = jest.fn<any>().mockImplementation(() => mockPubClient);
jest.mock('ioredis', () => RedisCtor);

const mockAdapterInstance = { __brand: 'redis-adapter' };
const createAdapterMock = jest.fn<any>().mockReturnValue(mockAdapterInstance);
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: createAdapterMock }));

import { attachSocketIORedisAdapter } from '../redis-adapter';

function fakeIO() {
  return { adapter: jest.fn() };
}

describe('attachSocketIORedisAdapter', () => {
  const originalEnv = process.env.REDIS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPubClient.duplicate.mockReturnValue(mockSubClient);
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalEnv;
  });

  it('stays on the in-memory adapter when no Redis URL is configured (single-instance behavior unchanged)', () => {
    const io = fakeIO();

    const handle = attachSocketIORedisAdapter(io as any);

    expect(handle).toBeNull();
    expect(io.adapter).not.toHaveBeenCalled();
    expect(RedisCtor).not.toHaveBeenCalled();
  });

  it('attaches the Redis adapter built from a pub/sub pair when a URL is passed explicitly', () => {
    const io = fakeIO();

    const handle = attachSocketIORedisAdapter(io as any, 'redis://explicit:6379');

    expect(RedisCtor).toHaveBeenCalledWith('redis://explicit:6379', expect.any(Object));
    expect(mockPubClient.duplicate).toHaveBeenCalledTimes(1);
    expect(createAdapterMock).toHaveBeenCalledWith(mockPubClient, mockSubClient);
    expect(io.adapter).toHaveBeenCalledWith(mockAdapterInstance);
    expect(handle).not.toBeNull();
  });

  it('falls back to process.env.REDIS_URL when no URL argument is given', () => {
    process.env.REDIS_URL = 'redis://from-env:6379';
    const io = fakeIO();

    attachSocketIORedisAdapter(io as any);

    expect(RedisCtor).toHaveBeenCalledWith('redis://from-env:6379', expect.any(Object));
    expect(io.adapter).toHaveBeenCalledWith(mockAdapterInstance);
  });

  it('disconnects both pub and sub clients on close()', async () => {
    const io = fakeIO();
    const handle = attachSocketIORedisAdapter(io as any, 'redis://explicit:6379');

    await handle!.close();

    expect(mockPubClient.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSubClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports isConnected() only once BOTH clients have fired their ready event', () => {
    const io = fakeIO();
    const handle = attachSocketIORedisAdapter(io as any, 'redis://explicit:6379');

    expect(handle!.isConnected()).toBe(false);

    const pubReadyCallback = mockPubClient.on.mock.calls.find(([event]) => event === 'ready')?.[1] as (() => void) | undefined;
    const subReadyCallback = mockSubClient.on.mock.calls.find(([event]) => event === 'ready')?.[1] as (() => void) | undefined;
    expect(pubReadyCallback).toBeDefined();
    expect(subReadyCallback).toBeDefined();

    pubReadyCallback!();
    expect(handle!.isConnected()).toBe(false);

    subReadyCallback!();
    expect(handle!.isConnected()).toBe(true);
  });
});
