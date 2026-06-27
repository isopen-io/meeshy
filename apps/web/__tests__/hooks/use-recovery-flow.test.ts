/**
 * Tests for hooks/use-recovery-flow.ts
 */

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => `t:${key}` }),
}));

const mockSetEmail = jest.fn();
const mockSetPhoneResetTokenId = jest.fn();
const mockSetMaskedUserInfo = jest.fn();

jest.mock('@/stores/password-reset-store', () => ({
  usePasswordResetStore: () => ({
    setEmail: mockSetEmail,
    setPhoneResetTokenId: mockSetPhoneResetTokenId,
    setMaskedUserInfo: mockSetMaskedUserInfo,
  }),
}));

jest.mock('@/services/magic-link.service', () => ({
  magicLinkService: {},
}));

jest.mock('@/services/phone-password-reset.service', () => ({
  phonePasswordResetService: {},
}));

jest.mock('@/hooks/use-bot-protection', () => ({
  useBotProtection: () => ({
    honeypotProps: {},
    validateSubmission: jest.fn(() => true),
    reset: jest.fn(),
  }),
}));

jest.mock('@/constants/countries', () => ({
  COUNTRY_CODES: [{ code: 'FR', dialCode: '+33', name: 'France' }],
}));

import { renderHook, act } from '@testing-library/react';
import { useRecoveryFlow } from '@/hooks/use-recovery-flow';

const BASE_PROPS = {
  isOpen: true,
  email: 'test@example.com',
  phone: '+33612345678',
  existingAccount: null,
  conflictType: null as 'email' | 'phone' | 'both' | null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial step resolution ──────────────────────────────────────────────────

describe('initial step from existingAccount', () => {
  it('starts at email step when existingAccount.type=email', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS, existingAccount: { type: 'email' } })
    );
    expect(result.current.step).toBe('email');
  });

  it('starts at phone step when existingAccount.type=phone', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS, existingAccount: { type: 'phone' } })
    );
    expect(result.current.step).toBe('phone');
  });

  it('starts at choice step when no existingAccount and no conflictType', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS })
    );
    expect(result.current.step).toBe('choice');
  });

  it('starts at choice step when conflictType=both', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS, conflictType: 'both' })
    );
    expect(result.current.step).toBe('choice');
  });

  it('starts at email step when conflictType=email and no existingAccount', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS, conflictType: 'email' })
    );
    expect(result.current.step).toBe('email');
  });
});

// ─── form field defaults ──────────────────────────────────────────────────────

describe('form field defaults', () => {
  it('recoveryEmail defaults to the email prop', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS, email: 'foo@bar.com' })
    );
    expect(result.current.recoveryEmail).toBe('foo@bar.com');
  });

  it('recoveryPhone defaults to the phone prop', () => {
    const { result } = renderHook(() =>
      useRecoveryFlow({ ...BASE_PROPS, phone: '+33612345678' })
    );
    expect(result.current.recoveryPhone).toBe('+33612345678');
  });

  it('isLoading starts as false', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    expect(result.current.isLoading).toBe(false);
  });

  it('error starts as null', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    expect(result.current.error).toBeNull();
  });

  it('otpCode starts empty', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    expect(result.current.otpCode).toBe('');
  });
});

// ─── setters ─────────────────────────────────────────────────────────────────

describe('state setters', () => {
  it('setStep updates step', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => { result.current.setStep('phone'); });
    expect(result.current.step).toBe('phone');
  });

  it('setError updates error', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => { result.current.setError('some error'); });
    expect(result.current.error).toBe('some error');
  });

  it('setOtpCode updates otpCode', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => { result.current.setOtpCode('123456'); });
    expect(result.current.otpCode).toBe('123456');
  });
});

// ─── isOpen=false reset ───────────────────────────────────────────────────────

describe('close reset', () => {
  it('resets to choice step after close delay', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useRecoveryFlow({ ...BASE_PROPS, isOpen }),
      { initialProps: { isOpen: true } }
    );
    act(() => { result.current.setStep('phone'); });
    rerender({ isOpen: false });
    act(() => { jest.advanceTimersByTime(400); });
    expect(result.current.step).toBe('choice');
  });
});

// ─── isSessionExpiredError ────────────────────────────────────────────────────

describe('isSessionExpiredError', () => {
  it('returns true for invalid_token', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    expect(result.current.isSessionExpiredError('invalid_token')).toBe(true);
  });

  it('returns true for token_expired', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    expect(result.current.isSessionExpiredError('token_expired')).toBe(true);
  });

  it('returns false for other errors', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    expect(result.current.isSessionExpiredError('network_error')).toBe(false);
  });
});

// ─── handleSessionExpired ─────────────────────────────────────────────────────

describe('handleSessionExpired', () => {
  it('resets tokenId and step to choice', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => {
      result.current.setStep('phone_code');
      result.current.setTokenId('tok-123');
      result.current.handleSessionExpired();
    });
    expect(result.current.step).toBe('choice');
    expect(result.current.tokenId).toBe('');
  });

  it('shows error toast', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => { result.current.handleSessionExpired(); });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('clears error field', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => {
      result.current.setError('previous error');
      result.current.handleSessionExpired();
    });
    expect(result.current.error).toBeNull();
  });
});

// ─── cooldown timer ───────────────────────────────────────────────────────────

describe('resendCooldown timer', () => {
  it('counts down by 1 each second', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => { result.current.setResendCooldown(3); });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.resendCooldown).toBe(2);
  });

  it('stops at 0', () => {
    const { result } = renderHook(() => useRecoveryFlow({ ...BASE_PROPS }));
    act(() => { result.current.setResendCooldown(1); });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.resendCooldown).toBe(0);
  });
});
