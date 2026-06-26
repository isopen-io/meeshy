/**
 * Unit tests for ZMQSingleton
 *
 * Covers:
 *  - getInstance() first call — creates and initializes
 *  - getInstance() second call — returns cached instance
 *  - getInstance() concurrent calls — waits on initializationPromise
 *  - initializeInstance() error — resets instance and rethrows
 *  - close() with instance — closes and nullifies
 *  - close() with no instance — no-op
 *  - close() when instance.close() throws — still nullifies
 *  - getInstanceSync() — null before init, instance after
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

// Mock ZmqTranslationClient so no real ZMQ sockets are opened
const mockInitialize = jest.fn<any>().mockResolvedValue(undefined);
const mockClose = jest.fn<any>().mockResolvedValue(undefined);

class MockZmqTranslationClient {
  initialize = mockInitialize;
  close = mockClose;
}

jest.mock('../../../services/zmq-translation', () => ({
  ZmqTranslationClient: MockZmqTranslationClient,
}));

import { ZMQSingleton } from '../../../services/ZmqSingleton';

// Reset singleton static state between tests
function resetSingleton() {
  (ZMQSingleton as any).instance = null;
  (ZMQSingleton as any).isInitializing = false;
  (ZMQSingleton as any).initializationPromise = null;
}

describe('ZMQSingleton', () => {
  beforeEach(() => {
    resetSingleton();
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetSingleton();
  });

  // ── getInstance — first call ──────────────────────────────────────────────

  it('creates and returns an instance on first call', async () => {
    const instance = await ZMQSingleton.getInstance();
    expect(instance).toBeInstanceOf(MockZmqTranslationClient);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  // ── getInstance — second call ─────────────────────────────────────────────

  it('returns the same instance on repeated calls (no re-init)', async () => {
    const first = await ZMQSingleton.getInstance();
    const second = await ZMQSingleton.getInstance();
    expect(first).toBe(second);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  // ── getInstance — concurrent calls ────────────────────────────────────────

  it('waits on an in-flight initialization and returns the same instance', async () => {
    // Start two concurrent calls — the second one hits the isInitializing path
    const p1 = ZMQSingleton.getInstance();
    const p2 = ZMQSingleton.getInstance();

    const [i1, i2] = await Promise.all([p1, p2]);
    expect(i1).toBe(i2);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  // ── initializeInstance — error path ───────────────────────────────────────

  it('propagates initialization error and leaves instance null', async () => {
    mockInitialize.mockRejectedValueOnce(new Error('ZMQ connect failed') as never);

    await expect(ZMQSingleton.getInstance()).rejects.toThrow('ZMQ connect failed');
    expect(ZMQSingleton.getInstanceSync()).toBeNull();
  });

  // ── getInstanceSync ───────────────────────────────────────────────────────

  it('getInstanceSync returns null before initialization', () => {
    expect(ZMQSingleton.getInstanceSync()).toBeNull();
  });

  it('getInstanceSync returns the instance after initialization', async () => {
    await ZMQSingleton.getInstance();
    expect(ZMQSingleton.getInstanceSync()).toBeInstanceOf(MockZmqTranslationClient);
  });

  // ── close ─────────────────────────────────────────────────────────────────

  it('close calls instance.close and sets instance to null', async () => {
    await ZMQSingleton.getInstance();
    await ZMQSingleton.close();

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(ZMQSingleton.getInstanceSync()).toBeNull();
  });

  it('close is a no-op when no instance exists', async () => {
    await ZMQSingleton.close();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('close nullifies instance even when close() throws', async () => {
    mockClose.mockRejectedValueOnce(new Error('socket error') as never);
    await ZMQSingleton.getInstance();

    await ZMQSingleton.close(); // Should not throw
    expect(ZMQSingleton.getInstanceSync()).toBeNull();
  });
});
