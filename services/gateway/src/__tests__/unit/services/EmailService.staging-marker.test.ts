/**
 * UN E-MAIL DE STAGING SE RECONNAÎT AU PREMIER COUP D'ŒIL (#8036).
 *
 * Directive porteur 2026-09-26 : « activer l'envoi d'email en staging avec un
 * détail permettant de détecter que c'est un email de test en staging ».
 *
 * Le marquage vit au point UNIQUE d'envoi (`sendEmail`) : il couvre donc tous
 * les gabarits, y compris ceux qui n'existent pas encore. Témoins par ce que
 * le FOURNISSEUR reçoit — le sujet, le HTML, le texte — sur deux gabarits.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const originalEnv = { ...process.env };
const mockAxiosPost = jest.fn<any>();

async function serviceWithEnv(env: Record<string, string | undefined>) {
  delete process.env.MEESHY_ENV;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  process.env.BREVO_API_KEY = 'test-key';
  Object.entries(env).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  jest.resetModules();
  jest.doMock('axios', () => ({ __esModule: true, default: { post: mockAxiosPost } }));
  const { EmailService } = await import('../../../services/EmailService');
  return new EmailService();
}

const envoye = () => mockAxiosPost.mock.calls[0]?.[1] as { subject: string; htmlContent: string; textContent: string };

const verification = {
  to: 'marie@example.com',
  name: 'Marie',
  verificationLink: 'https://staging.meeshy.me/auth/verify-email?token=t&email=marie%40example.com',
  verificationCode: '123456',
  expiryHours: 24,
  language: 'fr',
};

beforeEach(() => {
  mockAxiosPost.mockReset();
  mockAxiosPost.mockResolvedValue({ status: 201, data: { messageId: 'm-1' } });
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('MEESHY_ENV=staging', () => {
  it('préfixe le sujet par [STAGING]', async () => {
    const service = await serviceWithEnv({ MEESHY_ENV: 'staging' });
    await service.sendEmailVerification(verification);

    expect(envoye().subject.startsWith('[STAGING] ')).toBe(true);
  });

  it('pose un bandeau visible EN TÊTE du corps HTML', async () => {
    const service = await serviceWithEnv({ MEESHY_ENV: 'staging' });
    await service.sendEmailVerification(verification);
    const html = envoye().htmlContent;
    const bandeau = html.indexOf('Email de TEST');

    expect(bandeau).toBeGreaterThan(-1);
    expect(html).toContain('environnement staging, ignorez-le si vous n’attendiez rien');
    expect(bandeau).toBeLessThan(html.indexOf('class="container"'));
  });

  it('préfixe le texte brut', async () => {
    const service = await serviceWithEnv({ MEESHY_ENV: 'staging' });
    await service.sendEmailVerification(verification);

    expect(envoye().textContent.startsWith('[STAGING] Email de TEST')).toBe(true);
  });

  it('marque TOUS les gabarits — le code de connexion aussi', async () => {
    const service = await serviceWithEnv({ MEESHY_ENV: 'staging' });
    await service.sendLoginCodeEmail({
      to: 'marie@example.com',
      name: 'Marie',
      code: '123456',
      link: 'https://staging.meeshy.me/auth/verify-email?token=t&email=m',
      expiryMinutes: 15,
      language: 'fr',
    });

    expect(envoye().subject).toBe('[STAGING] Votre code de connexion - Meeshy');
    expect(envoye().htmlContent).toContain('Email de TEST');
  });
});

describe('hors staging', () => {
  it.each([undefined, 'production', 'Staging-like'])('MEESHY_ENV=%s : aucun marquage', async (valeur) => {
    const service = await serviceWithEnv({ MEESHY_ENV: valeur });
    await service.sendEmailVerification(verification);

    expect(envoye().subject.startsWith('[STAGING]')).toBe(false);
    expect(envoye().htmlContent).not.toContain('Email de TEST');
    expect(envoye().textContent).not.toContain('[STAGING]');
  });
});
