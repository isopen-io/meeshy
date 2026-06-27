/**
 * Tests for hooks/use-field-validation.ts
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

jest.mock('@meeshy/shared/utils/email-validator', () => ({
  getEmailValidationError: (email: string) => {
    if (!email.includes('@')) return 'Invalid email format';
    return null;
  },
}));

// phone-validator is dynamically imported — mock it via module registry
jest.mock('@/utils/phone-validator', () => ({
  getPhoneValidationError: (phone: string) =>
    phone.length < 6 ? 'phoneInvalidFormat' : null,
  translatePhoneError: (key: string, _t: unknown) => `phone error: ${key}`,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFieldValidation } from '@/hooks/use-field-validation';

const t = (key: string) => `t:${key}`;

const jsonResponse = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial state ─────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts as idle with no error', () => {
    const { result } = renderHook(() =>
      useFieldValidation({ value: '', t, type: 'username' })
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBe('');
  });
});

// ─── disabled prop ────────────────────────────────────────────────────────────

describe('disabled', () => {
  it('skips validation when disabled=true', async () => {
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice', t, type: 'username', disabled: true })
    );
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});

// ─── email validation ─────────────────────────────────────────────────────────

describe('email type — format validation', () => {
  it('sets invalid when email has no @', async () => {
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'notanemail', t, type: 'email' })
    );
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(result.current.errorMessage).toBeTruthy();
  });

  it('proceeds to checking when email format is valid', async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice@example.com', t, type: 'email' })
    );
    await waitFor(() => expect(result.current.status).toBe('checking'));
  });

  it('sets valid when email is available', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { emailAvailable: true } })
    );
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice@example.com', t, type: 'email' })
    );
    await act(async () => { await Promise.resolve(); });
    // Advance debounce timer
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('valid');
    expect(result.current.errorMessage).toBe('');
  });

  it('sets taken when email is already registered', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { emailAvailable: false } })
    );
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'taken@example.com', t, type: 'email' })
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('taken');
    expect(result.current.errorMessage).toContain('emailExists');
  });
});

// ─── username validation ──────────────────────────────────────────────────────

describe('username type — format validation', () => {
  it('stays idle for usernames shorter than 2 chars', async () => {
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'a', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stays idle for usernames with invalid characters', async () => {
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice!', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe('idle');
  });

  it('proceeds to checking for valid username format', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice', t, type: 'username' })
    );
    await waitFor(() => expect(result.current.status).toBe('checking'));
  });

  it('sets available when username is free', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { usernameAvailable: true } })
    );
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('available');
  });

  it('sets taken when username is already used', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ success: true, data: { usernameAvailable: false } })
    );
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'taken', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('taken');
  });
});

// ─── phone validation ─────────────────────────────────────────────────────────

describe('phone type — format validation', () => {
  it('sets invalid when phone is too short', async () => {
    const { result } = renderHook(() =>
      useFieldValidation({ value: '0612', t, type: 'phone' })
    );
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(result.current.errorMessage).toContain('phoneInvalidFormat');
  });

  it('proceeds to checking for valid phone format', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useFieldValidation({ value: '0612345678', t, type: 'phone' })
    );
    await waitFor(() => expect(result.current.status).toBe('checking'));
  });
});

// ─── API error handling ───────────────────────────────────────────────────────

describe('API error handling', () => {
  it('sets invalid with rate-limit message on 429', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, false, 429));
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('invalid');
    expect(result.current.errorMessage).toContain('rateLimited');
  });

  it('sets invalid with network error message on other HTTP errors', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, false, 500));
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('invalid');
    expect(result.current.errorMessage).toContain('networkError');
  });

  it('sets invalid on fetch network exception', async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error('net')));
    const { result } = renderHook(() =>
      useFieldValidation({ value: 'alice', t, type: 'username' })
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(2001);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('invalid');
    expect(result.current.errorMessage).toContain('networkError');
  });
});

// ─── empty value ──────────────────────────────────────────────────────────────

describe('empty value', () => {
  it('resets to idle when value becomes empty', async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) =>
        useFieldValidation({ value, t, type: 'username' }),
      { initialProps: { value: 'alice' } }
    );
    // Let the initial effect settle
    await waitFor(() => expect(result.current.status).toBe('checking'));
    rerender({ value: '' });
    await waitFor(() => {
      expect(result.current.status).toBe('idle');
      expect(result.current.errorMessage).toBe('');
    });
  });
});
