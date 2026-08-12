/**
 * useCallRetryToast — turns a store `pendingRetry` offer into an actionable
 * « Réessayer » toast for the matching conversation, and re-initiates on tap.
 */

import { renderHook, act } from '@testing-library/react';

const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
jest.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }));

import { useCallStore } from '@/stores/call-store';
import { useCallRetryToast } from '@/hooks/conversations/use-call-retry-toast';

describe('useCallRetryToast', () => {
  beforeEach(() => {
    toastError.mockClear();
    act(() => { useCallStore.getState().clearCallRetry(); });
  });

  it('shows a retry toast when an offer lands for THIS conversation', () => {
    renderHook(() => useCallRetryToast('conv-1', jest.fn()));

    act(() => {
      useCallStore.getState().offerCallRetry({ conversationId: 'conv-1', type: 'video' });
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe('toasts.callFailed');
    // The offer is consumed so it doesn't re-fire.
    expect(useCallStore.getState().pendingRetry['conv-1']).toBeUndefined();
  });

  it('ignores an offer for a DIFFERENT conversation, without dropping it', () => {
    renderHook(() => useCallRetryToast('conv-1', jest.fn()));

    act(() => {
      useCallStore.getState().offerCallRetry({ conversationId: 'conv-OTHER', type: 'audio' });
    });

    expect(toastError).not.toHaveBeenCalled();
    // Left standing (keyed by conversationId) for the other conversation's
    // hook instance to consume — a later offer for THIS conversation must
    // not silently destroy it (regression: pendingRetry used to be a single
    // scalar clobbered by every offerCallRetry call, so this offer would
    // have been lost forever the moment any other conversation failed too).
    expect(useCallStore.getState().pendingRetry['conv-OTHER']).toEqual({
      conversationId: 'conv-OTHER',
      type: 'audio',
    });

    act(() => {
      useCallStore.getState().offerCallRetry({ conversationId: 'conv-YET-ANOTHER', type: 'video' });
    });

    expect(useCallStore.getState().pendingRetry['conv-OTHER']).toEqual({
      conversationId: 'conv-OTHER',
      type: 'audio',
    });
  });

  it('the toast action re-initiates the same call type', () => {
    const onRetry = jest.fn();
    renderHook(() => useCallRetryToast('conv-1', onRetry));

    act(() => {
      useCallStore.getState().offerCallRetry({ conversationId: 'conv-1', type: 'audio' });
    });

    const action = toastError.mock.calls[0][1].action;
    action.onClick();

    expect(onRetry).toHaveBeenCalledWith('audio');
  });

  it('does nothing without a conversation id', () => {
    renderHook(() => useCallRetryToast(null, jest.fn()));

    act(() => {
      useCallStore.getState().offerCallRetry({ conversationId: 'conv-1', type: 'video' });
    });

    expect(toastError).not.toHaveBeenCalled();
  });
});
