/**
 * EmailService Unit Tests - Multi-Provider Architecture with i18n
 *
 * Tests:
 * - Provider initialization with environment variables
 * - Multi-provider fallback mechanism
 * - i18n translations (fr, en, es, pt, it, de)
 * - Email verification sending
 * - Password reset email sending
 * - Password changed notification
 * - Security alert email sending
 * - Error handling and missing configuration warnings
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Store original environment variables
const originalEnv = { ...process.env };

// Shared mock function that persists across module resets
const mockAxiosPost = jest.fn<any>();

// Mock console methods to reduce test noise
let mockConsoleLog: ReturnType<typeof jest.spyOn>;
let mockConsoleError: ReturnType<typeof jest.spyOn>;
let mockConsoleWarn: ReturnType<typeof jest.spyOn>;

// Helper to get fresh module with specific environment
async function getEmailServiceWithEnv(envOverrides: Record<string, string> = {}) {
  // Clear all provider keys and sender config
  delete process.env.BREVO_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  delete process.env.EMAIL_FROM_NAME;
  delete process.env.EMAIL_FROM;

  // Set environment variables
  Object.keys(envOverrides).forEach(key => {
    process.env[key] = envOverrides[key];
  });

  // Reset modules to pick up new env vars
  jest.resetModules();

  // Mock axios AFTER resetModules
  jest.doMock('axios', () => ({
    __esModule: true,
    default: {
      post: mockAxiosPost
    }
  }));

  // Import the fresh module
  const module = await import('../../../services/EmailService');
  return { EmailService: module.EmailService, module };
}

// Helper to create successful axios response
function createSuccessResponse(data: any = {}) {
  return Promise.resolve({
    data,
    status: 200,
    headers: {
      'x-message-id': 'mock-message-id'
    }
  });
}

// Helper to create error axios response (axios throws on non-2xx)
function createErrorResponse(status: number, message: string) {
  const error = new Error(message) as any;
  error.response = { status, data: { message } };
  return Promise.reject(error);
}

describe('EmailService', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset();

    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    mockConsoleLog?.mockRestore();
    mockConsoleError?.mockRestore();
    mockConsoleWarn?.mockRestore();
  });

  // ==============================================
  // PROVIDER INITIALIZATION TESTS
  // ==============================================

  describe('Provider Initialization', () => {
    it('should initialize with Brevo when BREVO_API_KEY is set', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      expect(service.getProviders()).toContain('brevo');
    });

    it('should initialize with SendGrid when SENDGRID_API_KEY is set', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      expect(service.getProviders()).toContain('sendgrid');
    });

    it('should initialize with Mailgun when both keys are set', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'test.mailgun.org'
      });
      const service = new EmailService();

      expect(service.getProviders()).toContain('mailgun');
    });

    it('should initialize multiple providers in cost order', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        SENDGRID_API_KEY: 'test-sendgrid-key',
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'test.mailgun.org'
      });
      const service = new EmailService();
      const providers = service.getProviders();

      // Brevo should be first (cheapest)
      expect(providers[0]).toBe('brevo');
      expect(providers).toHaveLength(3);
    });

    it('should initialize with no providers when none are configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({});
      const service = new EmailService();

      // Vérifier que le service peut être créé même sans providers
      expect(service).toBeDefined();
      // Le service n'affiche plus de message dans le constructeur
    });
  });

  // ==============================================
  // EMAIL VERIFICATION TESTS
  // ==============================================

  describe('sendEmailVerification', () => {
    it('should send verification email via Brevo', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should include verification link in email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify/abc123',
        expiryHours: 24
      });

      // Check that axios was called with the verification link in htmlContent
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('https://example.com/verify/abc123')
        }),
        expect.any(Object)
      );
    });

    it('should use English language by default', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      // English subject (default language is now 'en')
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.subject).toContain('Verify');
    });

    it('should send in English when language is en', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24,
        language: 'en'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.subject).toContain('Verify');
    });
  });

  // ==============================================
  // PASSWORD RESET EMAIL TESTS
  // ==============================================

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email via Brevo', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should include reset link in email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset/xyz789',
        expiryMinutes: 15
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('https://example.com/reset/xyz789')
        }),
        expect.any(Object)
      );
    });

    it('should use SendGrid when Brevo is not configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      const result = await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('sendgrid');
    });
  });

  // ==============================================
  // NOTIFICATION DIGEST (re-engagement teaser) TESTS
  // ==============================================

  describe('sendNotificationDigestEmail', () => {
    const baseDigest = {
      to: 'user@example.com',
      name: 'Alice',
      language: 'fr',
      unreadCount: 4,
      notifications: [
        { type: 'message', actorName: 'Bob Sender', content: 'Secret preview text', createdAt: new Date().toISOString() }
      ],
      magicUrl: 'https://meeshy.me/auth/magic-link/validate?token=RAWTOKEN&returnUrl=%2Fconversations%2Fabc',
      settingsUrl: 'https://meeshy.me/settings#notifications'
    };

    it('should send the digest and succeed', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'm' }));

      const result = await service.sendNotificationDigestEmail(baseDigest);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('brevo');
    });

    it('should use the magic login URL as the CTA href', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      await service.sendNotificationDigestEmail(baseDigest);

      const payload = mockAxiosPost.mock.calls[0][1] as any;
      expect(payload.htmlContent).toContain(`href="${baseDigest.magicUrl}"`);
    });

    it('should NOT leak the legacy unauthenticated /notifications?markAllRead link', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      await service.sendNotificationDigestEmail(baseDigest);

      const payload = mockAxiosPost.mock.calls[0][1] as any;
      expect(payload.htmlContent).not.toContain('markAllRead');
    });

    it('should NOT reveal actor names or message content (teaser = counts only)', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      await service.sendNotificationDigestEmail(baseDigest);

      const payload = mockAxiosPost.mock.calls[0][1] as any;
      expect(payload.htmlContent).not.toContain('Bob Sender');
      expect(payload.htmlContent).not.toContain('Secret preview text');
      expect(payload.textContent).not.toContain('Bob Sender');
      expect(payload.textContent).not.toContain('Secret preview text');
    });

    it('should still show the unread count', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      await service.sendNotificationDigestEmail(baseDigest);

      const payload = mockAxiosPost.mock.calls[0][1] as any;
      expect(payload.htmlContent).toContain('4');
    });

    it('should localize the subject (fr)', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      await service.sendNotificationDigestEmail(baseDigest);

      const payload = mockAxiosPost.mock.calls[0][1] as any;
      expect(payload.subject).toBeTruthy();
      expect(payload.subject.toLowerCase()).toContain('meeshy');
    });

    it('should escape HTML in the user name', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'k' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      await service.sendNotificationDigestEmail({ ...baseDigest, name: '<script>x</script>' });

      const payload = mockAxiosPost.mock.calls[0][1] as any;
      expect(payload.htmlContent).not.toContain('<script>x</script>');
      expect(payload.htmlContent).toContain('&lt;script&gt;');
    });
  });

  // ==============================================
  // PROVIDER FALLBACK TESTS
  // ==============================================

  describe('Provider Fallback', () => {
    it('should fallback to SendGrid when Brevo fails', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      mockAxiosPost
        .mockReturnValueOnce(createErrorResponse(401, 'Invalid API key'))
        .mockReturnValueOnce(createSuccessResponse({}));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      // Verify brevo was tried first, then sendgrid succeeded
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
      expect(result.provider).toBe('sendgrid');
    });
  });

  // ==============================================
  // I18N TESTS
  // ==============================================

  describe('i18n Translations', () => {
    it('should send email in English by default', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'John',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15
      });

      // English content (default language is now 'en')
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hello');
    });

    it('should send email in English when specified', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'John',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'en'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hello');
    });

    it('should send email in Spanish when specified', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Carlos',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'es'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hola');
    });

    it('should send email in Portuguese when specified', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'João',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'pt'
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Olá');
    });

    it('should fallback to English for unsupported language', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordResetEmail({
        to: 'user@example.com',
        name: 'Test User',
        resetLink: 'https://example.com/reset',
        expiryMinutes: 15,
        language: 'ja' // Japanese not supported
      });

      // Should use English as fallback (default language is now 'en')
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Hello');
    });
  });

  // ==============================================
  // PASSWORD CHANGED TESTS
  // ==============================================

  describe('sendPasswordChangedEmail', () => {
    it('should send password changed notification', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-07 12:00:00',
        ipAddress: '192.168.1.100',
        location: 'Paris, France'
      });

      expect(result.success).toBe(true);
    });

    it('should include IP address in notification', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendPasswordChangedEmail({
        to: 'user@example.com',
        name: 'Test User',
        timestamp: '2025-01-07 12:00:00',
        ipAddress: '10.0.0.1',
        location: 'New York, USA'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('10.0.0.1')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // SECURITY ALERT TESTS
  // ==============================================

  describe('sendSecurityAlertEmail', () => {
    it('should send security alert email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      const result = await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Suspicious Login',
        details: 'Login from unknown device'
      });

      expect(result.success).toBe(true);
    });

    it('should include alert details in email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'Test User',
        alertType: 'Multiple Failed Logins',
        details: '5 failed attempts from IP 192.168.1.1'
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          htmlContent: expect.stringContaining('5 failed attempts from IP 192.168.1.1')
        }),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // NOTIFICATION-TYPE LABELLING (regression: a social notification must
  // never be mislabelled as a "Nouvelle connexion" security alert)
  // ==============================================

  describe('sendSecurityAlertEmail — alert type labelling', () => {
    const sendAlert = async (alertType: string, details: string) => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'test-brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));
      await service.sendSecurityAlertEmail({
        to: 'user@example.com',
        name: 'jcnm',
        language: 'fr',
        alertType,
        details,
      });
      return mockAxiosPost.mock.calls[0][1] as { subject: string; htmlContent: string };
    };

    it('labels a mention notification as a mention, not a login', async () => {
      const payload = await sendAlert('user_mentioned', '@jcnm maintenant tu as égalisé');
      expect(payload.subject).not.toContain('Nouvelle connexion');
      expect(payload.subject.toLowerCase()).toContain('mention');
      expect(payload.htmlContent).toContain('@jcnm maintenant tu as égalisé');
      expect(payload.htmlContent).not.toContain('Nouvelle connexion');
    });

    it('labels a missed-call notification as a call, not a login', async () => {
      const payload = await sendAlert('missed_call', 'Appel manqué de Alice');
      expect(payload.subject).not.toContain('Nouvelle connexion');
      expect(payload.subject.toLowerCase()).toContain('appel');
    });

    it('still labels a genuine new-device login as such', async () => {
      const payload = await sendAlert('login_new_device', 'iPhone, Paris');
      expect(payload.subject).toContain('Nouvelle connexion');
    });

    it('falls back to a neutral notification label for unknown types (never a login)', async () => {
      const payload = await sendAlert('some_future_type', 'whatever');
      expect(payload.subject).not.toContain('Nouvelle connexion');
    });
  });

  // ==============================================
  // sendNotificationEmail — social/general notifications (Debt A)
  // ==============================================

  describe('sendNotificationEmail', () => {
    const sendNotif = async (notificationType: string, language: string, details: string) => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'test-brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));
      await service.sendNotificationEmail({
        to: 'user@example.com',
        name: 'jcnm',
        language,
        notificationType,
        details,
      });
      return mockAxiosPost.mock.calls[0][1] as { subject: string; htmlContent: string };
    };

    it('renders a mention as a neutral notification (info box, no security framing)', async () => {
      const payload = await sendNotif('user_mentioned', 'fr', '@jcnm bravo');
      expect(payload.subject).toBe('Nouvelle mention - Meeshy');
      expect(payload.htmlContent).toContain('@jcnm bravo');
      // Neutral indigo info box, never the red warning styling.
      expect(payload.htmlContent).toContain('class="info"');
      expect(payload.htmlContent).not.toContain('class="warning"');
    });

    it('never applies the alarming security styling, even for a security alertType', async () => {
      // sendNotificationEmail forces info styling regardless of the type.
      const payload = await sendNotif('suspicious_activity', 'fr', 'x');
      expect(payload.htmlContent).toContain('class="info"');
      expect(payload.htmlContent).not.toContain('class="warning"');
    });
  });

  // ==============================================
  // i18n alert/notification labels — all 6 languages (Debt B)
  // ==============================================

  describe('label i18n — es/pt/it/de are localized, not French-fallback', () => {
    const subjectFor = async (method: 'security' | 'notification', type: string, language: string) => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'test-brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));
      if (method === 'security') {
        await service.sendSecurityAlertEmail({ to: 'u@e.com', name: 'n', language, alertType: type, details: 'd' });
      } else {
        await service.sendNotificationEmail({ to: 'u@e.com', name: 'n', language, notificationType: type, details: 'd' });
      }
      const calls = mockAxiosPost.mock.calls;
      return (calls[calls.length - 1][1] as { subject: string }).subject;
    };

    it('localizes a new-login security alert in es/pt/it/de', async () => {
      expect(await subjectFor('security', 'login_new_device', 'es')).toContain('Nuevo inicio de sesión');
      expect(await subjectFor('security', 'login_new_device', 'pt')).toContain('Novo início de sessão');
      expect(await subjectFor('security', 'login_new_device', 'it')).toContain('Nuovo accesso');
      expect(await subjectFor('security', 'login_new_device', 'de')).toContain('Neue Anmeldung');
    });

    it('localizes a mention notification in es/de (not French-fallback)', async () => {
      const es = await subjectFor('notification', 'user_mentioned', 'es');
      expect(es).toContain('Nueva mención');
      expect(es).not.toContain('Nouvelle');

      const de = await subjectFor('notification', 'user_mentioned', 'de');
      expect(de).toContain('Neue Erwähnung');
      expect(de).not.toContain('Nouvelle');
    });
  });

  // ==============================================
  // SENDGRID PROVIDER TESTS
  // ==============================================

  describe('SendGrid Provider', () => {
    it('should send email via SendGrid', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        SENDGRID_API_KEY: 'test-sendgrid-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({}));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('sendgrid');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  // ==============================================
  // MAILGUN PROVIDER TESTS
  // ==============================================

  describe('Mailgun Provider', () => {
    it('should send email via Mailgun', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'mail.example.com'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ id: 'mailgun-123' }));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mailgun');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('mail.example.com'),
        expect.anything(), // URLSearchParams
        expect.any(Object)
      );
    });

    it('should fail to send via Mailgun without domain', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        MAILGUN_API_KEY: 'test-mailgun-key'
        // Missing MAILGUN_DOMAIN
      });
      const service = new EmailService();

      // Mailgun is added to providers (only API key is checked for initialization)
      expect(service.getProviders()).toContain('mailgun');

      // But sending should fail because domain is not configured
      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MAILGUN_DOMAIN not configured');
    });
  });

  // ==============================================
  // ERROR HANDLING TESTS
  // ==============================================

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createErrorResponse(401, 'Unauthorized'));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('All providers failed');
    });

    it('should handle API errors with status codes', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createErrorResponse(500, 'Server error'));

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
    });

    it('should return error when no providers configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({});
      const service = new EmailService();

      const result = await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No email providers configured');
    });
  });

  // ==============================================
  // CONFIGURATION TESTS
  // ==============================================

  describe('Configuration', () => {
    it('should use custom sender name when configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key',
        EMAIL_FROM_NAME: 'Custom Sender'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.sender.name).toBe('Custom Sender');
    });

    it('should use default sender when not configured', async () => {
      const { EmailService } = await getEmailServiceWithEnv({
        BREVO_API_KEY: 'test-brevo-key'
      });
      const service = new EmailService();

      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'msg-123' }));

      await service.sendEmailVerification({
        to: 'user@example.com',
        name: 'Test User',
        verificationLink: 'https://example.com/verify',
        expiryHours: 24
      });

      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.sender.name).toBe('Meeshy');
    });
  });

  // ==============================================
  // INTERFACE EXPORT TESTS
  // ==============================================

  describe('Interface Exports', () => {
    it('should export EmailResult interface', async () => {
      const { module } = await getEmailServiceWithEnv();

      // Verify the module exports exist
      expect(module.EmailService).toBeDefined();
    });
  });

  // ==============================================
  // sendLoginAlertEmail
  // ==============================================

  describe('sendLoginAlertEmail', () => {
    const baseData = {
      to: 'user@example.com',
      name: 'Alice',
      language: 'en',
      deviceName: 'iPhone 15',
      deviceOS: 'iOS 17',
      appOrBrowser: 'Meeshy iOS',
      location: 'Paris, France',
      ip: '1.2.3.4',
      loginTime: new Date('2024-01-15T10:30:00Z'),
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
      previousDeviceName: 'MacBook Pro',
      previousLocation: 'Lyon, France',
      previousLoginTime: new Date('2024-01-10T09:00:00Z'),
      revokeAllUrl: 'https://meeshy.me/revoke-all',
    };

    it('sends login alert with all fields populated (with map + previous login)', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'la-001' }));

      const result = await service.sendLoginAlertEmail(baseData);

      expect(result.success).toBe(true);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('sends login alert without map when latitude/longitude are null', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'la-002' }));

      const result = await service.sendLoginAlertEmail({
        ...baseData,
        latitude: null,
        longitude: null,
      });

      expect(result.success).toBe(true);
    });

    it('sends login alert without previous login section when previousLoginTime is null', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'la-003' }));

      const result = await service.sendLoginAlertEmail({
        ...baseData,
        previousLoginTime: null,
        previousDeviceName: null,
        previousLocation: null,
      });

      expect(result.success).toBe(true);
    });

    it('sends login alert in French (fr language)', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'la-fr' }));

      const result = await service.sendLoginAlertEmail({ ...baseData, language: 'fr' });

      expect(result.success).toBe(true);
    });

    it('sends login alert when all nullable device fields are null', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'la-004' }));

      const result = await service.sendLoginAlertEmail({
        ...baseData,
        deviceName: null,
        deviceOS: null,
        appOrBrowser: null,
        location: null,
        ip: null,
        timezone: null,
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendBroadcastEmail
  // ==============================================

  describe('sendBroadcastEmail', () => {
    it('sends broadcast email with multi-paragraph body', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'bc-001' }));

      const result = await service.sendBroadcastEmail({
        to: 'user@example.com',
        recipientName: 'Bob',
        subject: 'Important Update',
        body: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        language: 'en',
        unsubscribeUrl: 'https://meeshy.me/unsubscribe',
      });

      expect(result.success).toBe(true);
      const callArgs = mockAxiosPost.mock.calls[0];
      const body = callArgs[1] as any;
      expect(body.htmlContent).toContain('Important Update');
    });

    it('sends broadcast email in French', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'bc-fr' }));

      const result = await service.sendBroadcastEmail({
        to: 'user@example.com',
        recipientName: 'Marie',
        subject: 'Mise à jour importante',
        body: 'Corps du message.',
        language: 'fr',
        unsubscribeUrl: 'https://meeshy.me/unsubscribe',
      });

      expect(result.success).toBe(true);
    });

    it('escapes HTML in subject and recipientName to prevent XSS', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'bc-xss' }));

      const result = await service.sendBroadcastEmail({
        to: 'user@example.com',
        recipientName: '<script>alert(1)</script>',
        subject: '<b>bold</b>',
        body: 'Body text.',
        language: 'en',
        unsubscribeUrl: 'https://meeshy.me/unsubscribe',
      });

      expect(result.success).toBe(true);
      const html = (mockAxiosPost.mock.calls[0][1] as any).htmlContent as string;
      expect(html).not.toContain('<script>');
    });
  });

  // ==============================================
  // sendEmailChangeVerification
  // ==============================================

  describe('sendEmailChangeVerification', () => {
    it('sends email change verification link', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'ecv-001' }));

      const result = await service.sendEmailChangeVerification({
        to: 'user@example.com',
        name: 'Alice',
        verificationLink: 'https://meeshy.me/verify-email?token=abc',
        expiryHours: 48,
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends email change verification in French', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'ecv-fr' }));

      const result = await service.sendEmailChangeVerification({
        to: 'user@example.com',
        name: 'Marie',
        verificationLink: 'https://meeshy.me/verify-email?token=abc',
        expiryHours: 24,
        language: 'fr',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendFriendRequestEmail
  // ==============================================

  describe('sendFriendRequestEmail', () => {
    it('sends friend request email without avatar', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'fr-001' }));

      const result = await service.sendFriendRequestEmail({
        to: 'bob@example.com',
        recipientName: 'Bob',
        senderName: 'Alice',
        viewRequestUrl: 'https://meeshy.me/contacts',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends friend request email with avatar', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'fr-002' }));

      const result = await service.sendFriendRequestEmail({
        to: 'bob@example.com',
        recipientName: 'Bob',
        senderName: 'Alice',
        senderAvatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
        viewRequestUrl: 'https://meeshy.me/contacts',
        language: 'fr',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendFriendAcceptedEmail
  // ==============================================

  describe('sendFriendAcceptedEmail', () => {
    it('sends friend accepted email without avatar', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'fa-001' }));

      const result = await service.sendFriendAcceptedEmail({
        to: 'alice@example.com',
        recipientName: 'Alice',
        accepterName: 'Bob',
        conversationUrl: 'https://meeshy.me/conversations/123',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends friend accepted email with avatar', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'fa-002' }));

      const result = await service.sendFriendAcceptedEmail({
        to: 'alice@example.com',
        recipientName: 'Alice',
        accepterName: 'Bob',
        accepterAvatar: 'https://cdn.meeshy.me/avatars/bob.jpg',
        conversationUrl: 'https://meeshy.me/conversations/123',
        language: 'de',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendInvitationEmail
  // ==============================================

  describe('sendInvitationEmail', () => {
    it('sends invitation email without avatar', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'inv-001' }));

      const result = await service.sendInvitationEmail({
        to: 'new@example.com',
        senderName: 'Alice',
        downloadUrl: 'https://apps.apple.com/meeshy',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends invitation email with avatar', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'inv-002' }));

      const result = await service.sendInvitationEmail({
        to: 'new@example.com',
        senderName: 'Alice',
        senderAvatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
        downloadUrl: 'https://apps.apple.com/meeshy',
        language: 'fr',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendMagicLinkEmail
  // ==============================================

  describe('sendMagicLinkEmail', () => {
    it('sends magic link email in English', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'ml-001' }));

      const result = await service.sendMagicLinkEmail({
        to: 'user@example.com',
        name: 'Alice',
        magicLink: 'https://meeshy.me/auth?token=magic123',
        location: 'Paris, France',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends magic link email in Spanish', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'ml-es' }));

      const result = await service.sendMagicLinkEmail({
        to: 'user@example.com',
        name: 'Carlos',
        magicLink: 'https://meeshy.me/auth?token=magic456',
        location: 'Madrid, Spain',
        language: 'es',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendAccountDeletionConfirmEmail
  // ==============================================

  describe('sendAccountDeletionConfirmEmail', () => {
    it('sends account deletion confirm email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'del-001' }));

      const result = await service.sendAccountDeletionConfirmEmail({
        to: 'user@example.com',
        name: 'Alice',
        confirmLink: 'https://meeshy.me/delete-confirm?token=abc',
        cancelLink: 'https://meeshy.me/delete-cancel?token=abc',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends account deletion confirm email in German', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'del-de' }));

      const result = await service.sendAccountDeletionConfirmEmail({
        to: 'user@example.com',
        name: 'Hans',
        confirmLink: 'https://meeshy.me/delete-confirm?token=abc',
        cancelLink: 'https://meeshy.me/delete-cancel?token=abc',
        language: 'de',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // sendAccountDeletionReminderEmail
  // ==============================================

  describe('sendAccountDeletionReminderEmail', () => {
    it('sends account deletion reminder email', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'rem-001' }));

      const result = await service.sendAccountDeletionReminderEmail({
        to: 'user@example.com',
        name: 'Alice',
        deleteNowLink: 'https://meeshy.me/delete-now',
        cancelLink: 'https://meeshy.me/cancel-delete',
        gracePeriodEndDate: '2024-04-15',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    it('sends account deletion reminder in French', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      mockAxiosPost.mockReturnValueOnce(createSuccessResponse({ messageId: 'rem-fr' }));

      const result = await service.sendAccountDeletionReminderEmail({
        to: 'user@example.com',
        name: 'Marie',
        deleteNowLink: 'https://meeshy.me/delete-now',
        cancelLink: 'https://meeshy.me/cancel-delete',
        gracePeriodEndDate: '2024-04-15',
        language: 'fr',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // default provider branch (line 848)
  // ==============================================

  describe('sendEmail — default: continue (unknown provider name)', () => {
    it('skips unknown providers and falls through to failure when no other provider succeeds', async () => {
      const { EmailService } = await getEmailServiceWithEnv({ BREVO_API_KEY: 'brevo-key' });
      const service = new EmailService();
      // Inject an unknown provider at the front so it hits the default branch
      (service as any).providers.unshift({ name: 'unknown-provider', apiKey: 'key', enabled: true, priority: 0 });
      // Brevo (second provider) also fails
      mockAxiosPost.mockReturnValueOnce(createErrorResponse(500, 'brevo down'));

      const result = await service.sendEmailVerification({
        to: 'u@e.com', name: 'Test', verificationLink: 'https://e.com/verify', expiryHours: 24,
      });

      // unknown provider is skipped via continue; brevo fails → all providers failed
      expect(result.success).toBe(false);
    });
  });
});
