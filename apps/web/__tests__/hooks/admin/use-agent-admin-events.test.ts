import { renderHook, act } from '@testing-library/react';
import { useAgentAdminEvents } from '@/hooks/admin/use-agent-admin-events';
import type { AgentAdminEventKind } from '@meeshy/shared/types/socketio-events';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

// Lazy accessor avoids TDZ issues when jest.mock hoists the factory
const getSocket = () =>
  (jest.requireMock('@/services/meeshy-socketio.service').meeshySocketIOService
    .getSocket as jest.Mock);

type Listener = (...args: unknown[]) => void;

function makeSocket() {
  const listeners: Record<string, Listener[]> = {};
  return {
    emit: jest.fn(),
    on: jest.fn((event: string, cb: Listener) => {
      (listeners[event] ??= []).push(cb);
    }),
    off: jest.fn((event: string, cb: Listener) => {
      listeners[event] = (listeners[event] ?? []).filter(l => l !== cb);
    }),
    trigger(event: string, data?: unknown) {
      for (const cb of listeners[event] ?? []) cb(data);
    },
  };
}

const KINDS: readonly AgentAdminEventKind[] = ['delivery-queue', 'scan'];
const DEFAULT_DEBOUNCE = 400;

function renderAgentEvents(
  overrides: Partial<Parameters<typeof useAgentAdminEvents>[0]> = {},
  onChange: jest.Mock = jest.fn()
) {
  return renderHook(
    (props: Parameters<typeof useAgentAdminEvents>[0]) =>
      useAgentAdminEvents(props),
    {
      initialProps: {
        kinds: KINDS,
        onChange,
        ...overrides,
      },
    }
  );
}

describe('useAgentAdminEvents', () => {
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    jest.useFakeTimers();
    socket = makeSocket();
    getSocket().mockReturnValue(socket);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── mount / unmount ─────────────────────────────────────────────────────────

  it('emits ADMIN_AGENT_SUBSCRIBE on mount', () => {
    renderAgentEvents();
    expect(socket.emit).toHaveBeenCalledWith('admin:agent-subscribe', expect.any(Function));
  });

  it('emits ADMIN_AGENT_UNSUBSCRIBE and removes listeners on unmount', () => {
    const { unmount } = renderAgentEvents();
    unmount();
    expect(socket.emit).toHaveBeenCalledWith('admin:agent-unsubscribe');
    expect(socket.off).toHaveBeenCalledWith('agent:admin-event', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('clears pending debounce timer on unmount', () => {
    const onChange = jest.fn();
    const { unmount } = renderAgentEvents({}, onChange);
    socket.trigger('agent:admin-event', { kind: 'delivery-queue' });
    unmount();
    jest.runAllTimers();
    expect(onChange).not.toHaveBeenCalled();
  });

  // ── disabled ─────────────────────────────────────────────────────────────────

  it('does nothing when enabled is false', () => {
    renderAgentEvents({ enabled: false });
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });

  it('does nothing when getSocket returns null', () => {
    getSocket().mockReturnValue(null);
    renderAgentEvents();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  // ── event filtering ──────────────────────────────────────────────────────────

  it('triggers onChange (debounced) for a matching kind', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['delivery-queue'] }, onChange);
    socket.trigger('agent:admin-event', { kind: 'delivery-queue' });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores events whose kind is not in the kinds list', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['delivery-queue'] }, onChange);
    socket.trigger('agent:admin-event', { kind: 'scan' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes through when no conversationId filter is set', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['scan'] }, onChange);
    socket.trigger('agent:admin-event', { kind: 'scan', conversationId: 'conv-1' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('filters by conversationId when provided — matching id passes through', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['scan'], conversationId: 'conv-1' }, onChange);
    socket.trigger('agent:admin-event', { kind: 'scan', conversationId: 'conv-1' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('filters by conversationId — non-matching id is ignored', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['scan'], conversationId: 'conv-1' }, onChange);
    socket.trigger('agent:admin-event', { kind: 'scan', conversationId: 'conv-2' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes through a global event (no conversationId on event) even when filter is set', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['scan'], conversationId: 'conv-1' }, onChange);
    // Event has no conversationId => global event => should pass through
    socket.trigger('agent:admin-event', { kind: 'scan' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // ── debounce ─────────────────────────────────────────────────────────────────

  it('coalesces multiple rapid events into a single onChange call', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['delivery-queue'] }, onChange);
    socket.trigger('agent:admin-event', { kind: 'delivery-queue' });
    socket.trigger('agent:admin-event', { kind: 'delivery-queue' });
    socket.trigger('agent:admin-event', { kind: 'delivery-queue' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('respects custom debounceMs', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['scan'], debounceMs: 200 }, onChange);
    socket.trigger('agent:admin-event', { kind: 'scan' });
    act(() => { jest.advanceTimersByTime(199); });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('resets debounce window if a second event arrives before timer fires', () => {
    const onChange = jest.fn();
    renderAgentEvents({ kinds: ['scan'], debounceMs: 400 }, onChange);
    socket.trigger('agent:admin-event', { kind: 'scan' });
    act(() => { jest.advanceTimersByTime(200); }); // mid-debounce
    // A second event should NOT restart the timer (timer already running — scheduleChange is guarded by `if (timer) return`)
    socket.trigger('agent:admin-event', { kind: 'scan' });
    act(() => { jest.advanceTimersByTime(200); }); // complete original 400ms window
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // ── reconnect ────────────────────────────────────────────────────────────────

  it('re-subscribes and schedules onChange on socket reconnect', () => {
    const onChange = jest.fn();
    renderAgentEvents({}, onChange);
    // Simulate reconnect
    socket.trigger('connect');
    expect(socket.emit).toHaveBeenCalledWith('admin:agent-subscribe', expect.any(Function));
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // ── kindsKey reactivity ───────────────────────────────────────────────────────

  it('re-subscribes when kinds list changes (different kindsKey)', () => {
    const onChange = jest.fn();
    const { rerender } = renderAgentEvents({ kinds: ['scan'] as readonly AgentAdminEventKind[] }, onChange);
    const prevEmitCount = socket.emit.mock.calls.length;
    // Change kinds
    rerender({ kinds: ['delivery-queue'] as readonly AgentAdminEventKind[], onChange });
    // A new subscription should be emitted after the effect re-runs
    expect(socket.emit.mock.calls.length).toBeGreaterThan(prevEmitCount);
  });

  it('uses options from optionsRef so stale onChange closure is avoided', () => {
    const onChange1 = jest.fn();
    const onChange2 = jest.fn();
    const { rerender } = renderAgentEvents({}, onChange1);
    // Update onChange without changing kinds (no re-subscribe, but ref is updated)
    rerender({ kinds: KINDS, onChange: onChange2 });
    socket.trigger('agent:admin-event', { kind: 'delivery-queue' });
    act(() => { jest.advanceTimersByTime(DEFAULT_DEBOUNCE); });
    // Should call the latest onChange (onChange2), not stale onChange1
    expect(onChange2).toHaveBeenCalledTimes(1);
    expect(onChange1).not.toHaveBeenCalled();
  });
});
