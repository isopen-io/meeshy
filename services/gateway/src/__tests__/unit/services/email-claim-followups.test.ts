/**
 * Les suites de la revendication d'adresse (#8227, après #8214).
 *
 * 1. L'e-mail envoyé à l'adresse revendiquée DIT qu'en saisir le code la
 *    retire à un compte existant — dans chaque langue des e-mails.
 * 2. Une revendication jamais prouvée EXPIRE et libère son pseudo (balayage),
 *    sans toucher un compte actif ni une revendication encore vivante.
 *
 * Base en mémoire qui tient l'index unique (`helpers/email-claim-store.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async (p: string) => `hash(${p})`),
}));
const mockSendViaBrevo = jest.fn(async (..._args: unknown[]) => ({ success: true, messageId: 'm-1' }));
jest.mock('../../../services/email/providers', () => ({
  sendViaBrevo: (...args: unknown[]) => mockSendViaBrevo(...args),
  sendViaSendGrid: jest.fn(),
  sendViaMailgun: jest.fn(),
}));

import { registerAccount, type RegistrationDeps } from '../../../services/auth/registration.service';
import { sweepAbandonedEmailClaims } from '../../../services/auth/email-claim';
import { CLAIM_WARNING } from '../../../services/email/claim-warning';
import { EmailService } from '../../../services/EmailService';
import { CleanupExpiredTokens } from '../../../jobs/cleanup-expired-tokens';
import { emailClaimStore, type EmailClaimStore } from '../../helpers/email-claim-store';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const ADRESSE = 'marie@example.com';
const NOW = new Date('2026-10-01T12:00:00.000Z');

const detenteur = () => ({
  id: 'ancien',
  username: 'mariette',
  displayName: 'Mariette Dupont',
  avatar: null,
  email: ADRESSE,
  password: 'hash(ancien-secret)',
  phoneNumber: null,
  isActive: true,
  emailVerifiedAt: null,
  emailVerificationToken: sha256('lien-ancien'),
  emailVerificationCode: sha256('111111'),
  emailVerificationExpiry: new Date(Date.now() + 60_000),
});

const deps = (store: EmailClaimStore) => {
  const sendEmailVerification = jest.fn(async (_p: Record<string, unknown>) => ({ success: true }));
  const d: RegistrationDeps = {
    prisma: store.prisma as never,
    emailService: { sendEmailVerification } as never,
    frontendUrl: 'https://meeshy.test',
    toSocketIOUser: (u) => u as never,
    verificationToken: () => ({ raw: 'lien-1', hash: sha256('lien-1') }),
    verificationCode: () => '222222',
  };
  return { d, sendEmailVerification };
};

beforeEach(() => {
  process.env.BREVO_API_KEY = 'cle-de-test';
  mockSendViaBrevo.mockClear();
});

describe("l'e-mail de revendication dit ce que le code va faire", () => {
  it("la revendication demande l'avertissement ; une inscription ordinaire, non", async () => {
    const store = emailClaimStore([detenteur()]);
    const revendication = deps(store);
    await registerAccount(revendication.d, { email: ADRESSE, username: 'marie_vraie', password: 'Xk9$mQ2vLp8#nR4wZ', claimEmail: true });
    expect(revendication.sendEmailVerification.mock.calls[0]?.[0]).toMatchObject({ to: ADRESSE, claim: true });

    const libre = emailClaimStore([]);
    const ordinaire = deps(libre);
    await registerAccount(ordinaire.d, { email: 'neuve@example.com', username: 'neuve', password: 'Xk9$mQ2vLp8#nR4wZ' });
    expect(ordinaire.sendEmailVerification.mock.calls[0]?.[0]).not.toHaveProperty('claim');
  });

  it.each(Object.keys(CLAIM_WARNING))('%s : le corps HTML et le texte portent l’avertissement', async (langue) => {
    const service = new EmailService({ recipientLookup: async () => 'unverified' });
    await service.sendEmailVerification({ to: ADRESSE, name: 'Marie', verificationLink: 'https://x/v', verificationCode: '222222', expiryHours: 24, language: langue, claim: true });

    const envoi = mockSendViaBrevo.mock.calls[0]?.[2] as { html: string; text: string };
    const avertissement = CLAIM_WARNING[langue as keyof typeof CLAIM_WARNING];
    expect(envoi.html).toContain(avertissement);
    expect(envoi.text).toContain(avertissement);
  });

  it('le français nomme le retrait de l’adresse à un compte existant', () => {
    expect(CLAIM_WARNING.fr).toMatch(/retire.*adresse.*compte existant/i);
  });

  it('les six langues des e-mails sont couvertes', () => {
    expect(Object.keys(CLAIM_WARNING).sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt']);
  });

  it("une vérification ordinaire ne porte pas l'avertissement", async () => {
    const service = new EmailService({ recipientLookup: async () => 'unverified' });
    await service.sendEmailVerification({ to: ADRESSE, name: 'Marie', verificationLink: 'https://x/v', expiryHours: 24, language: 'fr' });
    expect((mockSendViaBrevo.mock.calls[0]?.[2] as { html: string }).html).not.toContain(CLAIM_WARNING.fr);
  });
});

describe('une revendication abandonnée ne laisse rien derrière elle', () => {
  const revendiquant = (id: string, expiry: Date | null, extra: Record<string, unknown> = {}) => ({
    id,
    username: `pseudo_${id}`,
    email: `claim-${id}@claiming.meeshy.invalid`,
    claimedEmail: ADRESSE,
    isActive: false,
    phoneNumber: '+33612345678',
    searchTokens: [`pseudo_${id}`],
    emailVerificationToken: sha256(`lien-${id}`),
    emailVerificationCode: sha256('333333'),
    emailVerificationExpiry: expiry,
    ...extra,
  });

  it('une revendication EXPIRÉE libère son pseudo, son numéro et ses clés', async () => {
    const store = emailClaimStore([revendiquant('perimee', new Date(NOW.getTime() - 1000))]);

    const retirees = await sweepAbandonedEmailClaims(store.prisma as never, NOW);

    expect(retirees).toBe(1);
    expect(store.byId('perimee')).toMatchObject({
      username: 'claim-perimee',
      phoneNumber: null,
      searchTokens: [],
      emailVerificationToken: null,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
      isActive: false,
    });
  });

  it('le pseudo libéré se reprend à l’inscription suivante', async () => {
    const store = emailClaimStore([revendiquant('perimee', new Date(NOW.getTime() - 1000))]);
    await sweepAbandonedEmailClaims(store.prisma as never, NOW);

    const { d } = deps(store);
    await expect(registerAccount(d, { email: 'autre@example.com', username: 'pseudo_perimee', password: 'Xk9$mQ2vLp8#nR4wZ' })).resolves.toBeTruthy();
  });

  it('une revendication encore VIVANTE est laissée', async () => {
    const store = emailClaimStore([revendiquant('vivante', new Date(NOW.getTime() + 60_000))]);

    await expect(sweepAbandonedEmailClaims(store.prisma as never, NOW)).resolves.toBe(0);
    expect(store.byId('vivante')).toMatchObject({ username: 'pseudo_vivante', phoneNumber: '+33612345678' });
  });

  it('un compte ACTIF n’est jamais touché, même avec une échéance passée', async () => {
    const store = emailClaimStore([revendiquant('actif', new Date(NOW.getTime() - 1000), { isActive: true, claimedEmail: null })]);

    await expect(sweepAbandonedEmailClaims(store.prisma as never, NOW)).resolves.toBe(0);
    expect(store.byId('actif')).toMatchObject({ username: 'pseudo_actif' });
  });
});

describe('le balayage tourne avec le nettoyage périodique des jetons', () => {
  it('CleanupExpiredTokens éteint les revendications expirées, même si les jetons de réinitialisation lèvent', async () => {
    const store = emailClaimStore([
      {
        id: 'perimee',
        username: 'pseudo_perimee',
        email: 'claim-perimee@claiming.meeshy.invalid',
        claimedEmail: ADRESSE,
        isActive: false,
        emailVerificationExpiry: new Date(Date.now() - 1000),
      },
    ]);
    const prisma = {
      ...store.prisma,
      passwordResetToken: { deleteMany: jest.fn(async () => { throw new Error('mongo'); }) },
    };

    await new CleanupExpiredTokens(prisma as never).runNow();

    expect(store.byId('perimee')).toMatchObject({ username: 'claim-perimee' });
  });
});
