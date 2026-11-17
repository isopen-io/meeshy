/**
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';

const originalEnv = { ...process.env };
const mockAxiosPost = jest.fn<(...args: unknown[]) => Promise<unknown>>();

async function invitationService() {
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  process.env.BREVO_API_KEY = 'brevo-key';
  jest.resetModules();
  jest.doMock('axios', () => ({ __esModule: true, default: { post: mockAxiosPost } }));
  (await import('../../../services/email/recipient-policy')).registerEmailRecipientLookup(async () => 'verified');
  const { EmailService } = await import('../../../services/EmailService');
  return new EmailService();
}

describe('EmailService — e-mail d’invitation et lien de désinscription (#19207)', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    mockAxiosPost.mockReset();
  });

  it('porte le lien « Ne plus recevoir d’invitation » quand il est fourni', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = await invitationService();
    mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'inv-003' }, status: 200, headers: {} });

    await service.sendInvitationEmail({
      to: 'new@example.com',
      senderName: 'Alice',
      downloadUrl: 'https://meeshy.me/signup/affiliate/aff_x',
      optOutUrl: 'https://meeshy.me/invitations/opt-out?address=abc&key=def',
      language: 'fr',
    });

    const payload = JSON.stringify(mockAxiosPost.mock.calls[mockAxiosPost.mock.calls.length - 1]);
    expect(payload).toContain('https://meeshy.me/invitations/opt-out?address=abc&key=def');
  });

  it('ne porte aucun lien de désinscription quand il n’est pas fourni', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = await invitationService();
    mockAxiosPost.mockResolvedValueOnce({ data: { messageId: 'inv-004' }, status: 200, headers: {} });

    await service.sendInvitationEmail({
      to: 'new@example.com',
      senderName: 'Alice',
      downloadUrl: 'https://meeshy.me/signup/affiliate/aff_x',
      language: 'fr',
    });

    const payload = JSON.stringify(mockAxiosPost.mock.calls[mockAxiosPost.mock.calls.length - 1]);
    expect(payload).not.toContain('opt-out');
  });
});
