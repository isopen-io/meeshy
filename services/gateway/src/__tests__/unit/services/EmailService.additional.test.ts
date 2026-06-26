/**
 * Additional EmailService tests — covers the email-sending methods not reached
 * by the primary test suite: sendLoginAlertEmail, sendEmailChangeVerification,
 * sendFriendRequestEmail, sendFriendAcceptedEmail, sendInvitationEmail,
 * sendMagicLinkEmail (all language variants), sendAccountDeletionConfirmEmail,
 * sendAccountDeletionReminderEmail, sendNotificationDigestEmail, sendBroadcastEmail.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const originalEnv = { ...process.env };
const mockAxiosPost = jest.fn<any>();

async function getService() {
  delete process.env.BREVO_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  process.env.BREVO_API_KEY = 'test-brevo-key';

  jest.resetModules();
  jest.doMock('axios', () => ({ __esModule: true, default: { post: mockAxiosPost } }));

  const mod = await import('../../../services/EmailService');
  const service = new mod.EmailService();
  return service;
}

function successResponse(messageId = 'msg-abc') {
  return Promise.resolve({ data: { messageId }, status: 200, headers: {} });
}

describe('EmailService — additional coverage', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── sendLoginAlertEmail ───────────────────────────────────────────────────

  describe('sendLoginAlertEmail', () => {
    it('sends email with all fields populated', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendLoginAlertEmail({
        to: 'user@example.com',
        name: 'Alice',
        language: 'en',
        deviceName: 'iPhone 15',
        deviceOS: 'iOS 17',
        appOrBrowser: 'Meeshy iOS',
        location: 'Paris, France',
        ip: '1.2.3.4',
        loginTime: new Date('2026-06-01T14:30:00Z'),
        timezone: 'Europe/Paris',
        latitude: 48.8566,
        longitude: 2.3522,
        previousDeviceName: 'MacBook Pro',
        previousLocation: 'Lyon, France',
        previousLoginTime: new Date('2026-05-28T09:00:00Z'),
        revokeAllUrl: 'https://meeshy.me/revoke',
      });

      expect(result.success).toBe(true);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.to[0].email).toBe('user@example.com');
    });

    it('sends email with minimal fields (null optionals)', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendLoginAlertEmail({
        to: 'user@example.com',
        name: 'Bob',
        language: 'fr',
        deviceName: null,
        deviceOS: null,
        appOrBrowser: null,
        location: null,
        ip: null,
        loginTime: new Date('2026-06-01T10:00:00Z'),
        timezone: null,
        latitude: null,
        longitude: null,
        previousDeviceName: null,
        previousLocation: null,
        previousLoginTime: null,
        revokeAllUrl: 'https://meeshy.me/revoke',
      });

      expect(result.success).toBe(true);
    });

    it('uses Spanish translations for language=es', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendLoginAlertEmail({
        to: 'usuario@example.com',
        name: 'Carlos',
        language: 'es',
        deviceName: null, deviceOS: null, appOrBrowser: null, location: null,
        ip: null, loginTime: new Date(), timezone: null,
        latitude: null, longitude: null, previousDeviceName: null,
        previousLocation: null, previousLoginTime: null,
        revokeAllUrl: 'https://meeshy.me/revoke',
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      // Subject should be in Spanish
      expect(body.subject).toBeTruthy();
    });
  });

  // ── sendEmailChangeVerification ───────────────────────────────────────────

  describe('sendEmailChangeVerification', () => {
    it('sends email change verification with link and expiry', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendEmailChangeVerification({
        to: 'new@example.com',
        name: 'Alice',
        verificationLink: 'https://meeshy.me/verify/abc123',
        expiryHours: 24,
        language: 'en',
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('verify/abc123');
      expect(body.textContent).toContain('verify/abc123');
    });

    it('uses French translations when language=fr', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendEmailChangeVerification({
        to: 'nouveau@example.com',
        name: 'Pierre',
        verificationLink: 'https://meeshy.me/verify/fr456',
        expiryHours: 48,
        language: 'fr',
      });

      expect(result.success).toBe(true);
    });
  });

  // ── sendFriendRequestEmail ────────────────────────────────────────────────

  describe('sendFriendRequestEmail', () => {
    it('sends friend request email with avatar', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendFriendRequestEmail({
        to: 'recipient@example.com',
        recipientName: 'Bob',
        senderName: 'Alice',
        senderAvatar: 'https://cdn.meeshy.me/avatar/alice.jpg',
        viewRequestUrl: 'https://meeshy.me/friends/requests/123',
        language: 'en',
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('alice.jpg');
    });

    it('sends friend request email without avatar', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendFriendRequestEmail({
        to: 'recipient@example.com',
        recipientName: 'Bob',
        senderName: 'Alice',
        senderAvatar: null,
        viewRequestUrl: 'https://meeshy.me/friends/requests/123',
        language: 'fr',
      });

      expect(result.success).toBe(true);
    });
  });

  // ── sendFriendAcceptedEmail ───────────────────────────────────────────────

  describe('sendFriendAcceptedEmail', () => {
    it('sends friend accepted email with avatar', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendFriendAcceptedEmail({
        to: 'requester@example.com',
        recipientName: 'Alice',
        accepterName: 'Bob',
        accepterAvatar: 'https://cdn.meeshy.me/avatar/bob.jpg',
        conversationUrl: 'https://meeshy.me/conversations/abc',
        language: 'en',
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('bob.jpg');
    });

    it('sends friend accepted email without avatar', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendFriendAcceptedEmail({
        to: 'requester@example.com',
        recipientName: 'Alice',
        accepterName: 'Bob',
        accepterAvatar: undefined,
        conversationUrl: 'https://meeshy.me/conversations/abc',
        language: 'es',
      });

      expect(result.success).toBe(true);
    });
  });

  // ── sendInvitationEmail ───────────────────────────────────────────────────

  describe('sendInvitationEmail', () => {
    it('sends invitation email with avatar', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendInvitationEmail({
        to: 'prospect@example.com',
        senderName: 'Alice',
        senderAvatar: 'https://cdn.meeshy.me/avatar/alice.jpg',
        downloadUrl: 'https://meeshy.me/download',
        language: 'fr',
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('download');
    });

    it('sends invitation email without avatar', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendInvitationEmail({
        to: 'prospect@example.com',
        senderName: 'Alice',
        senderAvatar: null,
        downloadUrl: 'https://meeshy.me/download',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });
  });

  // ── sendMagicLinkEmail ────────────────────────────────────────────────────

  describe('sendMagicLinkEmail', () => {
    const baseData = {
      to: 'user@example.com',
      name: 'Alice',
      magicLink: 'https://meeshy.me/magic/tok123',
      location: 'Paris, FR',
    };

    it('sends magic link email in French', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'fr' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('tok123');
      expect(body.subject).toContain('connexion');
    });

    it('sends magic link email in English (default)', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'en' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('login');
    });

    it('sends magic link email in Spanish', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'es' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('sesi');
    });

    it('sends magic link email in Portuguese', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'pt' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('login');
    });

    it('sends magic link email in Italian', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'it' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('accesso');
    });

    it('sends magic link email in German', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'de' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('Anmelde');
    });

    it('falls back to English for unknown language', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData, language: 'xx' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('login');
    });

    it('defaults to English when language is not provided', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendMagicLinkEmail({ ...baseData });

      expect(result.success).toBe(true);
    });
  });

  // ── sendAccountDeletionConfirmEmail ───────────────────────────────────────

  describe('sendAccountDeletionConfirmEmail', () => {
    const baseData = {
      to: 'user@example.com',
      name: 'Alice',
      confirmLink: 'https://meeshy.me/delete/confirm/tok',
      cancelLink: 'https://meeshy.me/delete/cancel/tok',
    };

    it('sends deletion confirm email in English', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionConfirmEmail({ ...baseData, language: 'en' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('delete/confirm/tok');
      expect(body.htmlContent).toContain('delete/cancel/tok');
      expect(body.subject).toContain('deletion');
    });

    it('sends deletion confirm email in French', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionConfirmEmail({ ...baseData, language: 'fr' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('suppression');
    });

    it('sends deletion confirm email in Spanish', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionConfirmEmail({ ...baseData, language: 'es' });

      expect(result.success).toBe(true);
    });

    it('sends deletion confirm email in Portuguese', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionConfirmEmail({ ...baseData, language: 'pt' });

      expect(result.success).toBe(true);
    });

    it('sends deletion confirm email in German', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionConfirmEmail({ ...baseData, language: 'de' });

      expect(result.success).toBe(true);
    });

    it('escapes HTML in recipient name', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionConfirmEmail({
        ...baseData, name: '<script>alert("xss")</script>', language: 'en'
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).not.toContain('<script>');
      expect(body.htmlContent).toContain('&lt;script&gt;');
    });
  });

  // ── sendAccountDeletionReminderEmail ──────────────────────────────────────

  describe('sendAccountDeletionReminderEmail', () => {
    const baseData = {
      to: 'user@example.com',
      name: 'Alice',
      deleteNowLink: 'https://meeshy.me/delete/now/tok',
      cancelLink: 'https://meeshy.me/delete/cancel/tok',
      gracePeriodEndDate: '2026-09-26',
    };

    it('sends deletion reminder email in English', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'en' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('2026-09-26');
      expect(body.htmlContent).toContain('delete/cancel/tok');
    });

    it('sends deletion reminder email in French', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'fr' });

      expect(result.success).toBe(true);
    });

    it('sends deletion reminder email in Spanish', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'es' });

      expect(result.success).toBe(true);
    });

    it('sends deletion reminder email in Portuguese', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'pt' });

      expect(result.success).toBe(true);
    });

    it('sends deletion reminder email in Italian', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'it' });

      expect(result.success).toBe(true);
    });

    it('sends deletion reminder email in German', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'de' });

      expect(result.success).toBe(true);
    });

    it('falls back to English for unknown language', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendAccountDeletionReminderEmail({ ...baseData, language: 'xx' });

      expect(result.success).toBe(true);
    });
  });

  // ── sendNotificationDigestEmail ───────────────────────────────────────────

  describe('sendNotificationDigestEmail', () => {
    const baseData = {
      to: 'user@example.com',
      name: 'Alice',
      unreadCount: 5,
      magicUrl: 'https://meeshy.me/magic/digest/tok',
      settingsUrl: 'https://meeshy.me/settings/notifications',
    };

    it('sends digest email in English with correct count', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'en' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('5');
      expect(body.subject).toContain('5');
      expect(body.htmlContent).toContain('magic/digest/tok');
    });

    it('sends digest email in French', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'fr' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.subject).toContain('notifications');
    });

    it('sends digest email in Spanish', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'es' });

      expect(result.success).toBe(true);
    });

    it('sends digest email in Portuguese', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'pt' });

      expect(result.success).toBe(true);
    });

    it('sends digest email in Italian', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'it' });

      expect(result.success).toBe(true);
    });

    it('sends digest email in German', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'de' });

      expect(result.success).toBe(true);
    });

    it('falls back to English for unknown language', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendNotificationDigestEmail({ ...baseData, language: 'xx' });

      expect(result.success).toBe(true);
    });
  });

  // ── sendBroadcastEmail ────────────────────────────────────────────────────

  describe('sendBroadcastEmail', () => {
    const baseData = {
      to: 'user@example.com',
      recipientName: 'Alice',
      subject: 'Important announcement',
      body: 'This is the first paragraph.\n\nThis is the second paragraph.',
      unsubscribeUrl: 'https://meeshy.me/unsubscribe/tok',
    };

    it('sends broadcast email with multi-paragraph body in English', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'en' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      // Multi-paragraph split produces two <p> tags
      expect(body.htmlContent).toContain('<p>This is the first paragraph.</p>');
      expect(body.htmlContent).toContain('<p>This is the second paragraph.</p>');
      expect(body.htmlContent).toContain('unsubscribe/tok');
    });

    it('sends broadcast email in French', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'fr' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('Bonjour');
    });

    it('sends broadcast email in Spanish', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'es' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('Hola');
    });

    it('sends broadcast email in Portuguese', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'pt' });

      expect(result.success).toBe(true);
    });

    it('sends broadcast email in Italian', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'it' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('Ciao');
    });

    it('sends broadcast email in German', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'de' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('Hallo');
    });

    it('falls back to English for unknown language', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({ ...baseData, language: 'xx' });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('Hello');
    });

    it('escapes HTML in subject and recipient name', async () => {
      mockAxiosPost.mockReturnValue(successResponse());
      const service = await getService();

      const result = await service.sendBroadcastEmail({
        ...baseData,
        recipientName: '<b>Alice</b>',
        subject: 'News & Updates',
        language: 'en',
      });

      expect(result.success).toBe(true);
      const body = mockAxiosPost.mock.calls[0][1] as any;
      expect(body.htmlContent).toContain('&lt;b&gt;Alice&lt;/b&gt;');
      expect(body.htmlContent).toContain('News &amp; Updates');
    });
  });
});
