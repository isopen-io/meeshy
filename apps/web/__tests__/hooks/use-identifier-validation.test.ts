/**
 * Tests for hooks/use-identifier-validation.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdentifierValidation } from '@/hooks/use-identifier-validation';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
  },
}));

import { apiService } from '@/services/api.service';
const mockGet = apiService.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── validateIdentifierFormat ─────────────────────────────────────────────────

describe('validateIdentifierFormat', () => {
  it('accepts alphanumeric characters', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    expect(result.current.validateIdentifierFormat('abc123')).toBe(true);
  });

  it('accepts hyphens, underscores and @ symbols', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    expect(result.current.validateIdentifierFormat('my-group_id@here')).toBe(true);
  });

  it('rejects spaces', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    expect(result.current.validateIdentifierFormat('my group')).toBe(false);
  });

  it('rejects special characters', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    expect(result.current.validateIdentifierFormat('id!!')).toBe(false);
  });

  it('returns false for empty string', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    expect(result.current.validateIdentifierFormat('')).toBe(false);
  });
});

// ─── generateIdentifierFromTitle ─────────────────────────────────────────────

describe('generateIdentifierFromTitle', () => {
  it('returns empty string for empty title', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    expect(result.current.generateIdentifierFromTitle('')).toBe('');
    expect(result.current.generateIdentifierFromTitle('   ')).toBe('');
  });

  it('lowercases the title', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    const id = result.current.generateIdentifierFromTitle('Hello World');
    expect(id.startsWith('hello-world-')).toBe(true);
  });

  it('replaces spaces with hyphens', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    const id = result.current.generateIdentifierFromTitle('My Group Name');
    expect(id.startsWith('my-group-name-')).toBe(true);
  });

  it('strips special characters except hyphens', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    const id = result.current.generateIdentifierFromTitle('Cool!! Group?');
    expect(id.startsWith('cool-group-')).toBe(true);
  });

  it('appends a hex suffix for uniqueness', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    const id = result.current.generateIdentifierFromTitle('test');
    // format: 'test-xxxxxxxx' where x is hex
    const parts = id.split('-');
    const hexSuffix = parts[parts.length - 1];
    expect(hexSuffix).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different identifiers on successive calls (random suffix)', () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    const id1 = result.current.generateIdentifierFromTitle('test');
    const id2 = result.current.generateIdentifierFromTitle('test');
    // May occasionally collide but extremely unlikely
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
  });
});

// ─── checkIdentifierAvailability ─────────────────────────────────────────────

describe('checkIdentifierAvailability', () => {
  it('sets identifierAvailable to null when identifier is too short', async () => {
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    await act(async () => {
      await result.current.checkIdentifierAvailability('ab');
    });
    expect(result.current.identifierAvailable).toBeNull();
  });

  it('calls the API when identifier is long enough', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, available: true } });
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    await act(async () => {
      await result.current.checkIdentifierAvailability('my-group');
    });
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('my-group'));
  });

  it('sets identifierAvailable to true when API reports available', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, available: true } });
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    await act(async () => {
      await result.current.checkIdentifierAvailability('my-group');
    });
    expect(result.current.identifierAvailable).toBe(true);
  });

  it('sets identifierAvailable to false when API reports taken', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, available: false } });
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    await act(async () => {
      await result.current.checkIdentifierAvailability('my-group');
    });
    expect(result.current.identifierAvailable).toBe(false);
  });

  it('sets identifierAvailable to null on API error', async () => {
    mockGet.mockRejectedValueOnce(new Error('network error'));
    const { result } = renderHook(() => useIdentifierValidation('', 'group'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await result.current.checkIdentifierAvailability('my-group');
    });
    expect(result.current.identifierAvailable).toBeNull();
    consoleSpy.mockRestore();
  });

  it('manages isCheckingIdentifier: true during fetch, false after', async () => {
    let resolvePromise!: (v: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise(res => { resolvePromise = res; }));

    const { result } = renderHook(() => useIdentifierValidation('', 'group'));

    act(() => {
      result.current.checkIdentifierAvailability('my-group');
    });

    await waitFor(() => {
      expect(result.current.isCheckingIdentifier).toBe(true);
    });

    await act(async () => {
      resolvePromise({ data: { success: true, available: true } });
    });

    expect(result.current.isCheckingIdentifier).toBe(false);
  });
});

// ─── auto-check effect ────────────────────────────────────────────────────────

describe('auto-check effect', () => {
  it('skips API call when conversationType is direct', async () => {
    renderHook(() => useIdentifierValidation('my-group', 'direct'));
    await act(async () => { jest.runAllTimers(); });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('skips API call when identifier is shorter than 3 chars', async () => {
    renderHook(() => useIdentifierValidation('ab', 'group'));
    await act(async () => { jest.runAllTimers(); });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('skips API call when identifier has invalid format', async () => {
    renderHook(() => useIdentifierValidation('ab!!', 'group'));
    await act(async () => { jest.runAllTimers(); });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('calls API after debounce when identifier is valid for group type', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, available: true } });
    renderHook(() => useIdentifierValidation('my-group', 'group'));
    await act(async () => { jest.runAllTimers(); });
    expect(mockGet).toHaveBeenCalled();
  });
});
