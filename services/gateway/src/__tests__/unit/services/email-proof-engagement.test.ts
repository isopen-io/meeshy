/**
 * #8959 — prouver son adresse par son GESTE (code, lien de vérification, lien
 * magique, réinitialisation, revendication) crédite `profile.email_verified`,
 * et seulement quand l'adresse devient prouvée : une adresse déjà vérifiée ne
 * recrédite rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async (p: string) => `hash(${p})`),
}));

import { proveEmailAddress, settleEmailAddressProof } from '../../../services/auth/email-address-proof';
import { verifyEmailProof } from '../../../services/auth/email-proof.service';
import { registerAccount, type RegistrationDeps } from '../../../services/auth/registration.service';
import { emailClaimStore, type EmailClaimStore } from '../../helpers/email-claim-store';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const ADRESSE = 'marie@example.com';
const NOW = new Date('2026-09-30T10:00:00.000Z');

const engagementDouble = () => ({ recordActivity: jest.fn<any>(async () => undefined) });

const proofHarness = (emailVerifiedAt: Date | null) => {
  const engagement = engagementDouble();
  const deps = {
    prisma: {
      user: {
        findUnique: jest.fn<any>(async () => ({ emailVerifiedAt })),
        updateMany: jest.fn<any>(async () => ({ count: emailVerifiedAt ? 0 : 1 })),
      },
      emailVerificationWatch: { updateMany: jest.fn<any>(async () => ({ count: 0 })) },
    },
    cache: { del: jest.fn<any>(async () => undefined) },
    engagement,
  };
  return { deps: deps as never, engagement };
};

const detenteur = (extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

async function revendiquer(store: EmailClaimStore): Promise<string[]> {
  const codes: string[] = [];
  const deps: RegistrationDeps = {
    prisma: store.prisma as never,
    emailService: { sendEmailVerification: jest.fn(async () => ({ success: true })) } as never,
    frontendUrl: 'https://meeshy.test',
    toSocketIOUser: (u) => u as never,
    verificationToken: () => ({ raw: 'lien-1', hash: sha256('lien-1') }),
    verificationCode: () => {
      codes.push('654321');
      return '654321';
    },
  };
  await registerAccount(deps, {
    email: ADRESSE,
    username: 'marie_vraie',
    password: 'Xk9$mQ2vLp8#nR4wZ',
    displayName: 'Marie Martin',
    claimEmail: true,
  });
  return codes;
}

describe('#8959 — `profile.email_verified`', () => {
  it('une adresse NEUVEMENT prouvée (lien magique) crédite le compte', async () => {
    const { deps, engagement } = proofHarness(null);

    await proveEmailAddress(deps, { userId: 'user-1', now: NOW });

    expect(engagement.recordActivity).toHaveBeenCalledWith('user-1', 'profile.email_verified');
  });

  it('une adresse déjà prouvée ne recrédite rien', async () => {
    const { deps, engagement } = proofHarness(new Date(0));

    await proveEmailAddress(deps, { userId: 'user-1', now: NOW });
    await settleEmailAddressProof(deps, { userId: 'user-1', now: NOW, newlyProven: false });

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('la suite d\'une preuve écrite ailleurs (réinitialisation) crédite quand elle est neuve', async () => {
    const { deps, engagement } = proofHarness(null);

    await settleEmailAddressProof(deps, { userId: 'user-1', now: NOW, newlyProven: true });

    expect(engagement.recordActivity).toHaveBeenCalledWith('user-1', 'profile.email_verified');
  });

  it('saisir le code de vérification crédite le détenteur', async () => {
    const store = emailClaimStore([detenteur()]);
    const engagement = engagementDouble();

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '111111' }, { engagement });

    expect(resultat).toMatchObject({ success: true, userId: 'ancien' });
    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
    expect(engagement.recordActivity).toHaveBeenCalledWith('ancien', 'profile.email_verified');
  });

  it('un code de CONNEXION sur une adresse déjà vérifiée ne crédite rien', async () => {
    const store = emailClaimStore([detenteur({ emailVerifiedAt: new Date(0) })]);
    const engagement = engagementDouble();

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '111111' }, { engagement });

    expect(resultat).toMatchObject({ success: true, alreadyVerified: true });
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('une revendication prouvée crédite le compte REVENDIQUANT, jamais l’ancien détenteur', async () => {
    const store = emailClaimStore([detenteur()]);
    const [code] = await revendiquer(store);
    const engagement = engagementDouble();

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code }, { engagement });

    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    expect(resultat).toMatchObject({ success: true, userId: nouveau?.id });
    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
    expect(engagement.recordActivity).toHaveBeenCalledWith(nouveau?.id, 'profile.email_verified');
  });

  it('un code faux ne crédite rien', async () => {
    const store = emailClaimStore([detenteur()]);
    const engagement = engagementDouble();

    await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '999999' }, { engagement });

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });
});
