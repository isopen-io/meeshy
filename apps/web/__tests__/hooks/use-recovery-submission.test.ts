/**
 * Tests for hooks/use-recovery-submission.ts
 */

const mockRequestMagicLink = jest.fn();
jest.mock('@/services/magic-link.service', () => ({
  magicLinkService: {
    requestMagicLink: (...args: unknown[]) => mockRequestMagicLink(...args),
  },
}));

const mockLookupByPhone = jest.fn();
const mockVerifyIdentity = jest.fn();
const mockVerifyCode = jest.fn();
const mockResendCode = jest.fn();
jest.mock('@/services/phone-password-reset.service', () => ({
  phonePasswordResetService: {
    lookupByPhone: (...args: unknown[]) => mockLookupByPhone(...args),
    verifyIdentity: (...args: unknown[]) => mockVerifyIdentity(...args),
    verifyCode: (...args: unknown[]) => mockVerifyCode(...args),
    resendCode: (...args: unknown[]) => mockResendCode(...args),
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

import { renderHook, act } from '@testing-library/react';
import { useRecoverySubmission } from '@/hooks/use-recovery-submission';

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  setIsLoading: jest.fn(),
  setError: jest.fn(),
  setStep: jest.fn(),
  setStoredEmail: jest.fn(),
  setPhoneResetTokenId: jest.fn(),
  setMaskedUserInfo: jest.fn(),
  setTokenId: jest.fn(),
  setResendCooldown: jest.fn(),
  setOtpCode: jest.fn(),
  resetBotProtection: jest.fn(),
  isSessionExpiredError: jest.fn(() => false),
  handleSessionExpired: jest.fn(),
  t: (key: string) => `t:${key}`,
  router: { push: jest.fn() },
  onClose: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── handleEmailRecovery ──────────────────────────────────────────────────────

describe('handleEmailRecovery', () => {
  it('calls magicLinkService.requestMagicLink with trimmed email', async () => {
    mockRequestMagicLink.mockResolvedValue({ success: true });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleEmailRecovery('  user@example.com  '); });
    expect(mockRequestMagicLink).toHaveBeenCalledWith('user@example.com', true);
  });

  it('sets loading true then false', async () => {
    mockRequestMagicLink.mockResolvedValue({ success: true });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleEmailRecovery('user@example.com'); });
    expect(props.setIsLoading).toHaveBeenCalledWith(true);
    expect(props.setIsLoading).toHaveBeenCalledWith(false);
  });

  it('on success: sets email, resets bot protection, shows toast, sets step=success', async () => {
    mockRequestMagicLink.mockResolvedValue({ success: true });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleEmailRecovery('user@example.com'); });
    expect(props.setStoredEmail).toHaveBeenCalledWith('user@example.com');
    expect(props.resetBotProtection).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(props.setStep).toHaveBeenCalledWith('success');
  });

  it('on RATE_LIMITED error: sets rate limited error message', async () => {
    mockRequestMagicLink.mockResolvedValue({ success: false, error: 'RATE_LIMITED' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleEmailRecovery('user@example.com'); });
    expect(props.setError).toHaveBeenCalledWith(expect.stringContaining('t:magicLink.errors.rateLimited'));
  });

  it('on other error: sets the error from result', async () => {
    mockRequestMagicLink.mockResolvedValue({ success: false, error: 'SOME_ERROR' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleEmailRecovery('user@example.com'); });
    expect(props.setError).toHaveBeenCalledWith('SOME_ERROR');
  });

  it('on network exception: sets error from exception message', async () => {
    mockRequestMagicLink.mockRejectedValue(new Error('network failure'));
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleEmailRecovery('user@example.com'); });
    expect(props.setError).toHaveBeenCalledWith('network failure');
  });
});

// ─── handlePhoneLookup ───────────────────────────────────────────────────────

describe('handlePhoneLookup', () => {
  const selectedCountry = { dial: '+33' };

  it('calls lookupByPhone with full international phone', async () => {
    mockLookupByPhone.mockResolvedValue({ success: true, tokenId: 'tk1', maskedUserInfo: {} });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handlePhoneLookup('612345678', 'FR', selectedCountry); });
    expect(mockLookupByPhone).toHaveBeenCalledWith({ phoneNumber: '+33612345678', countryCode: 'FR' });
  });

  it('on success: sets tokenId, maskedUserInfo, step=phone_identity', async () => {
    const maskedUserInfo = { username: 'u***' };
    mockLookupByPhone.mockResolvedValue({ success: true, tokenId: 'tk1', maskedUserInfo });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handlePhoneLookup('612345678', 'FR', selectedCountry); });
    expect(props.setTokenId).toHaveBeenCalledWith('tk1');
    expect(props.setPhoneResetTokenId).toHaveBeenCalledWith('tk1');
    expect(props.setMaskedUserInfo).toHaveBeenCalledWith(maskedUserInfo);
    expect(props.setStep).toHaveBeenCalledWith('phone_identity');
  });

  it('on failure: sets error', async () => {
    mockLookupByPhone.mockResolvedValue({ success: false, error: 'NOT_FOUND' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handlePhoneLookup('612345678', 'FR', selectedCountry); });
    expect(props.setError).toHaveBeenCalledWith('NOT_FOUND');
  });
});

// ─── handleVerifyIdentity ────────────────────────────────────────────────────

describe('handleVerifyIdentity', () => {
  it('on success: sets step=phone_code and starts cooldown', async () => {
    mockVerifyIdentity.mockResolvedValue({ success: true, codeSent: true });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleVerifyIdentity('tk1', 'alice', 'a@b.com'); });
    expect(props.setStep).toHaveBeenCalledWith('phone_code');
    expect(props.setResendCooldown).toHaveBeenCalledWith(60);
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('on session expired error: calls handleSessionExpired', async () => {
    const isSessionExpiredError = jest.fn(() => true);
    mockVerifyIdentity.mockResolvedValue({ success: false, error: 'SESSION_EXPIRED' });
    const props = makeProps({ isSessionExpiredError });
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleVerifyIdentity('tk1', 'alice', 'a@b.com'); });
    expect(props.handleSessionExpired).toHaveBeenCalled();
    expect(props.setStep).not.toHaveBeenCalled();
  });

  it('on other failure: sets error', async () => {
    mockVerifyIdentity.mockResolvedValue({ success: false, error: 'IDENTITY_MISMATCH' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleVerifyIdentity('tk1', 'alice', 'a@b.com'); });
    expect(props.setError).toHaveBeenCalledWith('IDENTITY_MISMATCH');
  });
});

// ─── handleVerifyCode ────────────────────────────────────────────────────────

describe('handleVerifyCode', () => {
  it('on success: shows toast, navigates, closes', async () => {
    mockVerifyCode.mockResolvedValue({ success: true, resetToken: 'rt1' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleVerifyCode('tk1', '123456'); });
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(props.router.push).toHaveBeenCalledWith('/reset-password?token=rt1');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('on session expired: calls handleSessionExpired', async () => {
    const isSessionExpiredError = jest.fn(() => true);
    mockVerifyCode.mockResolvedValue({ success: false, error: 'SESSION_EXPIRED' });
    const props = makeProps({ isSessionExpiredError });
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleVerifyCode('tk1', '000000'); });
    expect(props.handleSessionExpired).toHaveBeenCalled();
    expect(props.router.push).not.toHaveBeenCalled();
  });

  it('on failure: sets error and clears OTP', async () => {
    mockVerifyCode.mockResolvedValue({ success: false, error: 'BAD_CODE' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleVerifyCode('tk1', '000000'); });
    expect(props.setError).toHaveBeenCalledWith('BAD_CODE');
    expect(props.setOtpCode).toHaveBeenCalledWith('');
  });
});

// ─── handleResendCode ────────────────────────────────────────────────────────

describe('handleResendCode', () => {
  it('does nothing when cooldown > 0', async () => {
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleResendCode('tk1', 30); });
    expect(mockResendCode).not.toHaveBeenCalled();
  });

  it('on success: resets cooldown, clears OTP, shows toast', async () => {
    mockResendCode.mockResolvedValue({ success: true });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleResendCode('tk1', 0); });
    expect(props.setResendCooldown).toHaveBeenCalledWith(60);
    expect(props.setOtpCode).toHaveBeenCalledWith('');
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('on failure: shows error toast', async () => {
    mockResendCode.mockResolvedValue({ success: false, error: 'RESEND_FAILED' });
    const props = makeProps();
    const { result } = renderHook(() => useRecoverySubmission(props));
    await act(async () => { await result.current.handleResendCode('tk1', 0); });
    expect(mockToastError).toHaveBeenCalled();
  });
});
