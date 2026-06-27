/**
 * Tests for hooks/use-font-preference.ts
 */

const mockGetAuthToken = jest.fn(() => null);
jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: () => mockGetAuthToken() },
}));

jest.mock('@/lib/fonts', () => ({
  getFontConfig: (font: string) => {
    const configs: Record<string, { cssClass: string; variable: string }> = {
      nunito: { cssClass: 'font-nunito', variable: '--font-nunito' },
      inter: { cssClass: 'font-inter', variable: '--font-inter' },
      roboto: { cssClass: 'font-roboto', variable: '--font-roboto' },
    };
    return configs[font] ?? null;
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFontPreference } from '@/hooks/use-font-preference';

const successResponse = (value: string) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { value } }),
  } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue(null);
  mockFetch.mockResolvedValue(successResponse('nunito'));
  localStorage.clear();
  document.body.className = '';
  document.documentElement.style.removeProperty('--font-primary');
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('currentFont starts as nunito (default)', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentFont).toBe('nunito');
  });

  it('error starts null', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('fontConfig is exposed for the current font', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fontConfig).toEqual({ cssClass: 'font-nunito', variable: '--font-nunito' });
  });
});

// ─── localStorage load ────────────────────────────────────────────────────────

describe('loading from localStorage', () => {
  it('loads font from localStorage when set', async () => {
    localStorage.setItem('font-family', 'inter');
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentFont).toBe('inter');
  });

  it('applies font CSS class to document.body', async () => {
    localStorage.setItem('font-family', 'inter');
    renderHook(() => useFontPreference());
    await waitFor(() => expect(document.body.classList.contains('font-inter')).toBe(true));
  });

  it('ignores unknown font in localStorage', async () => {
    localStorage.setItem('font-family', 'unknown-font');
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentFont).toBe('nunito');
  });
});

// ─── backend load ──────────────────────────────────────────────────────────────

describe('loading from backend', () => {
  it('fetches from backend when authenticated', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockResolvedValue(successResponse('roboto'));
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/user-preferences/font-family'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }) })
    );
    expect(result.current.currentFont).toBe('roboto');
  });

  it('saves backend font to localStorage', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockResolvedValue(successResponse('inter'));
    renderHook(() => useFontPreference());
    await waitFor(() => expect(localStorage.getItem('font-family')).toBe('inter'));
  });

  it('skips backend when not authenticated', async () => {
    mockGetAuthToken.mockReturnValue(null);
    renderHook(() => useFontPreference());
    await waitFor(() => expect(mockFetch).not.toHaveBeenCalled());
  });

  it('continues with localStorage font when backend fails', async () => {
    localStorage.setItem('font-family', 'roboto');
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentFont).toBe('roboto');
  });
});

// ─── changeFontFamily ─────────────────────────────────────────────────────────

describe('changeFontFamily', () => {
  it('updates currentFont', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.changeFontFamily('inter'); });
    expect(result.current.currentFont).toBe('inter');
  });

  it('applies font class to document.body', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.changeFontFamily('roboto'); });
    expect(document.body.classList.contains('font-roboto')).toBe(true);
  });

  it('saves font to localStorage', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.changeFontFamily('inter'); });
    expect(localStorage.getItem('font-family')).toBe('inter');
  });

  it('sets error when font is unknown', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.changeFontFamily('unknown' as any); });
    expect(result.current.error).not.toBeNull();
  });

  it('posts to backend when authenticated', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token');
    mockFetch.mockResolvedValue({ ok: true, json: jest.fn() } as any);
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.changeFontFamily('inter'); });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/user-preferences'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ─── resetToDefault ───────────────────────────────────────────────────────────

describe('resetToDefault', () => {
  it('resets currentFont to nunito', async () => {
    const { result } = renderHook(() => useFontPreference());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.changeFontFamily('inter'); });
    await act(async () => { await result.current.resetToDefault(); });
    expect(result.current.currentFont).toBe('nunito');
  });
});
