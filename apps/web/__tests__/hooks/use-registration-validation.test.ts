/**
 * Tests for hooks/use-registration-validation.ts
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

jest.mock('@meeshy/shared/utils/email-validator', () => ({
  isValidEmail: (email: string) => /^[^@]+@[^@]+\.[^@]+$/.test(email),
  getEmailValidationError: (email: string) => {
    if (!email.includes('@')) return 'Invalid email';
    return null;
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRegistrationValidation } from '@/hooks/use-registration-validation';
import type { WizardFormData } from '@/hooks/use-registration-wizard';

const makeFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData => ({
  username: '',
  email: '',
  phoneNumber: '',
  firstName: '',
  lastName: '',
  password: '',
  countryCode: 'FR',
  acceptTerms: false,
  ...overrides,
} as WizardFormData);

const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(jsonResponse({ data: { usernameAvailable: true } }));
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('usernameCheckStatus starts idle', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.usernameCheckStatus).toBe('idle');
  });

  it('emailValidationStatus starts idle', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.emailValidationStatus).toBe('idle');
  });

  it('phoneValidationStatus starts idle', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.phoneValidationStatus).toBe('idle');
  });

  it('existingAccount starts null', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.existingAccount).toBeNull();
  });

  it('usernameSuggestions starts empty', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.usernameSuggestions).toEqual([]);
  });
});

// ─── validateUsername ─────────────────────────────────────────────────────────

describe('validateUsername', () => {
  it('returns false for username shorter than 2 chars', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.validateUsername('a')).toBe(false);
  });

  it('returns false for username longer than 16 chars', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.validateUsername('a'.repeat(17))).toBe(false);
  });

  it('returns true for valid alphanumeric username', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.validateUsername('alice123')).toBe(true);
  });

  it('returns true for username with underscore/hyphen', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.validateUsername('alice_bob-99')).toBe(true);
  });

  it('returns false for username with spaces', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.validateUsername('alice bob')).toBe(false);
  });
});

// ─── checkUsernameAvailability ────────────────────────────────────────────────

describe('checkUsernameAvailability', () => {
  it('sets status=idle for short username and returns early', async () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkUsernameAvailability('a'); });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.usernameCheckStatus).toBe('idle');
  });

  it('sets status=available when API says usernameAvailable=true', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { usernameAvailable: true } }));
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkUsernameAvailability('alice'); });
    expect(result.current.usernameCheckStatus).toBe('available');
  });

  it('sets status=taken when API says usernameAvailable=false', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { usernameAvailable: false } }));
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkUsernameAvailability('alice'); });
    expect(result.current.usernameCheckStatus).toBe('taken');
  });

  it('populates usernameSuggestions when username is taken and suggestions provided', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: { usernameAvailable: false, suggestions: ['alice1', 'alice2'] } })
    );
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkUsernameAvailability('alice'); });
    expect(result.current.usernameSuggestions).toEqual(['alice1', 'alice2']);
  });

  it('sets status=idle on network error', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkUsernameAvailability('alice'); });
    expect(result.current.usernameCheckStatus).toBe('idle');
  });
});

// ─── checkEmailAvailability ───────────────────────────────────────────────────

describe('checkEmailAvailability', () => {
  it('does nothing for invalid email', async () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkEmailAvailability('notanemail'); });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets status=valid when email is available', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { emailAvailable: true } }));
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkEmailAvailability('user@example.com'); });
    expect(result.current.emailValidationStatus).toBe('valid');
  });

  it('sets status=exists and existingAccount when email is taken', async () => {
    const accountInfo = { maskedDisplayName: 'A***', maskedUsername: 'a***', maskedPhone: '0***' };
    mockFetch.mockResolvedValue(
      jsonResponse({ data: { emailAvailable: false, accountInfo } })
    );
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkEmailAvailability('user@example.com'); });
    expect(result.current.emailValidationStatus).toBe('exists');
    expect(result.current.existingAccount).toMatchObject({ type: 'email' });
  });
});

// ─── checkPhoneAvailability ───────────────────────────────────────────────────

describe('checkPhoneAvailability', () => {
  it('does nothing for short phone', async () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkPhoneAvailability('123'); });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets status=valid when phone is available', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { phoneNumberAvailable: true } }));
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkPhoneAvailability('+33612345678'); });
    expect(result.current.phoneValidationStatus).toBe('valid');
  });

  it('sets status=exists when phone is taken', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: { phoneNumberAvailable: false, accountInfo: null } })
    );
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkPhoneAvailability('+33612345678'); });
    expect(result.current.phoneValidationStatus).toBe('exists');
    expect(result.current.existingAccount).toMatchObject({ type: 'phone' });
  });
});

// ─── hasExistingAccount ───────────────────────────────────────────────────────

describe('hasExistingAccount', () => {
  it('is false initially', () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    expect(result.current.hasExistingAccount).toBe(false);
  });

  it('is true after email conflict is detected', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { emailAvailable: false, accountInfo: null } }));
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData() })
    );
    await act(async () => { await result.current.checkEmailAvailability('user@example.com'); });
    expect(result.current.hasExistingAccount).toBe(true);
  });
});

// ─── email effect ─────────────────────────────────────────────────────────────

describe('email effect', () => {
  it('sets emailValidationStatus=invalid for malformed email', async () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData({ email: 'notvalid' }) })
    );
    await waitFor(() => expect(result.current.emailValidationStatus).toBe('invalid'));
  });
});

// ─── phone effect ─────────────────────────────────────────────────────────────

describe('phone effect', () => {
  it('sets phoneValidationStatus=invalid for short phone', async () => {
    const { result } = renderHook(() =>
      useRegistrationValidation({ formData: makeFormData({ phoneNumber: '123' }) })
    );
    await waitFor(() => expect(result.current.phoneValidationStatus).toBe('invalid'));
  });
});
