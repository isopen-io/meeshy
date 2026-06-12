/**
 * Iter 38 (F4) — push admin agent : le hook s'abonne à la room admin:agent,
 * filtre les events `agent:admin-event` par kind/conversation et déclenche
 * un refetch debouncé. Remplace les pollings courts du dashboard admin.
 */

import { renderHook, act } from '@testing-library/react';
import { useAgentAdminEvents } from '@/hooks/admin/use-agent-admin-events';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: jest.fn(),
  },
}));

type Listener = (...args: unknown[]) => void;

function createFakeSocket() {
  const listeners = new Map<string, Listener[]>();
  return {
    emit: jest.fn(),
    on: jest.fn((event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    off: jest.fn((event: string, listener: Listener) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener));
    }),
    _fire(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
  };
}

describe('useAgentAdminEvents', () => {
  let socket: ReturnType<typeof createFakeSocket>;

  beforeEach(() => {
    jest.useFakeTimers();
    socket = createFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() =>
      useAgentAdminEvents({ kinds: ['delivery-queue'], onChange: jest.fn() })
    );

    expect(socket.emit).toHaveBeenCalledWith('admin:agent-subscribe', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('agent:admin-event', expect.any(Function));

    unmount();

    expect(socket.emit).toHaveBeenCalledWith('admin:agent-unsubscribe');
    expect(socket.off).toHaveBeenCalledWith('agent:admin-event', expect.any(Function));
  });

  it('calls onChange after the debounce window for a matching kind', () => {
    const onChange = jest.fn();
    renderHook(() => useAgentAdminEvents({ kinds: ['delivery-queue', 'scan'], onChange }));

    act(() => {
      socket._fire('agent:admin-event', { kind: 'delivery-queue', conversationId: 'c1' });
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of events into a single onChange', () => {
    const onChange = jest.fn();
    renderHook(() => useAgentAdminEvents({ kinds: ['delivery-queue'], onChange }));

    act(() => {
      socket._fire('agent:admin-event', { kind: 'delivery-queue' });
      socket._fire('agent:admin-event', { kind: 'delivery-queue' });
      socket._fire('agent:admin-event', { kind: 'delivery-queue' });
      jest.advanceTimersByTime(400);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores events whose kind is not watched', () => {
    const onChange = jest.fn();
    renderHook(() => useAgentAdminEvents({ kinds: ['config'], onChange }));

    act(() => {
      socket._fire('agent:admin-event', { kind: 'delivery-queue' });
      jest.advanceTimersByTime(1000);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('scopes by conversationId but accepts global events', () => {
    const onChange = jest.fn();
    renderHook(() =>
      useAgentAdminEvents({ kinds: ['scan'], conversationId: 'c1', onChange })
    );

    act(() => {
      socket._fire('agent:admin-event', { kind: 'scan', conversationId: 'other' });
      jest.advanceTimersByTime(1000);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      socket._fire('agent:admin-event', { kind: 'scan', conversationId: 'c1' });
      socket._fire('agent:admin-event', { kind: 'scan' });
      jest.advanceTimersByTime(1000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('resubscribes and resyncs on socket reconnect', () => {
    const onChange = jest.fn();
    renderHook(() => useAgentAdminEvents({ kinds: ['delivery-queue'], onChange }));
    (socket.emit as jest.Mock).mockClear();

    act(() => {
      socket._fire('connect');
      jest.advanceTimersByTime(400);
    });

    expect(socket.emit).toHaveBeenCalledWith('admin:agent-subscribe', expect.any(Function));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    renderHook(() =>
      useAgentAdminEvents({ kinds: ['delivery-queue'], onChange: jest.fn(), enabled: false })
    );

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });
});
