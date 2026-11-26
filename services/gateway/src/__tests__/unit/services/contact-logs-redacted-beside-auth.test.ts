/**
 * Ce qui part À CÔTÉ du renvoi de vérification ne journalise ni l'adresse ni
 * le numéro en clair (#16049).
 *
 * `AuthService.resendVerificationEmail` passe par `EmailService.sendEmail`,
 * et `/send-phone-code` · `/verify-phone` par `auth/phone-verification` : ces
 * deux étages écrivaient le destinataire en clair au niveau info/warn, sous
 * les journaux déjà masqués de la route et du service.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';

const journal: unknown[][] = [];
const record = (...args: unknown[]): void => {
  journal.push(args);
};
const childLogger = { info: record, debug: record, warn: record, error: record };

const journalText = (): string =>
  journal.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');

const originalEnv = { ...process.env };
const mockAxiosPost = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const loggerModule = () => ({ enhancedLogger: { child: jest.fn(() => childLogger) } });

async function emailService(env: Record<string, string | undefined>) {
  delete process.env.MEESHY_ENV;
  delete process.env.BREVO_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  Object.entries(env).forEach(([k, v]) => {
    if (v !== undefined) process.env[k] = v;
  });
  jest.resetModules();
  jest.doMock('../../../utils/logger-enhanced', loggerModule);
  jest.doMock('axios', () => ({ __esModule: true, default: { post: mockAxiosPost } }));
  const { EmailService } = await import('../../../services/EmailService');
  return new EmailService();
}

async function phoneVerification() {
  jest.resetModules();
  jest.doMock('../../../utils/logger-enhanced', loggerModule);
  jest.doMock('../../../services/SmsService', () => ({
    smsService: { sendVerificationCode: jest.fn(async () => ({ success: true, provider: 'p', messageId: 'm' })) },
  }));
  return import('../../../services/auth/phone-verification');
}

const verification = {
  to: 'alice.martin@exemple.com',
  name: 'Alice',
  verificationLink: 'https://meeshy.me/auth/verify-email?token=t',
  verificationCode: '123456',
  expiryHours: 24,
  language: 'fr',
};

const PHONE = '+33612345678';

const prismaReturning = (user: Record<string, unknown> | null) => ({
  user: {
    findFirst: jest.fn(async () => user),
    update: jest.fn(async () => user),
  },
});

beforeEach(() => {
  journal.length = 0;
  mockAxiosPost.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('EmailService — le destinataire n’est pas journalisé en clair (#16049)', () => {
  it('un envoi réussi ne journalise pas l’adresse', async () => {
    mockAxiosPost.mockResolvedValue({ status: 201, data: { messageId: 'm-1' } });
    const service = await emailService({ BREVO_API_KEY: 'k' });

    const result = await service.sendEmailVerification(verification);

    expect(result.success).toBe(true);
    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('alice.martin');
    expect(journalText()).not.toContain('exemple.com');
  });

  it('un échec de tous les fournisseurs ne journalise pas l’adresse', async () => {
    mockAxiosPost.mockRejectedValue(new Error('boom'));
    const service = await emailService({ BREVO_API_KEY: 'k' });

    await service.sendEmailVerification(verification);

    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('alice.martin');
  });

  it('l’absence de fournisseur ne journalise pas l’adresse', async () => {
    const service = await emailService({});

    await service.sendEmailVerification(verification);

    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('alice.martin');
  });
});

describe('auth/phone-verification — le numéro n’est pas journalisé en clair (#16049)', () => {
  it('un numéro inconnu ne journalise pas le numéro', async () => {
    const { sendPhoneVerificationCode } = await phoneVerification();

    await sendPhoneVerificationCode(prismaReturning(null) as never, PHONE);

    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('612345');
  });

  it('un numéro vérifié ne journalise pas le numéro', async () => {
    const { verifyPhoneCode } = await phoneVerification();
    const user = {
      id: 'user-1',
      phoneNumber: PHONE,
      phoneVerificationCode: crypto.createHash('sha256').update('123456').digest('hex'),
      phoneVerifiedAt: null,
    };

    const result = await verifyPhoneCode(prismaReturning(user) as never, PHONE, '123456', {
      engagement: { recordActivity: jest.fn(async () => undefined) } as never,
    });

    expect(result.success).toBe(true);
    expect(journal.length).toBeGreaterThan(0);
    expect(journalText()).not.toContain('612345');
  });
});
