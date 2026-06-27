/**
 * Tests for hooks/use-link-validation.ts
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

jest.mock('@/services/users.service', () => ({
  usersService: {
    getUserAffiliateToken: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useLinkValidation, useUsernameValidation } from '@/hooks/use-link-validation';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── useLinkValidation ────────────────────────────────────────────────────────

describe('useLinkValidation', () => {
  it('starts with isLoading=true and no conversationLink', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useLinkValidation('link-1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.conversationLink).toBeNull();
    expect(result.current.linkError).toBeNull();
  });

  it('fetches the correct URL', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: true, data: { id: 'link-1' } }));
    renderHook(() => useLinkValidation('link-1'));
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/v1/anonymous/link/link-1');
  });

  it('sets conversationLink on success', async () => {
    const linkData = { id: 'link-1', title: 'Chat' };
    mockFetch.mockReturnValue(jsonResponse({ success: true, data: linkData }));
    const { result } = renderHook(() => useLinkValidation('link-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.conversationLink).toEqual(linkData);
    expect(result.current.linkError).toBeNull();
  });

  it('sets linkError when response success is false', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: false, message: 'Link expired' }));
    const { result } = renderHook(() => useLinkValidation('link-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.linkError).toBe('Link expired');
    expect(result.current.conversationLink).toBeNull();
  });

  it('sets default linkError when HTTP response is not ok', async () => {
    mockFetch.mockReturnValue(jsonResponse({ message: 'Not found' }, false));
    const { result } = renderHook(() => useLinkValidation('link-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.linkError).toBeTruthy();
  });

  it('sets linkError on fetch exception', async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error('network')));
    const { result } = renderHook(() => useLinkValidation('link-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.linkError).toBeTruthy();
  });

  it('does not fetch when linkId is empty', () => {
    renderHook(() => useLinkValidation(''));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('isLoading becomes false after resolving', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: true, data: {} }));
    const { result } = renderHook(() => useLinkValidation('link-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

// ─── useUsernameValidation ────────────────────────────────────────────────────

describe('useUsernameValidation', () => {
  it('starts as idle', () => {
    const { result } = renderHook(() => useUsernameValidation(''));
    expect(result.current).toBe('idle');
  });

  it('stays idle for blank username', () => {
    const { result } = renderHook(() => useUsernameValidation('   '));
    jest.runAllTimers();
    expect(result.current).toBe('idle');
  });

  it('transitions to checking while waiting for the debounce', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUsernameValidation('alice'));
    // After update, status should be 'checking' (debounce starts)
    expect(result.current).toBe('checking');
  });

  it('becomes available after debounce fires with usernameAvailable=true', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { usernameAvailable: true } })
    );
    const { result } = renderHook(() => useUsernameValidation('alice'));
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
    expect(result.current).toBe('available');
  });

  it('becomes taken after debounce fires with usernameAvailable=false', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { usernameAvailable: false } })
    );
    const { result } = renderHook(() => useUsernameValidation('takenuser'));
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
    expect(result.current).toBe('taken');
  });

  it('returns idle when API returns success=false', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: false }));
    const { result } = renderHook(() => useUsernameValidation('alice'));
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
    expect(result.current).toBe('idle');
  });

  it('returns idle on fetch error', async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error('network error')));
    const { result } = renderHook(() => useUsernameValidation('alice'));
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
    expect(result.current).toBe('idle');
  });

  it('returns idle when HTTP response is not ok', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, false));
    const { result } = renderHook(() => useUsernameValidation('alice'));
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
    expect(result.current).toBe('idle');
  });

  it('encodes the username in the check URL', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { usernameAvailable: true } })
    );
    renderHook(() => useUsernameValidation('alice smith'));
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('alice%20smith')
    );
  });
});
