/**
 * Tests for hooks/use-registration-submit.ts
 */

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockLogin = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
  API_ENDPOINTS: {
    AUTH: { REGISTER: '/auth/register' },
  },
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act } from '@testing-library/react';
import { useRegistrationSubmit } from '@/hooks/use-registration-submit';
import type { WizardFormData } from '@/hooks/use-registration-wizard';

const makeFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData => ({
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  password: 'pass123',
  countryCode: 'FR',
  acceptTerms: true,
  ...overrides,
} as WizardFormData);

const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);

const makeSubmitOptions = (overrides: Record<string, unknown> = {}) => ({
  validatePhoneField: jest.fn().mockResolvedValue(true),
  validateSubmission: jest.fn().mockReturnValue({ isHuman: true, botError: '' }),
  confirmPassword: 'pass123',
  acceptTerms: true,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(
    jsonResponse({ success: true, data: { user: { id: 'u1' }, token: 'jwt-1' } })
  );
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isLoading starts false', () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    expect(result.current.isLoading).toBe(false);
  });

  it('showPhoneExistsModal starts false', () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    expect(result.current.showPhoneExistsModal).toBe(false);
  });

  it('phoneOwnerInfo starts null', () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    expect(result.current.phoneOwnerInfo).toBeNull();
  });

  it('pendingRegistration starts null', () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    expect(result.current.pendingRegistration).toBeNull();
  });
});

// ─── handleSubmit — bot protection ────────────────────────────────────────────

describe('handleSubmit — bot protection', () => {
  it('shows error and does not call fetch when bot detected', async () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    const opts = makeSubmitOptions({
      validateSubmission: jest.fn().mockReturnValue({ isHuman: false, botError: 'Bot detected' }),
    });
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', opts);
    });
    expect(mockToastError).toHaveBeenCalledWith('Bot detected');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── handleSubmit — password mismatch ─────────────────────────────────────────

describe('handleSubmit — password mismatch', () => {
  it('shows error when passwords do not match', async () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    const opts = makeSubmitOptions({ confirmPassword: 'different' });
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', opts);
    });
    expect(mockToastError).toHaveBeenCalledWith('Passwords do not match');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── handleSubmit — terms ─────────────────────────────────────────────────────

describe('handleSubmit — terms', () => {
  it('shows error when terms not accepted', async () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    const opts = makeSubmitOptions({ acceptTerms: false });
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', opts);
    });
    expect(mockToastError).toHaveBeenCalledWith('You must accept the terms and conditions');
  });
});

// ─── handleSubmit — phone validation ─────────────────────────────────────────

describe('handleSubmit — phone validation', () => {
  it('skips phone check when no phone number', async () => {
    const opts = makeSubmitOptions();
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', opts);
    });
    expect(opts.validatePhoneField).not.toHaveBeenCalled();
  });

  it('aborts when phone validation fails', async () => {
    const opts = makeSubmitOptions({
      validatePhoneField: jest.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '+33612345678', opts);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── handleSubmit — success ───────────────────────────────────────────────────

describe('handleSubmit — success', () => {
  it('POSTs to the register endpoint', async () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls login with user and token on success', async () => {
    const user = { id: 'u1', username: 'alice' };
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { user, token: 'jwt-1' } })
    );
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(mockLogin).toHaveBeenCalledWith(user, 'jwt-1');
  });

  it('shows success toast on completion', async () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('calls onSuccess callback when provided', async () => {
    const onSuccess = jest.fn();
    const user = { id: 'u1' };
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { user, token: 'jwt-1' } })
    );
    const { result } = renderHook(() => useRegistrationSubmit({ onSuccess }));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(onSuccess).toHaveBeenCalledWith(user, 'jwt-1');
  });

  it('isLoading is true while redirecting after successful submit', async () => {
    // On success the hook intentionally keeps isLoading=true while redirecting
    const onSuccess = jest.fn();
    const user = { id: 'u1' };
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { user, token: 'jwt-1' } })
    );
    const { result } = renderHook(() => useRegistrationSubmit({ onSuccess }));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(onSuccess).toHaveBeenCalled();
  });
});

// ─── handleSubmit — API error ─────────────────────────────────────────────────

describe('handleSubmit — API error', () => {
  it('shows error toast on !response.ok', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: 'email already exists' }, false)
    );
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows error toast on network exception', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '', makeSubmitOptions());
    });
    expect(mockToastError).toHaveBeenCalledWith('Network error occurred');
    expect(result.current.isLoading).toBe(false);
  });
});

// ─── handleSubmit — phone ownership conflict ─────────────────────────────────

describe('handleSubmit — phone ownership conflict', () => {
  it('opens phone modal when phone conflict detected', async () => {
    const phoneOwnerInfo = { maskedUsername: 'a***', maskedDisplayName: 'A***', maskedEmail: 'a***@e.com', phoneNumber: '+33612345678', phoneCountryCode: 'FR' };
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { phoneOwnershipConflict: true, phoneOwnerInfo } })
    );
    const { result } = renderHook(() => useRegistrationSubmit({}));
    await act(async () => {
      await result.current.handleSubmit(makeFormData(), '+33612345678', makeSubmitOptions());
    });
    expect(result.current.showPhoneExistsModal).toBe(true);
    expect(result.current.phoneOwnerInfo).toMatchObject({ maskedUsername: 'a***' });
    expect(result.current.isLoading).toBe(false);
  });
});

// ─── setShowPhoneExistsModal ──────────────────────────────────────────────────

describe('setShowPhoneExistsModal', () => {
  it('allows closing the modal manually', () => {
    const { result } = renderHook(() => useRegistrationSubmit({}));
    act(() => { result.current.setShowPhoneExistsModal(true); });
    expect(result.current.showPhoneExistsModal).toBe(true);
    act(() => { result.current.setShowPhoneExistsModal(false); });
    expect(result.current.showPhoneExistsModal).toBe(false);
  });
});
