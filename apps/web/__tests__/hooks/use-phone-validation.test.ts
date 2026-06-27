/**
 * Tests for hooks/use-phone-validation.ts
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

jest.mock('@/utils/phone-validation-robust', () => ({
  validatePhoneNumber: (phone: string, countryCode: string) => {
    if (!phone || phone.length < 4) {
      return { isValid: false, error: 'phoneTooShort', formatted: null, national: phone };
    }
    if (phone === 'invalid') {
      return { isValid: false, error: 'phoneInvalidFormat', formatted: null, national: phone };
    }
    return {
      isValid: true,
      formatted: `+33${phone.replace(/\D/g, '')}`,
      national: phone,
      error: undefined,
    };
  },
  formatPhoneAsYouType: (value: string, countryCode: string) => `formatted:${value}`,
  buildInternationalPhone: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePhoneValidation } from '@/hooks/use-phone-validation';
import type { CountryCode } from 'libphonenumber-js';

const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockFetch.mockResolvedValue(
    jsonResponse({ success: true, data: { phoneNumberAvailable: true } })
  );
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('status starts as idle', () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '' })
    );
    expect(result.current.status).toBe('idle');
  });

  it('errorMessage starts empty', () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '' })
    );
    expect(result.current.errorMessage).toBe('');
  });

  it('validationResult starts null', () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '' })
    );
    expect(result.current.validationResult).toBeNull();
  });
});

// ─── validate() — manual ──────────────────────────────────────────────────────

describe('validate() — manual call', () => {
  it('sets status=idle when phone is empty', async () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '' })
    );
    await act(async () => { await result.current.validate(); });
    expect(result.current.status).toBe('idle');
  });

  it('sets status=invalid for short phone numbers', async () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '06' })
    );
    await act(async () => { await result.current.validate(); });
    expect(result.current.status).toBe('invalid');
    expect(result.current.errorMessage).toBeTruthy();
  });

  it('sets status=valid for valid phone number without availability check', async () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '0612345678' })
    );
    await act(async () => { await result.current.validate(); });
    expect(result.current.status).toBe('valid');
    expect(result.current.errorMessage).toBe('');
  });

  it('sets validationResult for valid phone', async () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '0612345678' })
    );
    await act(async () => { await result.current.validate(); });
    expect(result.current.validationResult).not.toBeNull();
    expect(result.current.validationResult?.isValid).toBe(true);
  });

  it('does nothing when disabled=true', async () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '0612345678', disabled: true })
    );
    await act(async () => { await result.current.validate(); });
    expect(result.current.status).toBe('idle');
  });

  it('calls onValidationChange when phone becomes valid', async () => {
    const onValidationChange = jest.fn();
    const { result } = renderHook(() =>
      usePhoneValidation({
        countryCode: 'FR' as CountryCode,
        phoneNumber: '0612345678',
        onValidationChange,
      })
    );
    await act(async () => { await result.current.validate(); });
    expect(onValidationChange).toHaveBeenCalledWith(true, expect.any(String));
  });
});

// ─── availability check ───────────────────────────────────────────────────────

describe('availability check', () => {
  it('sets status=checking then valid when phone is available', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { phoneNumberAvailable: true } })
    );
    const { result } = renderHook(() =>
      usePhoneValidation({
        countryCode: 'FR' as CountryCode,
        phoneNumber: '0612345678',
        checkAvailability: true,
        debounceMs: 100,
      })
    );
    await act(async () => { await result.current.validate(); });
    expect(result.current.status).toBe('checking');

    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('valid');
  });

  it('sets status=exists when phone is already registered', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { phoneNumberAvailable: false } })
    );
    const { result } = renderHook(() =>
      usePhoneValidation({
        countryCode: 'FR' as CountryCode,
        phoneNumber: '0612345678',
        checkAvailability: true,
        debounceMs: 100,
      })
    );
    await act(async () => { await result.current.validate(); });
    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('exists');
  });

  it('falls back to valid on network error', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      usePhoneValidation({
        countryCode: 'FR' as CountryCode,
        phoneNumber: '0612345678',
        checkAvailability: true,
        debounceMs: 100,
      })
    );
    await act(async () => { await result.current.validate(); });
    await act(async () => {
      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('valid');
  });
});

// ─── formatAsYouType ──────────────────────────────────────────────────────────

describe('formatAsYouType', () => {
  it('formats phone as user types', () => {
    const { result } = renderHook(() =>
      usePhoneValidation({ countryCode: 'FR' as CountryCode, phoneNumber: '' })
    );
    const formatted = result.current.formatAsYouType('0612');
    expect(formatted).toBe('formatted:0612');
  });
});

// ─── validateOnChange ─────────────────────────────────────────────────────────

describe('validateOnChange', () => {
  it('validates automatically when validateOnChange=true', async () => {
    const { result } = renderHook(() =>
      usePhoneValidation({
        countryCode: 'FR' as CountryCode,
        phoneNumber: '0612345678',
        validateOnChange: true,
      })
    );
    await waitFor(() => expect(result.current.status).toBe('valid'));
  });

  it('does not auto-validate when validateOnChange=false (default)', () => {
    const { result } = renderHook(() =>
      usePhoneValidation({
        countryCode: 'FR' as CountryCode,
        phoneNumber: '0612345678',
      })
    );
    expect(result.current.status).toBe('idle');
  });
});
