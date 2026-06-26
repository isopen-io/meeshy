/**
 * ZMQSingleton — unit tests
 *
 * Covers: first-call initialization, caching (no re-init on repeat calls),
 * concurrent calls (race guard), initialization error handling, close(),
 * and getInstanceSync().
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mockInitialize = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const MockZmqTranslationClient = jest.fn<any>().mockImplementation(() => ({
  initialize: mockInitialize,
  close: mockClose,
}));

jest.mock('../../../services/zmq-translation', () => ({
  ZmqTranslationClient: MockZmqTranslationClient,
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

import { ZMQSingleton } from '../../../services/ZmqSingleton';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetSingleton() {
  (ZMQSingleton as any).instance = null;
  (ZMQSingleton as any).isInitializing = false;
  (ZMQSingleton as any).initializationPromise = null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetSingleton();
  MockZmqTranslationClient.mockImplementation(() => ({ initialize: mockInitialize, close: mockClose }));
  mockInitialize.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
});

describe('ZMQSingleton.getInstance', () => {
  it('creates a new ZmqTranslationClient and calls initialize on first call', async () => {
    await ZMQSingleton.getInstance();

    expect(MockZmqTranslationClient).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('returns the same instance on repeated calls without re-initializing', async () => {
    const first = await ZMQSingleton.getInstance();
    const second = await ZMQSingleton.getInstance();

    expect(first).toBe(second);
    expect(MockZmqTranslationClient).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent calls — only one initialization runs', async () => {
    const [a, b, c] = await Promise.all([
      ZMQSingleton.getInstance(),
      ZMQSingleton.getInstance(),
      ZMQSingleton.getInstance(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(MockZmqTranslationClient).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('cleans up and re-throws when initialization fails', async () => {
    mockInitialize.mockRejectedValueOnce(new Error('port busy'));

    await expect(ZMQSingleton.getInstance()).rejects.toThrow('port busy');
    expect((ZMQSingleton as any).instance).toBeNull();
  });

  it('allows re-initialization after a failed first attempt', async () => {
    mockInitialize.mockRejectedValueOnce(new Error('transient error'));
    await ZMQSingleton.getInstance().catch(() => {});

    mockInitialize.mockResolvedValue(undefined);
    const instance = await ZMQSingleton.getInstance();
    expect(instance).not.toBeNull();
    expect(mockInitialize).toHaveBeenCalledTimes(2);
  });
});

describe('ZMQSingleton.close', () => {
  it('calls close() on the underlying instance', async () => {
    await ZMQSingleton.getInstance();
    await ZMQSingleton.close();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('sets instance to null after closing', async () => {
    await ZMQSingleton.getInstance();
    await ZMQSingleton.close();

    expect((ZMQSingleton as any).instance).toBeNull();
  });

  it('is a no-op when no instance exists', async () => {
    await ZMQSingleton.close();

    expect(mockClose).not.toHaveBeenCalled();
  });

  it('still clears instance when close() throws', async () => {
    await ZMQSingleton.getInstance();
    mockClose.mockRejectedValueOnce(new Error('close failed'));

    await ZMQSingleton.close();

    expect((ZMQSingleton as any).instance).toBeNull();
  });

  it('allows re-initialization after close', async () => {
    await ZMQSingleton.getInstance();
    await ZMQSingleton.close();

    const newInstance = await ZMQSingleton.getInstance();
    expect(newInstance).not.toBeNull();
    expect(MockZmqTranslationClient).toHaveBeenCalledTimes(2);
  });
});

describe('ZMQSingleton.getInstanceSync', () => {
  it('returns null before initialization', () => {
    expect(ZMQSingleton.getInstanceSync()).toBeNull();
  });

  it('returns the instance after initialization', async () => {
    await ZMQSingleton.getInstance();

    expect(ZMQSingleton.getInstanceSync()).not.toBeNull();
  });

  it('returns null after close', async () => {
    await ZMQSingleton.getInstance();
    await ZMQSingleton.close();

    expect(ZMQSingleton.getInstanceSync()).toBeNull();
  });
});
