/**
 * « Mot de passe oublié » pour un compte SANS mot de passe (#6642).
 *
 * Un compte créé par e-mail seul (`registration.service.ts` écrit
 * `password: null`, #6424) entre par lien magique — et `MagicLinkService`
 * envoie ses liens à une adresse NON vérifiée. La garde « adresse non vérifiée
 * ⇒ aucun lien » de `requestPasswordReset` ne protégeait donc rien pour ce
 * compte : elle le privait seulement d'un mot de passe, en silence.
 *
 * Trois questions :
 *  1. le lien part-il, et la garde tient-elle pour un compte AVEC mot de passe ?
 *  2. le hash lu pour décider sort-il À CÔTÉ ?
 *  3. consommer le lien prouve-t-il la boîte — et SEULEMENT quand il y a été
 *     livré ? Le parcours SMS émet un jeton du même format vers la même
 *     `completePasswordReset` : il prouve le téléphone, jamais la boîte. Le
 *     témoin fait donc se rencontrer les DEUX productions réelles.
 *
 * Fichier séparé : `PasswordResetService.test.ts` est gelé au cliquet de taille
 * des suites (`gateway-test-file-size-budget.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: async () => '$2b$12$hash-du-mot-de-passe-defini',
  verifyPassword: async () => false
}));

import { PasswordResetService } from '../../../services/PasswordResetService';
import { PhonePasswordResetService } from '../../../services/PhonePasswordResetService';

type Row = Record<string, unknown>;

const HASH_EN_BASE = '$2b$12$hash-stocke-qui-ne-doit-jamais-sortir';
const HASH_NEUF = '$2b$12$hash-du-mot-de-passe-defini';
const NOUVEAU_MOT_DE_PASSE = 'Kx7#pQ2!vL9@zR4$wN6%';
const CODE_SMS = '482913';
const ADRESSE = 'awa@example.com';
const IP = '203.0.113.7';

const makeAccount = (overrides: Row = {}): Row => ({
  id: '64b000000000000000000001',
  email: ADRESSE,
  emailVerifiedAt: null,
  password: null,
  lockedUntil: null,
  passwordResetAttempts: 0,
  lastPasswordResetAttempt: null,
  firstName: 'Awa',
  lastName: 'Diallo',
  twoFactorSecret: null,
  twoFactorEnabledAt: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...overrides
});

const makeHarness = (account: Row) => {
  const tokens: Row[] = [];
  const tx = {
    user: { update: jest.fn(async (_args: { where: Row; data: Row }) => ({})) },
    passwordHistory: { create: jest.fn(async (_args: Row) => ({})) },
    passwordResetToken: { update: jest.fn(async (_args: Row) => ({})) },
    userSession: { updateMany: jest.fn(async (_args: Row) => ({ count: 0 })) }
  };
  const prisma = {
    user: {
      findFirst: jest.fn(async (_args: { where: Row; select: Row }) => account),
      findUnique: jest.fn(async (_args: Row) => ({
        lockedUntil: null,
        lastLoginDevice: null,
        lastLoginLocation: null,
        lastActiveAt: null
      })),
      update: jest.fn(async (_args: { where: Row; data: Row }) => ({}))
    },
    passwordResetToken: {
      updateMany: jest.fn(async (_args: Row) => ({ count: 0 })),
      count: jest.fn(async (_args: Row) => 0),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: `reset-${tokens.length + 1}`, usedAt: null, isRevoked: false, ...data };
        tokens.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { tokenHash: string }; include: { user: { select: Row } } }) => {
          const row = tokens.find((candidate) => candidate.tokenHash === where.tokenHash);
          return row ? { ...row, user: account } : null;
        }
      )
    },
    phonePasswordResetToken: {
      findUnique: jest.fn(async (_args: Row) => ({
        id: 'phone-1',
        userId: account.id,
        codeHash: crypto.createHash('sha256').update(CODE_SMS).digest('hex'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
        isRevoked: false,
        verificationStep: 'CODE_PENDING',
        codeAttempts: 0,
        user: { id: account.id, email: account.email }
      })),
      updateMany: jest.fn(async (_args: Row) => ({ count: 1 })),
      update: jest.fn(async (_args: Row) => ({}))
    },
    passwordHistory: { findMany: jest.fn(async (_args: Row) => []) },
    securityEvent: { create: jest.fn(async (_args: { data: Row }) => ({})) },
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx))
  };
  const cache = {
    get: jest.fn(async (_key: string) => null),
    set: jest.fn(async (_key: string, _value: string, _ttl: number) => undefined),
    setnx: jest.fn(async (_key: string, _value: string, _ttl: number) => true),
    del: jest.fn(async (_key: string) => undefined)
  };
  const email = {
    sendPasswordResetEmail: jest.fn(async (_data: Row) => ({ success: true })),
    sendPasswordChangedEmail: jest.fn(async (_data: Row) => ({ success: true })),
    sendSecurityAlertEmail: jest.fn(async (_data: Row) => ({ success: true }))
  };
  const geo = { lookup: jest.fn(async (_ip: string) => null) };
  const service = new PasswordResetService(prisma as never, cache as never, email as never, geo as never, '');
  const phone = new PhonePasswordResetService(prisma as never, cache as never, {} as never, geo as never);

  return { service, phone, prisma, tx, email, tokens };
};

type Harness = ReturnType<typeof makeHarness>;

const demander = (harness: Harness) =>
  harness.service.requestPasswordReset({ email: ADRESSE, ipAddress: IP, userAgent: 'jest' });

const jetonDuLien = (harness: Harness): string => {
  const envoi = harness.email.sendPasswordResetEmail.mock.calls.at(-1)?.[0];
  return new URL(String(envoi?.resetLink), 'https://meeshy.test').searchParams.get('token') ?? '';
};

const jetonDuParcoursSms = async (harness: Harness): Promise<string> => {
  const { resetToken } = await harness.phone.verifyCode({
    tokenId: 'phone-1',
    code: CODE_SMS,
    ipAddress: IP,
    userAgent: 'jest'
  });
  return resetToken ?? '';
};

const definir = (harness: Harness, token: string) =>
  harness.service.completePasswordReset({
    token,
    newPassword: NOUVEAU_MOT_DE_PASSE,
    confirmPassword: NOUVEAU_MOT_DE_PASSE,
    ipAddress: IP,
    userAgent: 'jest'
  });

const ecritureDuCompte = (harness: Harness): Row => harness.tx.user.update.mock.calls.at(-1)?.[0]?.data ?? {};

const verifieeLe = new Date('2026-01-01T00:00:00.000Z');

describe('« Mot de passe oublié » — un compte SANS mot de passe reçoit son lien (#6642)', () => {
  it("envoie le lien à un compte sans mot de passe dont l'adresse n'a jamais été vérifiée", async () => {
    const harness = makeHarness(makeAccount());

    const reponse = await demander(harness);

    expect(reponse.success).toBe(true);
    expect(harness.email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(harness.email.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ADRESSE, intent: 'set', language: 'fr' })
    );
  });

  it("garde la porte fermée à un compte AVEC mot de passe dont l'adresse n'est pas vérifiée", async () => {
    const harness = makeHarness(makeAccount({ password: HASH_EN_BASE }));

    await demander(harness);

    expect(harness.email.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(harness.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(harness.prisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'PASSWORD_RESET_UNVERIFIED_EMAIL' })
      })
    );
  });

  it('annonce une RÉINITIALISATION à un compte qui a déjà un mot de passe', async () => {
    const harness = makeHarness(makeAccount({ password: HASH_EN_BASE, emailVerifiedAt: verifieeLe }));

    await demander(harness);

    expect(harness.email.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ADRESSE, intent: 'reset' })
    );
  });

  it("la requête demande la colonne `password` — un double rend ce qu'on lui dit, pas ce que le select ramène", async () => {
    const harness = makeHarness(makeAccount());

    await demander(harness);

    expect(harness.prisma.user.findFirst.mock.calls[0]?.[0]?.select?.password).toBe(true);
  });

  it('le hash lu pour décider ne sort jamais : ni dans le courriel, ni dans les événements, ni dans le jeton', async () => {
    const harness = makeHarness(makeAccount({ password: HASH_EN_BASE, emailVerifiedAt: verifieeLe }));

    await demander(harness);

    expect(harness.email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const sortant = JSON.stringify([
      harness.email.sendPasswordResetEmail.mock.calls,
      harness.prisma.securityEvent.create.mock.calls,
      harness.tokens
    ]);
    expect(sortant).not.toContain(HASH_EN_BASE);
  });
});

describe('consommer le lien livré par e-mail prouve la possession de la boîte (#6642)', () => {
  it('pose emailVerifiedAt dans la MÊME transaction que le premier mot de passe', async () => {
    const harness = makeHarness(makeAccount());
    await demander(harness);

    const resultat = await definir(harness, jetonDuLien(harness));

    expect(resultat.success).toBe(true);
    expect(ecritureDuCompte(harness)).toEqual(
      expect.objectContaining({ password: HASH_NEUF, emailVerifiedAt: expect.any(Date) })
    );
    expect(harness.prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailVerifiedAt: expect.anything() }) })
    );
  });

  it("ne réécrit pas la date d'une adresse déjà vérifiée", async () => {
    const harness = makeHarness(makeAccount({ password: HASH_EN_BASE, emailVerifiedAt: verifieeLe }));
    await demander(harness);

    const resultat = await definir(harness, jetonDuLien(harness));

    expect(resultat.success).toBe(true);
    expect(ecritureDuCompte(harness)).toEqual(expect.objectContaining({ password: HASH_NEUF }));
    expect(ecritureDuCompte(harness)).not.toHaveProperty('emailVerifiedAt');
  });

  it('un jeton émis par le parcours SMS prouve le téléphone, jamais la boîte : emailVerifiedAt reste nul', async () => {
    const harness = makeHarness(makeAccount());

    const resultat = await definir(harness, await jetonDuParcoursSms(harness));

    expect(resultat.success).toBe(true);
    expect(ecritureDuCompte(harness)).toEqual(expect.objectContaining({ password: HASH_NEUF }));
    expect(ecritureDuCompte(harness)).not.toHaveProperty('emailVerifiedAt');
  });

  it('la lecture du jeton ramène emailVerifiedAt — sans elle, la condition ne verrait jamais la colonne', async () => {
    const harness = makeHarness(makeAccount());
    await demander(harness);

    await definir(harness, jetonDuLien(harness));

    const lecture = harness.prisma.passwordResetToken.findUnique.mock.calls[0]?.[0];
    expect(lecture?.include?.user?.select?.emailVerifiedAt).toBe(true);
  });
});
