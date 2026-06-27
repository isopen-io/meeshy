/**
 * Tests for hooks/use-manual-status-refresh.ts
 */

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getParticipants: jest.fn(),
  },
}));

jest.mock('@/stores/user-store', () => ({
  useUserStore: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';
import { conversationsService } from '@/services/conversations.service';
import { useUserStore } from '@/stores/user-store';

const mockGetParticipants = conversationsService.getParticipants as jest.Mock;
const mockUseUserStore = useUserStore as jest.Mock;
const mockSetParticipants = jest.fn();

const fakeParticipants = [{ id: 'u1', username: 'alice' }];

beforeEach(() => {
  mockGetParticipants.mockReset();
  mockSetParticipants.mockReset();
  mockUseUserStore.mockImplementation(
    (selector: (state: { setParticipants: jest.Mock }) => unknown) =>
      selector({ setParticipants: mockSetParticipants })
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isRefreshing starts as false', () => {
    const { result } = renderHook(() => useManualStatusRefresh('conv1'));
    expect(result.current.isRefreshing).toBe(false);
  });
});

// ─── refresh ──────────────────────────────────────────────────────────────────

describe('refresh', () => {
  it('does nothing when conversationId is null', async () => {
    const { result } = renderHook(() => useManualStatusRefresh(null));
    await act(async () => { await result.current.refresh(); });
    expect(mockGetParticipants).not.toHaveBeenCalled();
  });

  it('calls getParticipants with the conversationId', async () => {
    mockGetParticipants.mockResolvedValue(fakeParticipants);
    const { result } = renderHook(() => useManualStatusRefresh('conv1'));
    await act(async () => { await result.current.refresh(); });
    expect(mockGetParticipants).toHaveBeenCalledWith('conv1');
  });

  it('calls setParticipants with the fetched data', async () => {
    mockGetParticipants.mockResolvedValue(fakeParticipants);
    const { result } = renderHook(() => useManualStatusRefresh('conv1'));
    await act(async () => { await result.current.refresh(); });
    expect(mockSetParticipants).toHaveBeenCalledWith(fakeParticipants);
  });

  it('sets isRefreshing to true while fetching then false on success', async () => {
    let resolveParticipants!: (v: typeof fakeParticipants) => void;
    mockGetParticipants.mockReturnValue(
      new Promise<typeof fakeParticipants>(r => { resolveParticipants = r; })
    );

    const { result } = renderHook(() => useManualStatusRefresh('conv1'));

    act(() => { void result.current.refresh(); });
    expect(result.current.isRefreshing).toBe(true);

    await act(async () => { resolveParticipants(fakeParticipants); });
    expect(result.current.isRefreshing).toBe(false);
  });

  it('resets isRefreshing to false when getParticipants throws', async () => {
    mockGetParticipants.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useManualStatusRefresh('conv1'));
    await expect(
      act(async () => { await result.current.refresh(); })
    ).rejects.toThrow('network error');
    expect(result.current.isRefreshing).toBe(false);
  });

  it('re-throws the error from getParticipants', async () => {
    mockGetParticipants.mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useManualStatusRefresh('conv1'));
    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.refresh();
      } catch (e) {
        caught = e as Error;
      }
    });
    expect(caught).not.toBeNull();
    expect(caught!.message).toBe('timeout');
  });
});
