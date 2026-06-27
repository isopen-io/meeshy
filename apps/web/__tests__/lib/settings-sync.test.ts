/**
 * Tests for lib/settings-sync.ts
 */

const mockPostMessage = jest.fn();
const mockClose = jest.fn();
let storedOnMessage: ((event: MessageEvent) => void) | null = null;

const MockBroadcastChannel = jest.fn().mockImplementation(() => ({
  postMessage: mockPostMessage,
  close: mockClose,
  set onmessage(handler: (event: MessageEvent) => void) {
    storedOnMessage = handler;
  },
}));

Object.defineProperty(global, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
  configurable: true,
});

import {
  initSettingsSync,
  broadcastPreferenceUpdate,
  broadcastUserUpdate,
  destroySettingsSync,
} from '@/lib/settings-sync';

const makeQueryClient = () => ({
  invalidateQueries: jest.fn(),
});

beforeEach(() => {
  mockPostMessage.mockClear();
  mockClose.mockClear();
  MockBroadcastChannel.mockClear();
  storedOnMessage = null;
  // Always destroy between tests to reset module-level state
  destroySettingsSync();
});

// ─── initSettingsSync ─────────────────────────────────────────────────────────

describe('initSettingsSync', () => {
  it('creates a BroadcastChannel on first call', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    expect(MockBroadcastChannel).toHaveBeenCalledWith('meeshy-settings-sync');
  });

  it('reuses existing channel on subsequent calls', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    initSettingsSync(qc as any);
    expect(MockBroadcastChannel).toHaveBeenCalledTimes(1);
  });
});

// ─── broadcastPreferenceUpdate ────────────────────────────────────────────────

describe('broadcastPreferenceUpdate', () => {
  it('posts preferences-updated message with category', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    broadcastPreferenceUpdate('notification');
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'preferences-updated',
      category: 'notification',
    });
  });
});

// ─── broadcastUserUpdate ──────────────────────────────────────────────────────

describe('broadcastUserUpdate', () => {
  it('posts user-updated message', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    broadcastUserUpdate();
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'user-updated' });
  });
});

// ─── destroySettingsSync ──────────────────────────────────────────────────────

describe('destroySettingsSync', () => {
  it('closes the channel', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    destroySettingsSync();
    expect(mockClose).toHaveBeenCalled();
  });

  it('creates a new channel after destroy + reinit', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    destroySettingsSync();
    MockBroadcastChannel.mockClear();
    initSettingsSync(qc as any);
    expect(MockBroadcastChannel).toHaveBeenCalledTimes(1);
  });
});

// ─── incoming sync messages ───────────────────────────────────────────────────

describe('incoming sync messages', () => {
  it('invalidates preference query on preferences-updated message', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    storedOnMessage?.({ data: { type: 'preferences-updated', category: 'audio' } } as any);
    expect(qc.invalidateQueries).toHaveBeenCalled();
    const [arg] = qc.invalidateQueries.mock.calls[0];
    expect(arg.queryKey).toContain('audio');
  });

  it('invalidates user query on user-updated message', () => {
    const qc = makeQueryClient();
    initSettingsSync(qc as any);
    storedOnMessage?.({ data: { type: 'user-updated' } } as any);
    expect(qc.invalidateQueries).toHaveBeenCalled();
    const [arg] = qc.invalidateQueries.mock.calls[0];
    expect(arg.queryKey).toContain('current');
  });

  it('does nothing when no queryClient is set', () => {
    destroySettingsSync();
    expect(() =>
      storedOnMessage?.({ data: { type: 'user-updated' } } as any)
    ).not.toThrow();
  });
});
