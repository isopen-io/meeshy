/**
 * useRecoverySubmission — anti-flash i18n regression (iter 71wb)
 *
 * Guards the account-recovery flow against the `t('key') || 'French fallback'`
 * anti-pattern (lesson 50w). While the `auth` i18n namespace is still loading
 * async, the real `t()` returns the RAW KEY (truthy) — so an `|| 'French'`
 * fallback never fires and a French string would flash to EN/ES/PT users.
 *
 * The fix uses the 2-arg form `t('key', 'English exact')`: when the namespace
 * is unloaded, `t()` returns the English fallback (not the raw key, not French).
 * This test simulates the unloaded namespace by injecting a `t` that echoes the
 * key, then asserts the surfaced copy is the English fallback.
 */

import { useRecoverySubmission } from '@/hooks/use-recovery-submission';

const mockRequestMagicLink = jest.fn();
jest.mock('@/services/magic-link.service', () => ({
  magicLinkService: {
    requestMagicLink: (...args: unknown[]) => mockRequestMagicLink(...args),
  },
}));

jest.mock('@/services/phone-password-reset.service', () => ({
  phonePasswordResetService: {
    lookupByPhone: jest.fn(),
    verifyIdentity: jest.fn(),
    verifyCode: jest.fn(),
    resendCode: jest.fn(),
  },
}));

const mockToastSuccess = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: jest.fn(),
  },
}));

// Simulates an UNLOADED i18n namespace: real `t()` returns the raw key for a
// missing translation, honouring the 2nd-arg fallback when provided.
const unloadedT = (key: string, fallback?: string) => fallback ?? key;

const makeHook = (overrides: Record<string, unknown> = {}) => {
  const setError = jest.fn();
  const setStep = jest.fn();
  const submission = useRecoverySubmission({
    setIsLoading: jest.fn(),
    setError,
    setStep,
    setStoredEmail: jest.fn(),
    setPhoneResetTokenId: jest.fn(),
    setMaskedUserInfo: jest.fn(),
    setTokenId: jest.fn(),
    setResendCooldown: jest.fn(),
    setOtpCode: jest.fn(),
    resetBotProtection: jest.fn(),
    isSessionExpiredError: () => false,
    handleSessionExpired: jest.fn(),
    t: unloadedT,
    router: { push: jest.fn() },
    onClose: jest.fn(),
    ...overrides,
  });
  return { submission, setError, setStep };
};

describe('useRecoverySubmission — anti-flash i18n (namespace unloaded)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('surfaces the English success copy (never French, never raw key) on magic-link success', async () => {
    mockRequestMagicLink.mockResolvedValueOnce({ success: true });
    const { submission } = makeHook();

    await submission.handleEmailRecovery('user@example.com');

    expect(mockToastSuccess).toHaveBeenCalledWith('Magic Link Sent!');
    expect(mockToastSuccess).not.toHaveBeenCalledWith('magicLink.success.title');
    expect(mockToastSuccess).not.toHaveBeenCalledWith(
      expect.stringContaining('envoyé'),
    );
  });

  it('surfaces the English rate-limit copy (never French, never raw key)', async () => {
    mockRequestMagicLink.mockResolvedValueOnce({
      success: false,
      error: 'RATE_LIMITED',
    });
    const { submission, setError } = makeHook();

    await submission.handleEmailRecovery('user@example.com');

    expect(setError).toHaveBeenCalledWith(
      'Too many attempts. Please try again in about an hour.',
    );
    expect(setError).not.toHaveBeenCalledWith('magicLink.errors.rateLimited');
    expect(setError).not.toHaveBeenCalledWith(
      expect.stringContaining('tentatives'),
    );
  });
});
