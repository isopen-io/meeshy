jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getParticipants: jest.fn(),
  },
}));

jest.mock('@/stores/user-store', () => ({
  useUserStore: jest.fn(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';
import { conversationsService } from '@/services/conversations.service';
import { useUserStore } from '@/stores/user-store';

const mockSetParticipants = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  (useUserStore as jest.Mock).mockImplementation((selector: (state: { setParticipants: jest.Mock }) => unknown) =>
    selector({ setParticipants: mockSetParticipants })
  );
  (conversationsService.getParticipants as jest.Mock).mockResolvedValue([]);
});

describe('useManualStatusRefresh', () => {
  it('does nothing when conversationId is null', async () => {
    const { result } = renderHook(() => useManualStatusRefresh(null));

    await act(async () => {
      await result.current.refresh();
    });

    expect(conversationsService.getParticipants).not.toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);
  });

  it('calls getParticipants with conversationId on refresh', async () => {
    const conversationId = 'conv-123';
    const { result } = renderHook(() => useManualStatusRefresh(conversationId));

    await act(async () => {
      await result.current.refresh();
    });

    expect(conversationsService.getParticipants).toHaveBeenCalledWith(conversationId);
  });

  it('calls setParticipants with result on success and isRefreshing is false after', async () => {
    const participants = [{ id: 'user-1' }];
    (conversationsService.getParticipants as jest.Mock).mockResolvedValue(participants);

    const { result } = renderHook(() => useManualStatusRefresh('conv-456'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockSetParticipants).toHaveBeenCalledWith(participants);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('sets isRefreshing to false after error and re-throws', async () => {
    const error = new Error('Network failure');
    (conversationsService.getParticipants as jest.Mock).mockRejectedValue(error);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useManualStatusRefresh('conv-789'));

    await expect(
      act(async () => {
        await result.current.refresh();
      })
    ).rejects.toThrow('Network failure');

    expect(result.current.isRefreshing).toBe(false);
  });

  it('isRefreshing is true during the call and false after', async () => {
    let resolveParticipants!: (value: unknown[]) => void;
    const deferred = new Promise<unknown[]>((resolve) => {
      resolveParticipants = resolve;
    });
    (conversationsService.getParticipants as jest.Mock).mockReturnValue(deferred);

    const { result } = renderHook(() => useManualStatusRefresh('conv-abc'));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));

    await act(async () => {
      resolveParticipants([]);
      await deferred;
    });

    expect(result.current.isRefreshing).toBe(false);
  });

  it('ignores second refresh call when already refreshing', async () => {
    let resolveFirst!: (value: unknown[]) => void;
    const firstCall = new Promise<unknown[]>((resolve) => {
      resolveFirst = resolve;
    });
    (conversationsService.getParticipants as jest.Mock).mockReturnValueOnce(firstCall);

    const { result } = renderHook(() => useManualStatusRefresh('conv-guard'));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));

    await act(async () => {
      result.current.refresh();
    });

    expect(conversationsService.getParticipants).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst([]);
      await firstCall;
    });
  });

  it('does nothing when conversationId is an empty string', async () => {
    const { result } = renderHook(() => useManualStatusRefresh(''));

    await act(async () => {
      await result.current.refresh();
    });

    expect(conversationsService.getParticipants).not.toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);
  });
});
