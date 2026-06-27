/**
 * Tests for hooks/use-preferences.ts
 */

const mockMutateAsync = jest.fn();
const mockRefetch = jest.fn();
const mockCancelQueries = jest.fn();
const mockGetQueryData = jest.fn();
const mockSetQueryData = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  })),
  useMutation: jest.fn((opts: any) => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    _opts: opts,
  })),
  useQueryClient: jest.fn(() => ({
    cancelQueries: mockCancelQueries,
    getQueryData: mockGetQueryData,
    setQueryData: mockSetQueryData,
  })),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    patch: jest.fn(),
    put: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    preferences: {
      category: (cat: string) => ['preferences', cat],
    },
  },
}));

jest.mock('@/lib/settings-sync', () => ({
  broadcastPreferenceUpdate: jest.fn(),
}));

jest.mock('@/types/preferences', () => ({
  isConsentRequiredError: (err: any) => err?.error === 'CONSENT_REQUIRED',
  isPreferenceErrorResponse: (err: any) => err?.success === false,
}));

import { renderHook, act } from '@testing-library/react';
import { usePreferences } from '@/hooks/use-preferences';
import { useQuery, useMutation } from '@tanstack/react-query';

const mockUseQuery = useQuery as jest.Mock;
const mockUseMutation = useMutation as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  });
  mockUseMutation.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
  mockMutateAsync.mockResolvedValue({ enabled: true });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('data is undefined initially', () => {
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.data).toBeUndefined();
  });

  it('isLoading starts false when query is not loading', () => {
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.isLoading).toBe(false);
  });

  it('error starts null', () => {
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.error).toBeNull();
  });

  it('isUpdating starts false', () => {
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.isUpdating).toBe(false);
  });

  it('consentViolations starts null', () => {
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.consentViolations).toBeNull();
  });
});

// ─── data from query ──────────────────────────────────────────────────────────

describe('data from query', () => {
  it('returns data from useQuery', () => {
    mockUseQuery.mockReturnValue({
      data: { enabled: true },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.data).toEqual({ enabled: true });
  });

  it('returns isLoading=true when query is loading', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns error from useQuery', () => {
    const err = new Error('query failed');
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: err,
      refetch: mockRefetch,
    });
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.error).toBe(err);
  });
});

// ─── isUpdating ───────────────────────────────────────────────────────────────

describe('isUpdating', () => {
  it('isUpdating=true when update mutation is pending', () => {
    mockUseMutation
      .mockReturnValueOnce({ mutateAsync: mockMutateAsync, isPending: true })
      .mockReturnValueOnce({ mutateAsync: mockMutateAsync, isPending: false });
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.isUpdating).toBe(true);
  });

  it('isUpdating=true when replace mutation is pending', () => {
    mockUseMutation
      .mockReturnValueOnce({ mutateAsync: mockMutateAsync, isPending: false })
      .mockReturnValueOnce({ mutateAsync: mockMutateAsync, isPending: true });
    const { result } = renderHook(() => usePreferences('privacy'));
    expect(result.current.isUpdating).toBe(true);
  });
});

// ─── updatePreferences ────────────────────────────────────────────────────────

describe('updatePreferences', () => {
  it('calls mutation.mutateAsync with the partial update', async () => {
    mockMutateAsync.mockResolvedValue({ transcriptionEnabled: true });
    const { result } = renderHook(() => usePreferences('privacy'));
    await act(async () => {
      await result.current.updatePreferences({ transcriptionEnabled: true } as any);
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({ transcriptionEnabled: true });
  });

  it('returns the mutation result', async () => {
    const updated = { transcriptionEnabled: true };
    mockMutateAsync.mockResolvedValue(updated);
    const { result } = renderHook(() => usePreferences('privacy'));
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.updatePreferences({ transcriptionEnabled: true } as any);
    });
    expect(returnValue).toEqual(updated);
  });
});

// ─── replacePreferences ───────────────────────────────────────────────────────

describe('replacePreferences', () => {
  it('calls the replace mutation mutateAsync', async () => {
    const newData = { enabled: false };
    mockMutateAsync.mockResolvedValue(newData);
    const { result } = renderHook(() => usePreferences('privacy'));
    await act(async () => {
      await result.current.replacePreferences(newData as any);
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(newData);
  });
});

// ─── refetch ─────────────────────────────────────────────────────────────────

describe('refetch', () => {
  it('calls query refetch when invoked', async () => {
    const { result } = renderHook(() => usePreferences('privacy'));
    await act(async () => { await result.current.refetch(); });
    expect(mockRefetch).toHaveBeenCalled();
  });
});

// ─── options disabled ─────────────────────────────────────────────────────────

describe('options', () => {
  it('passes enabled=false to useQuery', () => {
    renderHook(() => usePreferences('privacy', { enabled: false }));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });
});
